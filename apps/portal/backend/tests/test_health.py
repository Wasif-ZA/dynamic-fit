from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_returns_ok():
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_openapi_schema_is_available():
    assert client.get("/openapi.json").status_code == 200


def test_cors_allows_the_portal_front_end():
    response = client.options(
        "/health",
        headers={
            "Origin": "http://127.0.0.1:5174",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.headers.get("access-control-allow-origin") == "http://127.0.0.1:5174"


def test_cors_allows_the_visualiser():
    response = client.options(
        "/orders/ORD-001/solution",
        headers={
            "Origin": "http://127.0.0.1:5173",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.headers.get("access-control-allow-origin") == "http://127.0.0.1:5173"
