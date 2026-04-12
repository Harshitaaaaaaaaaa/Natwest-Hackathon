import pandas as pd
import numpy as np
from src.core.schema import base_response
from src.models.utils import load_csv, apply_filters, resolve_secure_path, clean_dataframe


def diagnostic_model(payload):
    """
    Diagnostic analysis: Why did it happen?
    Performs root-cause analysis and anomaly detection on the dataset.
    """
    response = base_response()

    try:
        blueprint    = payload["data_blueprint"]
        schema       = blueprint["schema_mapping"]
        metric       = schema.get("metric_col", "Sales")
        date_col     = schema.get("date_col", "Order Date")
        dataset_path = blueprint["dataset"]

        # ── Resolve & load ──────────────────────────────────────────
        final_path = resolve_secure_path(dataset_path)
        df         = load_csv(final_path, date_col)

        if df.empty:
            response["summary"] = "Dataset is empty."
            return response

        filters = blueprint.get("execution_scope", {}).get("filters", [])
        df      = apply_filters(df, filters)
        df      = clean_dataframe(df)

        # ── Dynamic Dimensions ─────────────────────────────────────
        dimensions = schema.get("dimension_cols", [])
        if not dimensions:
            dimensions = df.select_dtypes(include=["object", "category"]).columns.tolist()

        # ── Time frame filtering ───────────────────────────────────
        time_frames = blueprint["execution_scope"]["time_frames"]
        current_tf  = time_frames["current"]
        baseline_tf = time_frames.get("baseline", None)

        current_df = df[
            (df[date_col] >= current_tf["start"]) &
            (df[date_col] <= current_tf["end"])
        ].copy()

        # Safety fallback
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

        # ── Key Metrics ────────────────────────────────────────────
        current_total  = float(current_df[metric].sum())
        baseline_total = float(baseline_df[metric].sum()) if not baseline_df.empty else 0.0

        if baseline_total != 0:
            change_pct = round(((current_total - baseline_total) / baseline_total) * 100, 2)
        else:
            change_pct = 0.0

        direction = "upward" if change_pct > 0 else ("downward" if change_pct < 0 else "stable")

        response["key_metrics"] = [
            {"name": "current_total",  "value": round(current_total, 2),  "unit": "USD", "type": "currency"},
            {"name": "baseline_total", "value": round(baseline_total, 2), "unit": "USD", "type": "currency"},
            {"name": "change_pct",     "value": change_pct,               "unit": "%",   "type": "percentage"},
        ]

        response["trend"] = {
            "direction":   direction,
            "pattern":     "diagnostic_based",
            "change_rate": change_pct,
        }

        if abs(change_pct) > 200:
            response["warnings"].append(
                "Very large percentage change detected — likely due to a very small baseline."
            )

        # ── Root Cause Analysis ────────────────────────────────────
        causes = []

        # --- 1. Inventory / Stock-out check ----------------------
        if "Stock Level" in current_df.columns:
            low_stock    = current_df["Stock Level"] <= 5
            low_stock_ct = int(low_stock.sum())
            low_stock_pct = round((low_stock_ct / max(len(current_df), 1)) * 100, 2)
            if low_stock_pct > 10:
                causes.append({
                    "cause":            "Inventory Shortage / Stock-out",
                    "dimension":        "Stock Level",
                    "impact":           "high" if direction == "downward" else "medium",
                    "contribution_pct": low_stock_pct,
                    "direction":        "decrease" if direction == "downward" else "constraint",
                    "evidence":         f"Low/zero stock detected across {low_stock_ct} orders ({low_stock_pct}% of period transactions).",
                })

        # --- 2. Marketing Campaign attribution -------------------
        if "Marketing Campaign" in current_df.columns:
            camp_grp = (
                current_df.groupby("Marketing Campaign")[metric]
                .sum()
                .reset_index()
                .sort_values(metric, ascending=False)
            )
            top_camp = camp_grp.iloc[0]
            if str(top_camp["Marketing Campaign"]).strip().lower() not in ("none", ""):
                camp_share = round((float(top_camp[metric]) / max(current_total, 1)) * 100, 2)
                causes.append({
                    "cause":            f"Campaign: {top_camp['Marketing Campaign']}",
                    "dimension":        "Marketing Campaign",
                    "impact":           "high" if direction == "upward" else "medium",
                    "contribution_pct": camp_share,
                    "direction":        "increase" if direction == "upward" else "stable",
                    "evidence":         (
                        f"The '{top_camp['Marketing Campaign']}' campaign accounted for "
                        f"${round(float(top_camp[metric]), 2):,.2f} ({camp_share}% of period revenue)."
                    ),
                })

        # --- 3. Structural Variance vs Baseline ------------------
        if not baseline_df.empty:
            for col in dimensions:
                skip_cols = {"Stock Level", "Marketing Campaign", "Customer Channel", "COGS"}
                if col not in current_df.columns or col in skip_cols:
                    continue

                cur_grp  = current_df.groupby(col)[metric].sum().reset_index()
                base_grp = baseline_df.groupby(col)[metric].sum().reset_index()

                merged      = pd.merge(cur_grp, base_grp, on=col, how="outer", suffixes=("_cur", "_base"))
                merged      = merged.fillna(0)
                merged["delta"] = merged[f"{metric}_cur"] - merged[f"{metric}_base"]

                # For downward trend sort ascending (most negative first = biggest drops)
                merged = merged.sort_values("delta", ascending=(direction == "downward"))

                total_delta = merged["delta"].abs().sum() or 1

                for _, row in merged.head(2).iterrows():
                    if abs(row["delta"]) < 1:
                        continue
                    contrib = round((abs(row["delta"]) / total_delta) * 100, 2)
                    arrow   = "decrease" if row["delta"] < 0 else "increase"
                    causes.append({
                        "cause":            str(row[col]),
                        "dimension":        col,
                        "impact":           "high" if abs(row["delta"]) > 0.25 * abs(current_total) else "medium",
                        "contribution_pct": contrib,
                        "direction":        arrow,
                        "evidence":         (
                            f"{row[col]} saw a ${abs(round(float(row['delta']), 2)):,.2f} {arrow} "
                            f"({contrib}% of total variance vs baseline)."
                        ),
                    })
        else:
            # No baseline — analyse current period composition
            response["warnings"].append("No comparison baseline found. Showing current-period composition analysis.")
            for col in dimensions[:3]:
                skip_cols = {"Stock Level", "Marketing Campaign", "COGS"}
                if col not in current_df.columns or col in skip_cols:
                    continue
                grp      = current_df.groupby(col)[metric].sum().reset_index().sort_values(metric, ascending=False)
                top_item = grp.iloc[0]
                share    = round((float(top_item[metric]) / max(current_total, 1)) * 100, 2)
                causes.append({
                    "cause":            str(top_item[col]),
                    "dimension":        col,
                    "impact":           "medium",
                    "contribution_pct": share,
                    "direction":        "dominant factor",
                    "evidence":         (
                        f"{top_item[col]} is the largest {col}, representing "
                        f"${round(float(top_item[metric]), 2):,.2f} ({share}% of total)."
                    ),
                })

        # Deduplicate
        seen, unique_causes = set(), []
        for c in causes:
            if c["cause"] not in seen:
                seen.add(c["cause"])
                unique_causes.append(c)

        response["diagnostics"]["causes"] = unique_causes

        # ── Chart: Impact Waterfall ────────────────────────────────
        if unique_causes:
            top7   = unique_causes[:7]
            labels = [c["cause"] for c in top7]
            values = [c["contribution_pct"] for c in top7]
            response["chart_data"] = [
                {
                    "chart_id":   "diagnostic_cause_breakdown",
                    "chart_type": "bar",
                    "title":      "Key Impact Factors — Contribution %",
                    "x_axis":     labels,
                    "series":     [{"name": "Contribution %", "values": values}],
                }
            ]

        # ── Anomaly Detection ─────────────────────────────────────
        anomalies = []
        run_anomaly = payload.get("computation_tasks", {}).get("run_anomaly_detection", True)
        if run_anomaly and not current_df.empty:
            daily = current_df.groupby(date_col)[metric].sum().reset_index()
            if len(daily) >= 5:
                mean_d = daily[metric].mean()
                std_d  = daily[metric].std() or 1
                daily["z"] = (daily[metric] - mean_d) / std_d
                for _, row in daily[daily["z"].abs() > 2.5].iterrows():
                    anomalies.append({
                        "label":    "Spike" if row["z"] > 0 else "Drop",
                        "value":    round(float(row[metric]), 2),
                        "date":     str(row[date_col].date()),
                        "severity": "high" if abs(row["z"]) > 3.5 else "medium",
                        "metadata": {"z_score": round(float(row["z"]), 2)},
                    })
        response["diagnostics"]["anomalies"] = anomalies

        # ── Interpretable Summary (pre-LLM) ───────────────────────
        top_cause_text = ""
        if unique_causes:
            tc = unique_causes[0]
            top_cause_text = (
                f" The primary driver is '{tc['cause']}' ({tc['dimension']}): {tc['evidence']}"
            )

        change_dir_word = "dropped" if change_pct < 0 else ("grew" if change_pct > 0 else "remained stable")
        baseline_str = f" compared to the baseline of ${baseline_total:,.2f}" if baseline_total else ""

        summary = (
            f"{metric} {change_dir_word} by {abs(change_pct)}% to ${current_total:,.2f}{baseline_str}.{top_cause_text}"
        )

        response["summary"] = summary
        response["summary_levels"] = {
            "simple":   f"{metric} went {change_dir_word} by {abs(change_pct)}%.{' ' + unique_causes[0]['evidence'] if unique_causes else ''}",
            "medium":   summary,
            "advanced": (
                f"{metric}: current=${current_total:,.2f}, baseline=${baseline_total:,.2f}, "
                f"delta={change_pct}%. Root causes: "
                + "; ".join([f"{c['cause']} ({c['contribution_pct']}%)" for c in unique_causes[:4]])
            ),
        }

        response["confidence"] = 0.94
        return response

    except Exception as e:
        response["status"]  = "error"
        response["message"] = str(e)
        return response