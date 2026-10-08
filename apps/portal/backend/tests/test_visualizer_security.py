from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse

import jwt
from fastapi.testclient import TestClient

from app import store
from app.main import app
from app.models import Role
from tests.auth_helpers import auth_headers

client = TestClient(app)
USER_HEADERS = auth_headers(Role.USER)
VISUALIZER_SECRET = "fitportal-test-visualizer-secret-with-at-least-32-characters"


def solution(order_id: str, solution_id: str = "solution-1") -> dict:
    return {
        "solution_id": solution_id,
        "order_id": order_id,
        "metrics": {"carton_count": 0, "fill_rate": 0, "total_mass": 0},
        "solver": {"elapsed_ms": 1},
        "cartons": [],
        "rejects": [],
    }


def solved_order() -> tuple[str, dict]:
    created = client.post(
        "/orders",
        headers=USER_HEADERS,
        json={
            "Items": [{
                "ItemCode": "ITM-001",
                "ItemReference": "Widget",
                "Width": 1,
                "Length": 1,
                "Depth": 1,
                "Weight": 1,
            }]
        },
    ).json()
    document = solution(created["OrderId"])
    store.save_solution(created["OrderId"], document)
    return created["OrderId"], document


def handoff_path(order_id: str) -> tuple[str, str]:
    response = client.post(
        f"/orders/{order_id}/visualizer-handoff", headers=USER_HEADERS
    )
    assert response.status_code == 200, response.text
    solution_url = response.json()["SolutionUrl"]
    parsed = urlparse(solution_url)
    return f"{parsed.path}?{parsed.query}", parse_qs(parsed.query)["token"][0]


def test_handoff_uses_a_short_lived_scoped_token_not_the_supabase_token():
    order_id, document = solved_order()
    path, token = handoff_path(order_id)

    assert "Bearer" not in path
    assert auth_headers(Role.USER)["Authorization"].split()[-1] not in path
    assert client.get(path, headers={"Authorization": ""}).json() == document
    assert token


def test_visualizer_endpoint_rejects_missing_or_invalid_handoff():
    order_id, _ = solved_order()

    assert client.get(
        f"/orders/{order_id}/solution/visualizer",
        headers={"Authorization": ""},
    ).status_code == 401


def test_tampered_handoff_is_rejected():
    order_id, _ = solved_order()
    _, token = handoff_path(order_id)
    replacement = "a" if token[-1] != "a" else "b"

    assert client.get(
        f"/orders/{order_id}/solution/visualizer?token={token[:-1]}{replacement}",
        headers={"Authorization": ""},
    ).status_code == 401
    assert client.get(
        f"/orders/{order_id}/solution/visualizer?token=invalid",
        headers={"Authorization": ""},
    ).status_code == 401


def test_handoff_is_order_scoped():
    first, _ = solved_order()
    second, _ = solved_order()
    _, token = handoff_path(first)

    response = client.get(
        f"/orders/{second}/solution/visualizer?token={token}",
        headers={"Authorization": ""},
    )
    assert response.status_code == 401


def test_handoff_is_invalid_after_solution_is_replaced():
    order_id, _ = solved_order()
    path, _ = handoff_path(order_id)
    store.save_solution(order_id, solution(order_id, "solution-2"))

    assert client.get(path, headers={"Authorization": ""}).status_code == 401


def test_expired_handoff_is_rejected():
    order_id, _ = solved_order()
    now = datetime.now(timezone.utc)
    token = jwt.encode(
        {
            "aud": "fitportal-visualizer",
            "sub": order_id,
            "solution": "irrelevant",
            "iat": now - timedelta(minutes=2),
            "exp": now - timedelta(minutes=1),
        },
        VISUALIZER_SECRET,
        algorithm="HS256",
    )

    response = client.get(
        f"/orders/{order_id}/solution/visualizer?token={token}",
        headers={"Authorization": ""},
    )
    assert response.status_code == 401


def test_wrong_audience_handoff_is_rejected():
    order_id, document = solved_order()
    now = datetime.now(timezone.utc)
    token = jwt.encode(
        {
            "aud": "another-application",
            "sub": order_id,
            "solution": "irrelevant",
            "iat": now,
            "exp": now + timedelta(minutes=1),
        },
        VISUALIZER_SECRET,
        algorithm="HS256",
    )

    assert client.get(
        f"/orders/{order_id}/solution/visualizer?token={token}",
        headers={"Authorization": ""},
    ).status_code == 401


def test_handoff_requires_an_existing_solution():
    created = client.post(
        "/orders",
        headers=USER_HEADERS,
        json={
            "Items": [{
                "ItemCode": "ITM-001",
                "ItemReference": "Widget",
                "Width": 1,
                "Length": 1,
                "Depth": 1,
                "Weight": 1,
            }]
        },
    ).json()

    assert client.post(
        f"/orders/{created['OrderId']}/visualizer-handoff",
        headers=USER_HEADERS,
    ).status_code == 404
