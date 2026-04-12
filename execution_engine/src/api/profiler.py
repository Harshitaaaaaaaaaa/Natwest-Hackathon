import pandas as pd
from typing import Dict, Any, List
import logging
from src.models.utils import resolve_secure_path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()
logger = logging.getLogger(__name__)

class ProfileRequest(BaseModel):
    dataset_ref: str

def universal_read_csv(path: str, nrows=None):
    ENCODINGS = ["utf-8", "latin1", "utf-8-sig", "cp1252", "iso-8859-1"]
    
    for enc in ENCODINGS:
        try:
            return pd.read_csv(path, encoding=enc, nrows=nrows)
        except (UnicodeDecodeError, LookupError):
            continue
    # Fallback to utf-8 replacing errors
    return pd.read_csv(path, encoding="utf-8", errors="replace", nrows=nrows)

def is_date_col(series: pd.Series) -> bool:
    try:
        if series.dtype == 'object':
            s = series.dropna().head(100)
            if s.empty: return False
            parsed = pd.to_datetime(s, errors='coerce')
            return parsed.notna().sum() > len(s) * 0.8
        elif pd.api.types.is_datetime64_any_dtype(series):
            return True
        return False
    except Exception:
        return False

@router.post("/analyze_schema")
def analyze_schema(req: ProfileRequest) -> Dict[str, Any]:
    try:
        final_path = resolve_secure_path(req.dataset_ref)
        df_sample = universal_read_csv(final_path, nrows=5000)
    except Exception as e:
        logger.error(f"Error reading dataset for profile: {str(e)}")
        raise HTTPException(status_code=400, detail="Invalid dataset reference")

    date_col = ""
    metric_cols = []
    dimension_cols = []

    for col in df_sample.columns:
        if not date_col and is_date_col(df_sample[col]):
            date_col = col
            continue

        if pd.api.types.is_numeric_dtype(df_sample[col]):
            if df_sample[col].nunique() != len(df_sample[col]) and not col.lower().endswith("id"):
                metric_cols.append(col)
        elif df_sample[col].dtype == 'object':
            unique_count = df_sample[col].nunique()
            if 1 < unique_count < 100:
                dimension_cols.append(col)

    best_metric = metric_cols[0] if metric_cols else ""
    for m in metric_cols:
        ml_lower = m.lower()
        if any(w in ml_lower for w in ["sales", "revenue", "profit", "total", "amount", "salary", "price"]):
            best_metric = m
            break

    if not date_col and dimension_cols:
        date_col = dimension_cols[0]

    date_min = ""
    date_max = ""
    if date_col and date_col in df_sample.columns:
        try:
            full_df = universal_read_csv(final_path, nrows=None)
            parsed = pd.to_datetime(full_df[date_col], errors='coerce').dropna()
            if not parsed.empty:
                date_min = parsed.min().strftime("%Y-%m-%d")
                date_max = parsed.max().strftime("%Y-%m-%d")
        except Exception:
            pass

    return {
        "status": "success",
        "dataset_ref": req.dataset_ref,
        "schema": {
            "metric_col": best_metric,
            "date_col": date_col,
            "dimension_cols": dimension_cols[:10],
            "date_min": date_min,
            "date_max": date_max,
        }
    }

