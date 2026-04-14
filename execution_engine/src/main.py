import os
from datetime import datetime, timezone

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.profiler import router as profiler_router
from src.api.routes import router


def _normalize_origin(value: str) -> str:
    value = value.strip()
    if value.startswith(("http://", "https://")):
        return value.rstrip("/")
    if value.startswith(("localhost", "127.0.0.1", "[::1]", "::1")):
        return f"http://{value}".rstrip("/")
    return f"https://{value}".rstrip("/")


def _parse_cors_origins() -> list[str]:
    """
    Comma-separated origins, for example:
    CORS_ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com
    """
    raw = (os.getenv("CORS_ALLOWED_ORIGINS") or "").strip()
    if raw:
        return [_normalize_origin(origin) for origin in raw.split(",") if origin.strip()]
    # Safe local defaults. Set CORS_ALLOWED_ORIGINS explicitly in production.
    return [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]


app = FastAPI(
    title="Bolt Execution Engine",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_parse_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
app.include_router(profiler_router)


@app.get("/")
def home():
    return {"service": "execution_engine", "status": "ok"}


@app.get("/health")
def health():
    return {
        "service": "execution_engine",
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


if __name__ == "__main__":
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("src.main:app", host=host, port=port, reload=False)

