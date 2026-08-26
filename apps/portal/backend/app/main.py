import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes import orders, solve

app = FastAPI(
    title="FitPortal API",
    description="Backend API for FitPortal.",
    version="0.1.0",
)

_DEV_ORIGINS = [
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "http://127.0.0.1:5174",
    "http://localhost:5174",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("FITPORTAL_CORS_ORIGINS", ",".join(_DEV_ORIGINS)).split(","),
    allow_methods=["GET", "POST"],
    allow_headers=["content-type"],
)

app.include_router(orders.router)
app.include_router(solve.router)


@app.get("/health", tags=["status"])
def health() -> dict[str, str]:
    return {"status": "ok"}
