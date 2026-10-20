"""Backlog, direct deletion and finalised archive policy."""

import threading
import time
from urllib.parse import urlsplit

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import boxes, database, store
from app.db.models import OrderItemRecord, OrderRecord, SolutionRecord
from app.errors import OrderStatusConflictError
from app.main import app
from app.models import Role
from app.repositories import orders as order_repository
from tests.auth_helpers import auth_headers
from tests.box_fixtures import DEFAULT_BOX_TYPES

client = TestClient(app)
MANAGER = auth_headers(Role.SUPERVISOR)
ITEM = {
    "ItemCode": "BACKLOG-TEST", "ItemReference": "Backlog test item",
    "Width": 100, "Length": 100, "Depth": 100, "Weight": 1,
}


@pytest.fixture(autouse=True)
def reset_stores():
    store.reset()
    for box in DEFAULT_BOX_TYPES:
        boxes.add_box_type(box)
    yield
    store.reset()


def create_order(status="DRAFT"):
    response = client.post("/orders", json={"Items": [ITEM]})
    assert response.status_code == 201, response.text
    order_id = response.json()["OrderId"]
    if status == "AWAITING_OPTIMISATION":
        assert client.post(f"/orders/{order_id}/submit").status_code == 200
    if status in {"OPTIMISED", "FINAL"}:
        solved = client.post(f"/orders/{order_id}/solve", headers=MANAGER)
        assert solved.status_code == 200, solved.text
    if status == "FINAL":
        finalised = client.post(f"/orders/{order_id}/finalise", headers=MANAGER)
        assert finalised.status_code == 200, finalised.text
        assert finalised.json()["FinalisedAt"]
    return order_id


def hold(order_id, headers=MANAGER):
    response = client.post(f"/orders/{order_id}/hold", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.parametrize("role", [Role.SUPERVISOR, Role.ADMINISTRATOR])
@pytest.mark.parametrize("status", ["DRAFT", "AWAITING_OPTIMISATION", "OPTIMISED"])
def test_hold_and_resume_preserve_progress_items_solution_and_stock(role, status):
    order_id = create_order(status)
    original = client.get(f"/orders/{order_id}").json()
    saved_solution = store.find_solution(order_id)
    stock = client.get("/boxes").json()
    headers = auth_headers(role)

    held = hold(order_id, headers)
    assert held["HeldAt"]
    assert {k: v for k, v in held.items() if k != "HeldAt"} == original
    assert hold(order_id, headers) == held
    database.dispose_engine()
    assert client.get(f"/orders/{order_id}").json() == held
    assert client.get("/orders").json() == []
    assert client.get("/orders?view=backlog").json() == [held]
    assert client.get("/orders?view=archived").json() == []

    resumed = client.post(f"/orders/{order_id}/resume", headers=headers)
    assert resumed.status_code == 200
    assert resumed.json() == original
    assert client.post(f"/orders/{order_id}/resume", headers=headers).json() == original
    assert client.get("/orders").json() == [original]
    assert client.get("/orders?view=backlog").json() == []
    assert store.find_solution(order_id) == saved_solution
    assert client.get("/boxes").json() == stock


@pytest.mark.parametrize("role", [Role.SUPERVISOR, Role.ADMINISTRATOR])
def test_finalised_orders_can_be_archived_early_without_changing_results_or_stock(role):
    order_id = create_order("FINAL")
    original = client.get(f"/orders/{order_id}").json()
    saved_solution = store.find_solution(order_id)
    stock = client.get("/boxes").json()

    archived = client.post(f"/orders/{order_id}/archive", headers=auth_headers(role))

    assert archived.status_code == 200
    assert archived.json()["ArchivedAt"]
    assert {k: v for k, v in archived.json().items() if k != "ArchivedAt"} == original
    assert client.post(f"/orders/{order_id}/archive", headers=MANAGER).json() == archived.json()
    assert client.get("/orders").json() == []
    assert client.get("/orders?view=backlog").json() == []
    assert client.get("/orders?view=archived").json() == [archived.json()]
    assert store.find_solution(order_id) == saved_solution
    assert client.get("/boxes").json() == stock


@pytest.mark.parametrize("status", ["DRAFT", "AWAITING_OPTIMISATION", "OPTIMISED"])
def test_unfinished_orders_use_backlog_rather_than_archive(status):
    order_id = create_order(status)
    response = client.post(f"/orders/{order_id}/archive", headers=MANAGER)
    assert response.status_code == 409
    assert "Put unfinished orders on hold" in response.json()["detail"]
    assert "ArchivedAt" not in client.get(f"/orders/{order_id}").json()


@pytest.mark.parametrize("archived", [False, True])
@pytest.mark.parametrize("action", ["hold", "resume"])
def test_finalised_orders_cannot_be_paused_or_resumed(action, archived):
    order_id = create_order("FINAL")
    if archived:
        assert client.post(f"/orders/{order_id}/archive", headers=MANAGER).status_code == 200
    assert client.post(f"/orders/{order_id}/{action}", headers=MANAGER).status_code == 409
    assert client.get(f"/orders/{order_id}").json()["Status"] == "FINAL"


@pytest.mark.parametrize("action", ["archive", "hold", "resume", "delete"])
def test_regular_users_cannot_manage_orders_even_with_elevated_token_metadata(action):
    order_id = create_order()
    if action == "resume":
        hold(order_id)
    original = client.get(f"/orders/{order_id}").json()
    headers = auth_headers(Role.USER, extra_claims={"user_metadata": {"role": "ADMINISTRATOR"}})
    method = "DELETE" if action == "delete" else "POST"
    path = f"/orders/{order_id}" + ("" if action == "delete" else f"/{action}")

    assert client.request(method, path, headers=headers).status_code == 403
    assert client.get(f"/orders/{order_id}").json() == original


@pytest.mark.parametrize("action", ["archive", "hold", "resume", "delete"])
def test_order_management_requires_authentication(action):
    order_id = create_order()
    method = "DELETE" if action == "delete" else "POST"
    path = f"/orders/{order_id}" + ("" if action == "delete" else f"/{action}")
    assert client.request(method, path, headers={"Authorization": ""}).status_code == 401


@pytest.mark.parametrize("role", [Role.SUPERVISOR, Role.ADMINISTRATOR])
@pytest.mark.parametrize("status", ["DRAFT", "AWAITING_OPTIMISATION", "OPTIMISED"])
@pytest.mark.parametrize("held", [False, True])
def test_direct_deletion_removes_only_the_selected_unfinished_order(role, status, held):
    other_id = create_order("OPTIMISED")
    other_solution = store.find_solution(other_id)
    order_id = create_order(status)
    if held:
        hold(order_id)
    stock = client.get("/boxes").json()

    response = client.delete(f"/orders/{order_id}", headers=auth_headers(role))

    assert response.status_code == 204
    assert response.content == b""
    assert client.get(f"/orders/{order_id}").status_code == 404
    with database.session_scope() as session:
        assert session.get(OrderRecord, order_id) is None
        assert session.get(SolutionRecord, order_id) is None
        assert session.scalars(select(OrderItemRecord).where(OrderItemRecord.order_id == order_id)).all() == []
    assert store.find_solution(other_id) == other_solution
    assert client.get("/boxes").json() == stock
    assert create_order() not in {other_id, order_id}


@pytest.mark.parametrize("role", [Role.SUPERVISOR, Role.ADMINISTRATOR])
@pytest.mark.parametrize("archived", [False, True])
def test_finalised_orders_cannot_be_deleted(role, archived):
    order_id = create_order("FINAL")
    if archived:
        assert client.post(f"/orders/{order_id}/archive", headers=MANAGER).status_code == 200
    original = client.get(f"/orders/{order_id}").json()
    saved_solution = store.find_solution(order_id)
    stock = client.get("/boxes").json()

    response = client.delete(f"/orders/{order_id}", headers=auth_headers(role))

    assert response.status_code == 409
    assert "Finalised orders cannot" in response.json()["detail"]
    assert client.get(f"/orders/{order_id}").json() == original
    assert store.find_solution(order_id) == saved_solution
    assert client.get("/boxes").json() == stock


@pytest.mark.parametrize("status, method, suffix", [
    ("DRAFT", "POST", "/submit"), ("DRAFT", "PUT", ""),
    ("OPTIMISED", "POST", "/solve"), ("OPTIMISED", "POST", "/finalise"),
])
def test_orders_on_hold_require_resume_before_processing(status, method, suffix, monkeypatch):
    order_id = create_order(status)
    held = hold(order_id)
    saved_solution = store.find_solution(order_id)
    stock = client.get("/boxes").json()
    def must_not_solve(_request):
        pytest.fail("Orders on hold must not run Solver")
    monkeypatch.setattr("app.routes.solve.solve_request", must_not_solve)
    options = {"json": {"Items": [{**ITEM, "Quantity": 5}]}} if method == "PUT" else {}

    response = client.request(method, f"/orders/{order_id}{suffix}", headers=MANAGER, **options)

    assert response.status_code == 409
    assert "Resume this order" in response.json()["detail"]
    assert client.get(f"/orders/{order_id}").json() == held
    assert store.find_solution(order_id) == saved_solution
    assert client.get("/boxes").json() == stock


def test_regular_users_can_read_backlog_and_finalised_archive_results():
    held_id = create_order("OPTIMISED")
    held = hold(held_id)
    final_id = create_order("FINAL")
    archived = client.post(f"/orders/{final_id}/archive", headers=MANAGER).json()
    assert client.get("/orders?view=backlog").json() == [held]
    assert client.get("/orders?view=archived").json() == [archived]
    for order_id in [held_id, final_id]:
        assert client.get(f"/orders/{order_id}/solution").json() == store.find_solution(order_id)
        assert client.get(f"/orders/{order_id}/solution/summary").json()["InventoryFeasibility"] is None


def test_rejected_orders_keep_their_saved_rejections_when_paused_and_resumed():
    order_id = client.post("/orders", json={"Items": [{**ITEM, "Width": 2000, "Quantity": 3}]}).json()["OrderId"]
    assert client.post(f"/orders/{order_id}/solve", headers=MANAGER).status_code == 200
    assert hold(order_id)["RejectedCount"] == 3
    assert client.get("/orders?view=backlog").json()[0]["RejectedCount"] == 3
    assert client.post(f"/orders/{order_id}/resume", headers=MANAGER).json()["RejectedCount"] == 3


@pytest.mark.parametrize("initial_status", ["DRAFT", "OPTIMISED"])
def test_putting_an_order_on_hold_during_a_solve_discards_the_in_flight_result(initial_status, monkeypatch):
    order_id = create_order(initial_status)
    original_solution = store.find_solution(order_id)
    def hold_during_solve(_request):
        hold(order_id)
        return {"order_id": order_id, "solution_id": "stale", "cartons": [], "rejects": []}
    monkeypatch.setattr("app.routes.solve.solve_request", hold_during_solve)

    response = client.post(f"/orders/{order_id}/solve", headers=MANAGER)

    assert response.status_code == 409
    assert store.find_solution(order_id) == original_solution
    assert client.get(f"/orders/{order_id}").json()["HeldAt"]


def test_deletion_during_a_solve_cannot_recreate_the_order_or_solution(monkeypatch):
    order_id = create_order("OPTIMISED")
    def delete_during_solve(_request):
        assert client.delete(f"/orders/{order_id}", headers=MANAGER).status_code == 204
        return {"order_id": order_id, "solution_id": "stale", "cartons": [], "rejects": []}
    monkeypatch.setattr("app.routes.solve.solve_request", delete_during_solve)
    assert client.post(f"/orders/{order_id}/solve", headers=MANAGER).status_code == 404
    assert store.find_order(order_id) is None
    assert store.find_solution(order_id) is None


def test_a_failed_deletion_rolls_back_the_order_items_and_solution(monkeypatch):
    order_id = create_order("OPTIMISED")
    original = client.get(f"/orders/{order_id}").json()
    saved_solution = store.find_solution(order_id)
    original_delete = order_repository.delete_order
    def fail_after_delete(session, record):
        original_delete(session, record)
        raise RuntimeError("Deletion interrupted")
    monkeypatch.setattr(order_repository, "delete_order", fail_after_delete)
    with pytest.raises(RuntimeError, match="Deletion interrupted"):
        store.delete_order(order_id)
    assert client.get(f"/orders/{order_id}").json() == original
    assert store.find_solution(order_id) == saved_solution


def test_deletion_checks_final_status_after_waiting_for_a_competing_transaction():
    order_id = create_order("OPTIMISED")
    outcome = []
    started = threading.Event()
    def delete_in_another_session():
        started.set()
        try:
            store.delete_order(order_id)
        except Exception as error:
            outcome.append(error)
    with Session(database.get_engine()) as holder:
        record = holder.get(OrderRecord, order_id, with_for_update=True)
        order_repository.set_status(holder, record, "FINAL")
        holder.flush()
        worker = threading.Thread(target=delete_in_another_session, daemon=True)
        worker.start()
        try:
            assert started.wait(timeout=5)
            time.sleep(0.1)
            assert worker.is_alive()
            holder.commit()
        finally:
            holder.rollback()
            worker.join(timeout=5)
    assert not worker.is_alive()
    assert len(outcome) == 1
    assert isinstance(outcome[0], OrderStatusConflictError)
    assert "Finalised orders cannot" in outcome[0].detail
    assert store.find_solution(order_id) is not None


def test_deleted_order_visualizer_access_is_revoked():
    order_id = create_order("OPTIMISED")
    response = client.post(f"/orders/{order_id}/visualizer-handoff")
    assert response.status_code == 200
    url = urlsplit(response.json()["SolutionUrl"])
    assert client.delete(f"/orders/{order_id}", headers=MANAGER).status_code == 204
    assert client.get(f"{url.path}?{url.query}", headers={"Authorization": ""}).status_code == 404


@pytest.mark.parametrize("action", ["archive", "hold", "resume", "delete"])
def test_unknown_order_management_returns_not_found(action):
    method = "DELETE" if action == "delete" else "POST"
    path = "/orders/ORD-MISSING" + ("" if action == "delete" else f"/{action}")
    assert client.request(method, path, headers=MANAGER).status_code == 404


@pytest.mark.parametrize("field", ["ArchivedAt", "HeldAt", "FinalisedAt"])
def test_management_state_cannot_be_set_through_an_order_payload(field):
    assert client.post("/orders", json={"Items": [ITEM], field: "2026-10-20T00:00:00Z"}).status_code == 422
