"""Persistent advisory settings and operational-manager permissions."""

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import text

from app import boxes, database, store
from app.main import app
from app.models import BoxType, BoxTypeUpdate, ManualHandlingSettings, Role
from app.repositories import settings
from tests.auth_helpers import auth_headers

client = TestClient(app)
PATH = '/settings/manual-handling'
SUPERVISOR = auth_headers(Role.SUPERVISOR)


@pytest.fixture(autouse=True)
def reset_settings():
    store.reset()
    with database.session_scope() as session:
        settings.set_manual_handling(session, ManualHandlingSettings(WarningThresholdKg=None))
    yield
    store.reset()
    with database.session_scope() as session:
        settings.set_manual_handling(session, ManualHandlingSettings(WarningThresholdKg=None))


@pytest.mark.parametrize('role', list(Role))
def test_every_role_can_read_the_unconfigured_setting(role):
    response = client.get(PATH, headers=auth_headers(role))
    assert response.status_code == 200
    assert response.json() == {'WarningThresholdKg': None}


@pytest.mark.parametrize('role', [Role.SUPERVISOR, Role.ADMINISTRATOR])
def test_managers_can_set_and_change_the_persisted_threshold(role):
    for threshold in [20, 15.5]:
        response = client.put(PATH, headers=auth_headers(role), json={'WarningThresholdKg': threshold})
        assert response.status_code == 200, response.text
        database.dispose_engine()
        for reader_role in Role:
            assert client.get(PATH, headers=auth_headers(reader_role)).json() == {'WarningThresholdKg': threshold}
    with database.session_scope() as session:
        assert session.scalar(text('SELECT count(*) FROM manual_handling_settings')) == 1


@pytest.mark.parametrize('role', [Role.USER])
@pytest.mark.parametrize('threshold', [20, None])
def test_other_roles_cannot_change_or_disable_warnings(role, threshold):
    client.put(PATH, headers=SUPERVISOR, json={'WarningThresholdKg': 15})
    response = client.put(PATH, headers=auth_headers(role), json={'WarningThresholdKg': threshold})
    assert response.status_code == 403
    assert client.get(PATH).json()['WarningThresholdKg'] == 15


@pytest.mark.parametrize('method', ['get', 'put'])
def test_unauthenticated_access_is_rejected(method):
    options = {'headers': {'Authorization': ''}}
    if method == 'put':
        options['json'] = {'WarningThresholdKg': 20}
    assert getattr(client, method)(PATH, **options).status_code == 401


@pytest.mark.parametrize('payload', [
    {}, {'WarningThresholdKg': 0}, {'WarningThresholdKg': -1},
    {'WarningThresholdKg': 'not a weight'}, {'WarningThresholdKg': 10, 'BlockOptimisation': True},
])
def test_invalid_settings_are_rejected_without_changing_the_previous_value(payload):
    client.put(PATH, headers=SUPERVISOR, json={'WarningThresholdKg': 15})
    assert client.put(PATH, headers=SUPERVISOR, json=payload).status_code == 422
    assert client.get(PATH).json()['WarningThresholdKg'] == 15


@pytest.mark.parametrize('value', [float('inf'), float('-inf'), float('nan')])
def test_non_finite_thresholds_are_rejected(value):
    with pytest.raises(ValidationError):
        ManualHandlingSettings(WarningThresholdKg=value)


@pytest.mark.parametrize('role', [Role.SUPERVISOR, Role.ADMINISTRATOR])
def test_managers_can_explicitly_turn_warnings_off(role):
    client.put(PATH, headers=SUPERVISOR, json={'WarningThresholdKg': 15})
    assert client.put(PATH, headers=auth_headers(role), json={'WarningThresholdKg': None}).json() == {'WarningThresholdKg': None}


def test_warning_threshold_never_blocks_valid_packing_or_finalisation():
    client.put(PATH, headers=SUPERVISOR, json={'WarningThresholdKg': 5})
    boxes.add_box_type(BoxType(Reference='HEAVY', Width=500, Length=500, Depth=500, MaxWeight=40, BoxWeight=2, MaximumBoxes=3))
    item = {'ItemCode': 'HEAVY', 'ItemReference': 'Heavy item', 'Width': 100, 'Length': 100, 'Depth': 100, 'Weight': 10, 'Quantity': 2}
    created = client.post('/orders', json={'Items': [item]})
    assert created.status_code == 201
    order_id = created.json()['OrderId']
    solution = client.post(f'/orders/{order_id}/solve', headers=SUPERVISOR)
    assert solution.status_code == 200
    assert solution.json()['rejects'] == []
    summary = client.get(f'/orders/{order_id}/solution/summary').json()
    assert summary['Boxes'][0]['ContentsWeightKg'] == 20
    assert summary['Boxes'][0]['PackedWeightKg'] == 22
    assert client.get('/orders').json()[0]['MaxPackedWeightKg'] == 22
    assert client.get(f'/orders/{order_id}/solution').json() == solution.json()
    assert client.post(f'/orders/{order_id}/finalise', headers=SUPERVISOR).status_code == 200
    assert client.get('/orders').json()[0]['MaxPackedWeightKg'] == 22
    assert client.post(f'/orders/{order_id}/archive', headers=SUPERVISOR).status_code == 200
    assert client.get('/orders?view=archived').json()[0]['MaxPackedWeightKg'] == 22


def test_packed_weight_indicator_uses_saved_tare_and_clears_with_an_invalidated_solution():
    boxes.add_box_type(BoxType(Reference='HEAVY', Width=500, Length=500, Depth=500, MaxWeight=40, BoxWeight=2))
    item = {'ItemCode': 'SMALL', 'ItemReference': 'Light unit', 'Width': 100, 'Length': 100, 'Depth': 100, 'Weight': 10, 'Quantity': 2}
    order_id = client.post('/orders', json={'Items': [item]}).json()['OrderId']
    assert 'MaxPackedWeightKg' not in client.get('/orders').json()[0]
    assert client.post(f'/orders/{order_id}/solve', headers=SUPERVISOR).status_code == 200
    # Current inventory does not rewrite the weight of a previously packed box.
    boxes.update_box_type('HEAVY', BoxTypeUpdate(Width=500, Length=500, Depth=500, MaxWeight=40, BoxWeight=3, Active=True))
    assert client.get(f'/orders/{order_id}').json()['MaxPackedWeightKg'] == 22
    assert client.post(f'/orders/{order_id}/hold', headers=SUPERVISOR).status_code == 200
    assert client.get('/orders?view=backlog').json()[0]['MaxPackedWeightKg'] == 22
    assert client.post(f'/orders/{order_id}/resume', headers=SUPERVISOR).status_code == 200
    assert client.put(f'/orders/{order_id}', json={'Items': [item]}).status_code == 200
    assert 'MaxPackedWeightKg' not in client.get('/orders').json()[0]


def test_packed_weight_indicator_uses_heaviest_box_and_handles_legacy_missing_tare():
    item = {'ItemCode': 'SMALL', 'ItemReference': 'Light unit', 'Width': 10, 'Length': 10, 'Depth': 10, 'Weight': 1}
    order_id = client.post('/orders', json={'Items': [item]}).json()['OrderId']
    store.save_solution(order_id, {'rejects': [], 'cartons': [
        {'contents_mass': 19000, 'tare_mass': 2000},
        {'contents_mass': 20000},
    ]})
    assert client.get('/orders').json()[0]['MaxPackedWeightKg'] == 21
    store.save_solution(order_id, {'rejects': [], 'cartons': []})
    assert 'MaxPackedWeightKg' not in client.get('/orders').json()[0]


def test_direct_supabase_table_access_cannot_bypass_the_supervisor_permission():
    with database.session_scope() as session:
        assert session.scalar(text("SELECT relrowsecurity FROM pg_class WHERE oid = 'manual_handling_settings'::regclass"))
        for role in ['anon', 'authenticated']:
            assert not session.scalar(text("SELECT has_table_privilege(:role, 'manual_handling_settings', 'UPDATE')"), {'role': role})
