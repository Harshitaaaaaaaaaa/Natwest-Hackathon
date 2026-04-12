import os
import pandas as pd
import numpy as np
from src.core.schema import base_response
from src.models.utils import load_csv, apply_filters, resolve_secure_path, clean_dataframe, build_ui_payload


def descriptive_model(payload):
    """
    Descriptive analysis: What happened?
    Computes totals, breakdowns, trends and chart data from the Superstore dataset.
    """
    response = base_response()

    try:
        blueprint  = payload["data_blueprint"]
        schema     = blueprint["schema_mapping"]

        metric     = schema.get("metric_col", "Sales")
        date_col   = schema.get("date_col", "Order Date")
        dataset_path = blueprint["dataset"]

        # ── Resolve path ────────────────────────────────────────────
        final_path = resolve_secure_path(dataset_path)

        # ── Load & prepare ──────────────────────────────────────────
        df = load_csv(final_path, date_col)

        if df.empty:
            response["summary"] = "Dataset is empty."
            return response

        # Apply any explicit filters from the execution plan
        filters = blueprint.get("execution_scope", {}).get("filters", [])
        df = apply_filters(df, filters)
        
        # CLEAN DATA: ensure no np.nan, np.inf that crash json/calculations
        df = clean_dataframe(df)

        # ── Time frame filtering ────────────────────────────────────
        time_frames  = blueprint["execution_scope"]["time_frames"]
        current_tf   = time_frames["current"]
        baseline_tf  = time_frames.get("baseline", None)

        current_df = df[
            (df[date_col] >= current_tf["start"]) &
            (df[date_col] <= current_tf["end"])
        ].copy()

        # SAFETY FALLBACK: If the LLM generated dates outside the dataset range,
        # the filter returns 0 rows. In that case, use the entire dataset.
        if current_df.empty:
            response["warnings"].append(
                f"Time filter ({current_tf['start']} → {current_tf['end']}) returned no data. "
                f"Using full dataset range instead."
            )
            current_df = df.copy()

        baseline_df = (
            df[
                (df[date_col] >= baseline_tf["start"]) &
                (df[date_col] <= baseline_tf["end"])
            ]
            if baseline_tf
            else pd.DataFrame(columns=df.columns)
        )

        # ── Key Metrics ─────────────────────────────────────────────
        current_total  = current_df[metric].sum()
        baseline_total = baseline_df[metric].sum() if not baseline_df.empty else 0

        if baseline_total == 0:
            change_pct = 0
            direction  = "stable"
        else:
            change_pct = ((current_total - baseline_total) / baseline_total) * 100
            direction  = "upward" if change_pct > 0 else ("downward" if change_pct < 0 else "stable")

        change_pct = round(change_pct, 2)

        response["key_metrics"] = [
            {"name": "current_sales",   "value": round(float(current_total), 2),  "unit": "USD", "type": "currency"},
            {"name": "baseline_sales",  "value": round(float(baseline_total), 2), "unit": "USD", "type": "currency"},
            {"name": "change_pct",      "value": change_pct,                       "unit": "%",   "type": "percentage"},
        ]

        if baseline_total == 0:
            response["warnings"].append("No baseline data found for the given date range.")
        elif abs(change_pct) > 200:
            response["warnings"].append(
                "Large percentage change detected — may be due to a low baseline value."
            )

        # ── Trend ───────────────────────────────────────────────────
        response["trend"] = {
            "direction":       direction,
            "pattern":         "sharp_change" if abs(change_pct) > 50 else "steady",
            "change_rate":     change_pct,
            "time_granularity": "monthly",
        }

        # ── Monthly time breakdown ──────────────────────────────────
        current_df["month"] = current_df[date_col].dt.to_period("M").astype(str)
        monthly = (
            current_df.groupby("month")[metric]
            .sum()
            .reset_index()
            .sort_values("month")
        )
        response["breakdown"]["time"] = [
            {"label": row["month"], "value": round(float(row[metric]), 2)}
            for _, row in monthly.iterrows()
        ]

        # ── Dynamic Dimension Breakdowns ────────────────────────────
        dimension_cols = schema.get("dimension_cols", [])
        if not dimension_cols:
            dimension_cols = df.select_dtypes(include=['object', 'category']).columns.tolist()

        # Process the top 4 dimensions from the active schema
        for dim_col in dimension_cols[:4]:
            if dim_col in current_df.columns:
                grp = (
                    current_df.groupby(dim_col)[metric]
                    .sum()
                    .reset_index()
                )
                
                # Use bucket utility to protect frontend UI lengths
                dim_key = dim_col.lower().replace(" ", "_").replace("-", "_")
                response["breakdown"][dim_key] = build_ui_payload(grp, label_col=dim_col, val_col=metric, top_n=7)

        # ── Chart data ──────────────────────────────────────────────
        primary_dim_key = dimension_cols[0].lower().replace(" ", "_").replace("-", "_") if dimension_cols else None
        
        chart_data = [
            {
                "chart_id":   "monthly_trend",
                "chart_type": "line",
                "title":      f"Monthly {metric} Trend",
                "x_axis":     [r["label"] for r in response["breakdown"]["time"]],
                "series":     [{"name": metric, "values": [r["value"] for r in response["breakdown"]["time"]]}],
            }
        ]

        if primary_dim_key and primary_dim_key in response["breakdown"]:
            primary_data = response["breakdown"][primary_dim_key]
            chart_data.append({
                "chart_id":   f"{primary_dim_key}_breakdown",
                "chart_type": "bar",
                "title":      f"{metric} by {dimension_cols[0]}",
                "x_axis":     [r["label"] for r in primary_data],
                "series":     [{"name": metric, "values": [r["value"] for r in primary_data]}],
            })
        
        response["chart_data"] = chart_data

        # ── Recommendations ─────────────────────────────────────────
        recommendations = []
        if primary_dim_key and primary_dim_key in response["breakdown"]:
            for item in response["breakdown"][primary_dim_key][:2]:
                recommendations.append({
                    "action":   f"Focus on growing {item['label']} ({item['percentage']}% of {metric})",
                    "priority": "high" if item["percentage"] > 40 else "medium",
                    "reason":   f"{item['label']} is a top driver of {metric}",
                })
        response["recommendations"] = recommendations

        # ── Interpretable Summary ────────────────────────────────
        top_dim_text = ""
        if primary_dim_key and primary_dim_key in response["breakdown"]:
            top_item = response["breakdown"][primary_dim_key][0]
            top_dim_text = f" Top {dimension_cols[0]}: {top_item['label']} (${top_item['value']:,.2f}, {top_item['percentage']}%)."

        change_dir_word = "grew" if change_pct > 0 else ("dropped" if change_pct < 0 else "remained stable")
        baseline_str = f" compared to the prior period (${baseline_total:,.2f})" if baseline_total else ""

        summary = (
            f"Total {metric} in the selected period is ${current_total:,.2f}{baseline_str}. "
            f"That represents a {abs(change_pct)}% {change_dir_word} trend.{top_dim_text}"
        )

        response["summary"] = summary
        response["summary_levels"] = {
            "simple":   f"{metric} is ${current_total:,.2f} — it {change_dir_word} by {abs(change_pct)}% vs the prior period.{top_dim_text}",
            "medium":   summary,
            "advanced": (
                f"{metric}: ${current_total:,.2f} (period: {current_tf['start']} to {current_tf['end']}), "
                f"baseline: ${baseline_total:,.2f}, delta: {change_pct}%. "
                + ("Breakdowns: " + "; ".join(
                    [f"{r['label']}=${r['value']:,.2f}" for r in (response["breakdown"].get(primary_dim_key) or [])[:4]]
                ) if primary_dim_key else "")
            ),
        }

        response["confidence"] = 0.92
        return response

    except Exception as e:
        response["status"]  = "error"
        response["message"] = str(e)
        return response