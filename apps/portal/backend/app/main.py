from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth import verify_auth_configuration
from app.database import verify_connection
from app.routes import boxes, orders, solve, users


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    verify_connection()
    verify_auth_configuration()
    yield


app = FastAPI(
    title="FitPortal API",
    description="Backend API for FitPortal.",
    version="0.1.0",
    lifespan=lifespan,
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
    allow_methods=["DELETE", "GET", "POST", "PUT"],
    allow_headers=["authorization", "content-type"],
)

app.include_router(orders.router)
app.include_router(solve.router)
app.include_router(boxes.router)
app.include_router(users.router)


@app.get("/health", tags=["status"])
def health() -> dict[str, str]:
    return {"status": "ok"}
