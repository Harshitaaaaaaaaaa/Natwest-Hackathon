import numpy as np
import pandas as pd
from src.core.schema import base_response
from src.models.utils import load_csv, apply_filters, resolve_secure_path, augment_time_features, clean_dataframe


def calculate_mape(y_true, y_pred):
    """Mean Absolute Percentage Error."""
    y_true, y_pred = np.array(y_true), np.array(y_pred)
    non_zero = y_true != 0
    if not np.any(non_zero):
        return 0.0
    return float(np.mean(np.abs((y_true[non_zero] - y_pred[non_zero]) / y_true[non_zero])) * 100)


def predictive_model(payload):
    """
    Predictive analysis: What will happen next?
    Always runs a linear trend forecast — never returns an empty response.
    """
    response = base_response()

    try:
        blueprint    = payload["data_blueprint"]
        schema       = blueprint["schema_mapping"]
        metric       = schema.get("metric_col", "Sales")
        date_col     = schema.get("date_col", "Order Date")
        dataset_path = blueprint["dataset"]

        final_path = resolve_secure_path(dataset_path)
        df         = load_csv(final_path, date_col)
        df         = augment_time_features(df, date_col, metric)

        filters = blueprint.get("execution_scope", {}).get("filters", [])
        df      = apply_filters(df, filters)
        df      = clean_dataframe(df)
        df      = df.sort_values(by=date_col)

        # ── Monthly aggregation ────────────────────────────────────
        df["month"] = df[date_col].dt.to_period("M")
        monthly     = df.groupby("month")[metric].sum().reset_index()
        monthly["t"] = np.arange(len(monthly))

        if monthly.empty:
            response["summary"]    = "No data available for prediction."
            response["confidence"] = 0.0
            return response

        y = monthly[metric].values

        # ── Minimum data guard ─────────────────────────────────────
        if len(monthly) < 3:
            predicted = float(np.mean(y))
            response["prediction"] = {
                "predicted_value": round(predicted, 2),
                "lower_bound":     round(max(0.0, predicted * 0.85), 2),
                "upper_bound":     round(predicted * 1.15, 2),
                "confidence":      0.50,
                "horizon":         "next month",
                "model_used":      "Mean Estimate (insufficient history)",
            }
            response["summary"]    = f"Based on limited data, next-period {metric} is estimated at ${predicted:,.2f}."
            response["confidence"] = 0.50
            return response

        # ── Linear Regression ─────────────────────────────────────
        x = monthly["t"].values
        try:
            a, b = np.polyfit(x, y, 1)
        except Exception:
            predicted = float(np.mean(y))
            a, b = 0.0, predicted

        next_t    = len(monthly)
        predicted = float(a * next_t + b)

        # ── Horizon: next N months ────────────────────────────────
        horizon_months = 6
        forecast_periods = []
        last_period = monthly["month"].iloc[-1]
        for i in range(1, horizon_months + 1):
            p = last_period + i
            v = round(float(a * (next_t + i - 1) + b), 2)
            forecast_periods.append({"period": str(p), "value": max(0.0, v)})

        # ── MAPE ───────────────────────────────────────────────────
        mape = calculate_mape(y, a * x + b)

        # ── Confidence interval (1 std dev) ───────────────────────
        std_dev = float(np.std(y))
        lower   = max(0.0, predicted - std_dev)
        upper   = predicted + std_dev

        # ── Confidence score ───────────────────────────────────────
        variance = float(np.var(y))
        mean_val = float(np.mean(y))
        if variance < mean_val:
            confidence = 0.90
        elif variance < 2 * mean_val:
            confidence = 0.75
        else:
            confidence = 0.60

        if abs(a) < 0.01:
            confidence -= 0.10  # weak trend penalty

        confidence = round(max(0.50, min(confidence, 0.95)), 2)

        last_actual   = float(y[-1])
        trend_desc    = "increasing" if a > 0 else ("decreasing" if a < 0 else "flat")
        monthly_delta = round(float(a), 2)

        response["prediction"] = {
            "predicted_value": round(predicted, 2),
            "lower_bound":     round(lower, 2),
            "upper_bound":     round(upper, 2),
            "confidence":      confidence,
            "horizon":         str(last_period + 1),
            "trend_slope":     round(float(a), 4),
            "direction":       "increase" if a > 0 else "decrease",
            "mape_error_pct":  round(mape, 2),
            "model_used":      "Linear Regression (monthly)",
            "forecast_6m":     forecast_periods,
        }

        # ── Key Metrics ────────────────────────────────────────────
        response["key_metrics"] = [
            {"name": "last_actual_month",       "value": round(last_actual, 2),   "unit": "USD", "type": "currency"},
            {"name": "next_period_forecast",    "value": round(predicted, 2),     "unit": "USD", "type": "currency"},
            {"name": "monthly_trend_change",    "value": monthly_delta,            "unit": "USD/mo", "type": "currency"},
            {"name": "forecast_confidence",     "value": round(confidence * 100, 1), "unit": "%", "type": "percentage"},
        ]

        response["trend"] = {
            "direction":        trend_desc,
            "pattern":          "linear_regression",
            "change_rate":      round(float(a), 2),
            "time_granularity": "monthly",
        }

        # ── Chart data ─────────────────────────────────────────────
        monthly_labels  = [str(p) for p in monthly["month"]]
        actual_values   = [round(float(v), 2) for v in y]
        forecast_labels = [fp["period"] for fp in forecast_periods]
        forecast_values = [fp["value"]  for fp in forecast_periods]

        response["chart_data"] = [
            {
                "chart_id":   "sales_forecast",
                "chart_type": "line",
                "title":      f"{metric} — Historical Trend & 6-Month Forecast",
                "x_axis":     monthly_labels + forecast_labels,
                "series":     [
                    {"name": f"Actual {metric}", "values": actual_values + [None] * len(forecast_labels)},
                    {"name": "Forecast",          "values": [None] * len(actual_values) + forecast_values},
                ],
            }
        ]

        # ── Recommendations ────────────────────────────────────────
        response["recommendations"] = [
            f"{metric} is on a {trend_desc} trend of ${abs(monthly_delta):,.2f}/month.",
            f"Next-period forecast: ${round(predicted, 2):,.2f} (±${round(std_dev, 2):,.2f}).",
            f"Forecast model accuracy (MAPE): {round(mape, 1)}%.",
        ]

        # ── Interpretable Summary ──────────────────────────────────
        summary = (
            f"{metric} is {trend_desc} at approximately ${abs(monthly_delta):,.2f}/month over {len(monthly)} months. "
            f"The next-period forecast is ${round(predicted, 2):,.2f} "
            f"(range: ${round(lower, 2):,.2f} – ${round(upper, 2):,.2f}), "
            f"with {round(confidence * 100)}% confidence."
        )
        response["summary"] = summary
        response["summary_levels"] = {
            "simple":   f"{metric} is going {trend_desc}. Our best estimate for next month is ${round(predicted, 2):,.2f}.",
            "medium":   summary,
            "advanced": (
                f"Linear regression on {len(monthly)} monthly periods: slope={round(float(a), 4)}, "
                f"intercept={round(float(b), 2)}, MAPE={round(mape, 2)}%, confidence={round(confidence * 100)}%. "
                f"Predicted next period: ${round(predicted, 2):,.2f} [${round(lower, 2):,.2f}, ${round(upper, 2):,.2f}]."
            ),
        }

        response["confidence"] = confidence
        return response

    except Exception as e:
        response["status"]  = "error"
        response["message"] = str(e)
        return response