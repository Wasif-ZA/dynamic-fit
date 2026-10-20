"""Inventory-based item validation, persisted drafts and actual Solver limits."""

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app import boxes, store
from app.item_weights import contents_capacity_grams
from app.main import app
from app.models import BoxType, BoxTypeUpdate, Role
from app.solver_adapter import box_to_contract
from tests.auth_helpers import auth_headers

client = TestClient(app)
MANAGER = auth_headers(Role.SUPERVISOR)
ITEM = {"ItemCode": "HEAVY", "ItemReference": "Heavy test", "Width": 100, "Length": 100, "Depth": 100, "Weight": 38}


def box(**changes):
    return BoxType(**{"Reference": "HEAVY-BOX", "Width": 500, "Length": 500, "Depth": 500, "MaxWeight": 40, "BoxWeight": 2, **changes})


def update_box(**changes):
    current = boxes.find_box_type('HEAVY-BOX').model_dump(by_alias=True)
    current.pop('Reference')
    boxes.update_box_type('HEAVY-BOX', BoxTypeUpdate(**{**current, **changes}))


@pytest.fixture(autouse=True)
def clean_inventory():
    store.reset()
    yield
    store.reset()


@pytest.mark.parametrize('maximum,tare,grams', [
    (40, 2, 38000), (40, None, 40000), (None, 2, None),
    (2, 2, 0), (1, 2, 0), (0.1019, 0.0019, 100), (10.0009, 0.0001, 10000),
])
def test_payload_is_consistent_with_the_solver(maximum, tare, grams):
    configured = box(MaxWeight=maximum, BoxWeight=tare)
    assert contents_capacity_grams(configured) == grams
    assert box_to_contract(configured)['max_contents_mass'] == grams


@pytest.mark.parametrize('field', ['MaxWeight', 'BoxWeight'])
@pytest.mark.parametrize('value', [float('inf'), float('nan')])
def test_non_finite_box_capacities_are_invalid(field, value):
    with pytest.raises(ValidationError):
        box(**{field: value})


def test_capacity_uses_only_active_boxes_with_available_stock():
    for configured in [box(), box(Reference='INACTIVE', Active=False, MaxWeight=None), box(Reference='EMPTY', MaximumBoxes=0, MaxWeight=None)]:
        boxes.add_box_type(configured)
    assert client.get('/orders/item-weight-limit').json() == {'MaxItemWeightKg': 38, 'HasAvailableBoxes': True}
    update_box(MaxWeight=62)
    assert client.get('/orders/item-weight-limit').json()['MaxItemWeightKg'] == 60


def test_items_over_the_old_32_kg_limit_are_saved_and_packed_at_the_exact_payload_limit():
    boxes.add_box_type(box())
    response = client.post('/orders', json={'Items': [ITEM]})
    assert response.status_code == 201, response.text
    order_id = response.json()['OrderId']
    document = client.post(f'/orders/{order_id}/solve', headers=MANAGER)
    assert document.status_code == 200, document.text
    assert document.json()['rejects'] == []
    for carton in document.json()['cartons']:
        assert carton['contents_mass'] + carton['tare_mass'] <= 40000
    assert client.get(f'/orders/{order_id}').json()['Items'][0]['Weight'] == 38


def test_weight_validation_is_per_unit_and_solver_still_limits_combined_contents():
    boxes.add_box_type(box())
    response = client.post('/orders', json={'Items': [{**ITEM, 'Weight': 20, 'Quantity': 2}]})
    assert response.status_code == 201
    document = client.post(f"/orders/{response.json()['OrderId']}/solve", headers=MANAGER).json()
    assert document['rejects'] == []
    assert len(document['cartons']) == 2
    assert all(carton['contents_mass'] + carton['tare_mass'] <= 40000 for carton in document['cartons'])


def test_overweight_json_item_rejects_the_whole_order_before_persistence():
    boxes.add_box_type(box())
    response = client.post('/orders', json={'Items': [ITEM, {**ITEM, 'ItemCode': 'TOO-HEAVY', 'Weight': 38.001}]})
    assert response.status_code == 422
    assert 'Item 2 (TOO-HEAVY)' in response.json()['detail']
    assert '38 kg' in response.json()['detail']
    assert client.get('/orders').json() == []


def test_failed_edit_preserves_items_status_and_saved_solution():
    boxes.add_box_type(box())
    order_id = client.post('/orders', json={'Items': [ITEM]}).json()['OrderId']
    assert client.post(f'/orders/{order_id}/solve', headers=MANAGER).status_code == 200
    saved = store.find_solution(order_id)
    response = client.put(f'/orders/{order_id}', json={'Items': [{**ITEM, 'Weight': 39}]})
    assert response.status_code == 422
    assert store.find_solution(order_id) == saved
    assert client.get(f'/orders/{order_id}').json()['Items'] == [{**ITEM, 'Quantity': 1}]
    assert client.get(f'/orders/{order_id}').json()['Status'] == 'OPTIMISED'


def test_changed_inventory_is_rechecked_before_reoptimising_and_keeps_the_previous_result():
    boxes.add_box_type(box())
    order_id = client.post('/orders', json={'Items': [ITEM]}).json()['OrderId']
    assert client.post(f'/orders/{order_id}/solve', headers=MANAGER).status_code == 200
    saved = store.find_solution(order_id)
    update_box(MaxWeight=30)
    response = client.post(f'/orders/{order_id}/solve', headers=MANAGER)
    assert response.status_code == 422
    assert '28 kg' in response.json()['detail']
    assert store.find_solution(order_id) == saved


def test_changed_inventory_is_rechecked_when_submitting_a_draft():
    boxes.add_box_type(box())
    order_id = client.post('/orders', json={'Items': [ITEM]}).json()['OrderId']
    update_box(MaxWeight=30)
    assert client.post(f'/orders/{order_id}/submit').status_code == 422
    assert client.get(f'/orders/{order_id}').json()['Status'] == 'DRAFT'


def test_unlimited_active_weight_allows_heavy_items_with_no_artificial_cap():
    boxes.add_box_type(box(MaxWeight=None))
    assert client.get('/orders/item-weight-limit').json() == {'MaxItemWeightKg': None, 'HasAvailableBoxes': True}
    response = client.post('/orders', json={'Items': [{**ITEM, 'Weight': 80}]})
    assert response.status_code == 201
    solved = client.post(f"/orders/{response.json()['OrderId']}/solve", headers=MANAGER)
    assert solved.status_code == 200
    assert solved.json()['rejects'] == []


def test_no_available_boxes_allows_drafts_but_not_optimisation():
    boxes.add_box_type(box(MaximumBoxes=0))
    assert client.get('/orders/item-weight-limit').json() == {'MaxItemWeightKg': None, 'HasAvailableBoxes': False}
    response = client.post('/orders', json={'Items': [{**ITEM, 'Weight': 80}]})
    assert response.status_code == 201
    assert client.post(f"/orders/{response.json()['OrderId']}/solve", headers=MANAGER).status_code == 409


def test_boxes_with_no_remaining_payload_never_become_unlimited():
    boxes.add_box_type(box(MaxWeight=2, BoxWeight=2))
    assert client.get('/orders/item-weight-limit').json()['MaxItemWeightKg'] == 0
    assert client.post('/orders', json={'Items': [{**ITEM, 'Weight': 0.001}]}).status_code == 422


def test_capacity_endpoint_requires_authentication():
    assert client.get('/orders/item-weight-limit', headers={'Authorization': ''}).status_code == 401
