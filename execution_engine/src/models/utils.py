import pandas as pd
import numpy as np
import os

class SecurityException(Exception):
    """Raised when an operation attempts to breach path security guards."""
    pass

def resolve_secure_path(requested_path: str) -> str:
    """
    Safely resolves the absolute path of the requested dataset.
    Verifies that the target path is strictly within the allowed data directories 
    ('data' or 'uploads') to prevent Path Traversal (LFI) attacks.
    """
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    
    # Strip leading slashes to prevent absolute path override trick
    clean_path = requested_path.lstrip("/\\")
    
    final_path = os.path.abspath(os.path.join(project_root, clean_path))
    
    # Allowed directories
    allowed_zones = [
        os.path.join(project_root, "data"),
        os.path.join(project_root, "uploads")
    ]
    
    # Ensure final_path starts with one of the allowed zones
    is_safe = any(final_path.startswith(zone) for zone in allowed_zones)
    
    if not is_safe:
        raise SecurityException(
            f"Path Traversal Blocked: Requested dataset '{requested_path}' resolves outside allowed safe zones."
        )
        
    return final_path


def load_csv(path: str, date_col: str) -> pd.DataFrame:
    """
    Universal CSV loader — handles any encoding and date format.
    Tries multiple encodings and date formats so user-uploaded files
    work correctly regardless of how they were exported.
    """
    ENCODINGS = ["utf-8", "latin1", "utf-8-sig", "cp1252", "iso-8859-1"]
    df = None

    for enc in ENCODINGS:
        try:
            df = pd.read_csv(path, encoding=enc)
            break
        except (UnicodeDecodeError, LookupError):
            continue

    if df is None:
        # Last resort: ignore undecodable bytes
        df = pd.read_csv(path, encoding="utf-8", errors="replace")

    if date_col not in df.columns:
        return df  # Can't parse — caller will handle empty/missing col

    # Try to parse dates robustly
    DATE_FORMATS = [
        "%d-%m-%Y", "%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y",
        "%Y/%m/%d", "%d-%b-%Y", "%B %d, %Y",
    ]
    for fmt in DATE_FORMATS:
        try:
            df[date_col] = pd.to_datetime(df[date_col], format=fmt)
            return df
        except (ValueError, TypeError):
            continue

    # Fallback: let pandas infer
    df[date_col] = pd.to_datetime(df[date_col], infer_datetime_format=True, errors="coerce")
    return df


def augment_time_features(df: pd.DataFrame, date_col: str, metric_col: str = None) -> pd.DataFrame:
    """
    Dynamically engineers time-series features for deeper predictive analysis.

    Adds:
      - DayOfWeek, Month, Quarter  — calendar decomposition
      - Is_Weekend                 — binary flag for Saturday/Sunday
      - Rolling_7D_Avg             — 7-day rolling mean of the metric column
        (only when metric_col is provided and present in the DataFrame)

    Safe to call on any DataFrame that contains date_col; returns df unchanged
    if date_col is missing or cannot be parsed.
    """
    if date_col not in df.columns:
        return df

    # Ensure datetime — errors='coerce' turns unparseable values to NaT
    df = df.copy()
    df[date_col] = pd.to_datetime(df[date_col], errors='coerce')

    # Calendar decomposition
    df['DayOfWeek']  = df[date_col].dt.day_name()
    df['Month']      = df[date_col].dt.month
    df['Is_Weekend'] = df['DayOfWeek'].isin(['Saturday', 'Sunday'])
    df['Quarter']    = df[date_col].dt.quarter

    # Rolling average — only when a numeric metric column is available
    if metric_col and metric_col in df.columns:
        df = df.sort_values(by=date_col)
        daily_agg = df.groupby(date_col)[metric_col].transform('sum')
        df['Rolling_7D_Avg'] = daily_agg.rolling(window=7, min_periods=1).mean()

    return df


def apply_filters(df: pd.DataFrame, filters: list) -> pd.DataFrame:
    """Apply a list of filter dicts to a DataFrame."""
    for f in filters:
        col = f.get("column")
        op = f.get("operator", "equals")
        val = f.get("value")

        if col not in df.columns:
            continue

        if op == "equals":
            df = df[df[col] == val]
        elif op == "not_equals":
            df = df[df[col] != val]
        elif op == "ge":
            df = df[df[col] >= val]
        elif op == "le":
            df = df[df[col] <= val]
        elif op == "contains":
            df = df[df[col].astype(str).str.contains(str(val), case=False)]

    return df


def clean_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """
    Sanitizes the DataFrame to prevent JSON serialization errors and computation crashes.
    - Replaces numeric NaNs and Infinities with 0.
    - Replaces categorical/object NaNs with 'Unknown'.
    """
    df = df.copy()
    
    # Handle numeric columns: replace inf with NaN, then fill NaN with 0
    numeric_cols = df.select_dtypes(include=[np.number]).columns
    df[numeric_cols] = df[numeric_cols].replace([np.inf, -np.inf], np.nan).fillna(0)
    
    # Handle string/object/categorical columns: fill NaN with 'Unknown'
    object_cols = df.select_dtypes(include=['object', 'category']).columns
    df[object_cols] = df[object_cols].fillna("Unknown")
    
    return df


def build_ui_payload(grouped_df: pd.DataFrame, label_col: str, val_col: str, top_n: int = 7) -> list:
    """
    Takes an aggressively aggregated/sorted grouped DataFrame and bounds it for the UI.
    If the number of rows exceeds top_n, it buckets the remainder into 'Others'.
    Returns a frontend-ready list of dicts: [{'label': X, 'value': Y, 'percentage': Z}].
    """
    total_val = grouped_df[val_col].sum()
    if total_val == 0:
        total_val = 1  # prevent div zero
        
    grouped_df = grouped_df.sort_values(val_col, ascending=False).reset_index(drop=True)
    
    payload = []
    
    if len(grouped_df) <= top_n + 1:
        # If it's just slightly over, don't bother creating an "Others" bucket for 1 item,
        # but if we strictly want top_n, let's enforce it exactly.
        # Let's enforce exactly: if len > top_n, bucket it.
        pass

    if len(grouped_df) > top_n:
        top_df = grouped_df.iloc[:top_n]
        others_val = grouped_df.iloc[top_n:][val_col].sum()
        
        for _, row in top_df.iterrows():
            payload.append({
                "label": str(row[label_col]),
                "value": round(float(row[val_col]), 2),
                "percentage": round((row[val_col] / total_val) * 100, 2)
            })
            
        if others_val > 0:
            payload.append({
                "label": "Others",
                "value": round(float(others_val), 2),
                "percentage": round((others_val / total_val) * 100, 2)
            })
    else:
        for _, row in grouped_df.iterrows():
            payload.append({
                "label": str(row[label_col]),
                "value": round(float(row[val_col]), 2),
                "percentage": round((row[val_col] / total_val) * 100, 2)
            })
            
    return payload