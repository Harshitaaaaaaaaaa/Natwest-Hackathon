import pandas as pd
import numpy as np
from src.core.schema import base_response
from src.models.utils import load_csv, apply_filters, resolve_secure_path, clean_dataframe, build_ui_payload


def comparative_model(payload):
    """
    Comparative analysis: How do different groups compare?
    Ranks all groups on the chosen dimension, shows top vs bottom, and
    optionally compares the current period against a baseline.
    """
    response = base_response()

    try:
        blueprint       = payload["data_blueprint"]
        schema          = blueprint["schema_mapping"]
        metric          = schema.get("metric_col", "Sales")
        date_col        = schema.get("date_col", "Order Date")
        dataset_path    = blueprint["dataset"]
        comparison_type = payload["analytical_intent"].get("comparison_type", "Category")

        # ── Resolve & load ─────────────────────────────────────────
        final_path = resolve_secure_path(dataset_path)
        df         = load_csv(final_path, date_col)

        filters = blueprint.get("execution_scope", {}).get("filters", [])
        df      = apply_filters(df, filters)
        df      = clean_dataframe(df)

        # ── Time frames ────────────────────────────────────────────
        time_frames = blueprint["execution_scope"]["time_frames"]
        current_tf  = time_frames["current"]
        baseline_tf = time_frames.get("baseline", None)

        current_df = df[
            (df[date_col] >= current_tf["start"]) &
            (df[date_col] <= current_tf["end"])
        ].copy()

        if current_df.empty:
            response["warnings"].append(
                f"Time filter ({current_tf['start']} to {current_tf['end']}) returned no data. "
                f"Using full dataset instead."
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

        # ── Pick comparison column ─────────────────────────────────
        dimension_cols = schema.get("dimension_cols", [])
        col = (
            comparison_type
            if comparison_type in current_df.columns
            else next((d for d in dimension_cols if d in current_df.columns), "Category")
        )

        if col not in current_df.columns:
            response["summary"] = f"Comparison dimension '{col}' not found in dataset."
            return response

        current_df[col] = current_df[col].fillna("Unknown")

        # ── Group & rank ───────────────────────────────────────────
        grouped = (
            current_df.groupby(col)[metric]
            .sum()
            .reset_index()
            .sort_values(metric, ascending=False)
        )
        total = float(grouped[metric].sum()) or 1.0

        ranked = build_ui_payload(grouped, label_col=col, val_col=metric, top_n=10)
        response["breakdown"]["category"] = ranked

        # ── Period-over-period comparison if baseline exists ───────
        period_comp = []
        if not baseline_df.empty and col in baseline_df.columns:
            baseline_df[col] = baseline_df[col].fillna("Unknown")
            base_grouped = (
                baseline_df.groupby(col)[metric]
                .sum()
                .reset_index()
            )
            merged = pd.merge(grouped, base_grouped, on=col, how="outer", suffixes=("_cur", "_base")).fillna(0)
            merged["delta"]     = merged[f"{metric}_cur"] - merged[f"{metric}_base"]
            merged["delta_pct"] = merged.apply(
                lambda r: round((r["delta"] / r[f"{metric}_base"]) * 100, 2) if r[f"{metric}_base"] != 0 else 0,
                axis=1
            )
            merged = merged.sort_values("delta", ascending=False)
            for _, row in merged.iterrows():
                period_comp.append({
                    "label":     str(row[col]),
                    "value":     round(float(row[f"{metric}_cur"]), 2),
                    "prev":      round(float(row[f"{metric}_base"]), 2),
                    "delta":     round(float(row["delta"]), 2),
                    "delta_pct": float(row["delta_pct"]),
                })

        # ── Top-2 head-to-head ─────────────────────────────────────
        top = ranked
        if len(top) < 2:
            response["summary"] = "Not enough groups for comparison."
            return response

        val1     = top[0]["value"]
        val2     = top[1]["value"]
        label1   = top[0]["label"]
        label2   = top[1]["label"]
        diff_pct = round(((val1 - val2) / val2) * 100, 2) if val2 != 0 else 0.0

        response["comparison"] = {
            "dimension":      col,
            "items":          [{"label": label1, "value": val1}, {"label": label2, "value": val2}],
            "winner":         label1,
            "loser":          label2,
            "difference_pct": diff_pct,
            "period_comparison": period_comp,
        }

        # ── Key Metrics ────────────────────────────────────────────
        response["key_metrics"] = [
            {"name": f"total_{metric.lower()}", "value": round(total, 2),         "unit": "USD", "type": "currency"},
            {"name": f"top_{col.lower()}_value", "value": val1,                   "unit": "USD", "type": "currency"},
            {"name": f"top_{col.lower()}_share", "value": top[0]["percentage"],   "unit": "%",   "type": "percentage"},
            {"name": f"{label1}_vs_{label2}",    "value": diff_pct,               "unit": "%",   "type": "percentage"},
        ]

        response["trend"] = {
            "direction":        "stable",
            "pattern":          "comparison_based",
            "change_rate":      diff_pct,
            "time_granularity": "contextual",
        }

        # ── Chart data ─────────────────────────────────────────────
        response["chart_data"] = [
            {
                "chart_id":   f"{col.lower().replace(' ', '_')}_comparison",
                "chart_type": "bar",
                "title":      f"{metric} by {col}",
                "x_axis":     [r["label"] for r in ranked],
                "series":     [{"name": metric, "values": [r["value"] for r in ranked]}],
            }
        ]

        # If we have period comparison, add a delta chart
        if period_comp:
            response["chart_data"].append({
                "chart_id":   "period_over_period",
                "chart_type": "bar",
                "title":      f"{metric} — Current vs Baseline by {col}",
                "x_axis":     [r["label"] for r in period_comp],
                "series":     [
                    {"name": "Current",  "values": [r["value"] for r in period_comp]},
                    {"name": "Baseline", "values": [r["prev"]  for r in period_comp]},
                ],
            })

        # ── Recommendations ────────────────────────────────────────
        response["recommendations"] = [
            {
                "action":   f"Invest more in {label1} ({top[0]['percentage']}% share of {metric})",
                "priority": "high",
                "reason":   f"{label1} is the top-performing {col}.",
            },
            {
                "action":   f"Review {label2} — it trails {label1} by {abs(diff_pct)}%.",
                "priority": "medium",
                "reason":   f"Gap of ${abs(val1 - val2):,.2f} presents a growth opportunity.",
            },
        ]

        # ── Interpretable Summary ──────────────────────────────────
        summary = (
            f"{label1} leads all {col}s with ${val1:,.2f} in {metric} "
            f"({top[0]['percentage']}% of total), outperforming {label2} "
            f"(${val2:,.2f}) by {abs(diff_pct)}%."
        )
        response["summary"] = summary
        response["summary_levels"] = {
            "simple":   f"{label1} is the best-performing {col}, with ${val1:,.2f} in {metric}.",
            "medium":   summary,
            "advanced": (
                f"Full {col} comparison for period {current_tf['start']} to {current_tf['end']}: "
                f"Total {metric}=${total:,.2f}. "
                + "; ".join([f"{r['label']}: ${r['value']:,.2f} ({r['percentage']}%)" for r in ranked[:5]])
            ),
        }

        response["confidence"] = 0.92
        response["status"]     = "success"
        return response

    except Exception as e:
        response["status"]  = "error"
        response["message"] = str(e)
        return response