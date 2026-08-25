from fastapi import FastAPI

from app.routes import orders, solve

app = FastAPI(
    title="FitPortal API",
    description="Backend API for FitPortal.",
    version="0.1.0",
)

app.include_router(orders.router)
app.include_router(solve.router)


@app.get("/health", tags=["status"])
def health() -> dict[str, str]:
    return {"status": "ok"}
