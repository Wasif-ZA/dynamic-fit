import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes import orders, solve

app = FastAPI(
    title="FitPortal API",
    description="Backend API for FitPortal.",
    version="0.1.0",
)

# Portal on 5174, Visualiser on 5173. Override with FITPORTAL_CORS_ORIGINS.
_DEV_ORIGINS = [
    "http://127.0.0.1:5174",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://localhost:5173",
]

_configured = os.getenv("FITPORTAL_CORS_ORIGINS")
_origins = (
    [origin.strip() for origin in _configured.split(",") if origin.strip()]
    if _configured
    else _DEV_ORIGINS
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["content-type"],
)

app.include_router(orders.router)
app.include_router(solve.router)


@app.get("/health", tags=["status"])
def health() -> dict[str, str]:
    return {"status": "ok"}
