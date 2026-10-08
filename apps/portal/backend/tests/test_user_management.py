from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.auth_admin import get_auth_admin
from app.database import session_scope
from app.db.models import PortalUserRecord
from app import user_management
from app.errors import (
    AuthAdminError,
    AuthAdminTransportError,
    DuplicateAuthUserError,
    DuplicateUserError,
    UserManagementConflictError,
)
from app.main import app
from app.models import PortalUser, Role, UserUpdate
from app.repositories import users as user_repository
from tests.auth_helpers import AUTH_USER_IDS, auth_headers

client = TestClient(app)
USER_HEADERS = auth_headers(Role.USER)
SUPERVISOR_HEADERS = auth_headers(Role.SUPERVISOR)
ADMIN_HEADERS = auth_headers(Role.ADMINISTRATOR)


class FakeAuthAdmin:
    def __init__(self):
        self.created: list[tuple[str, str, UUID]] = []
        self.deleted: list[UUID] = []
        self.existing: dict[str, UUID] = {}
        self.create_error: Exception | None = None
        self.delete_error: Exception | None = None

    def find_user_by_email(self, email: str) -> UUID | None:
        return self.existing.get(email.lower())

    def create_user(self, email: str, password: str) -> UUID:
        if self.create_error:
            raise self.create_error
        auth_user_id = uuid4()
        self.created.append((email, password, auth_user_id))
        self.existing[email.lower()] = auth_user_id
        return auth_user_id

    def delete_user(self, auth_user_id: UUID) -> None:
        self.deleted.append(auth_user_id)
        if self.delete_error:
            raise self.delete_error
        for email, existing_id in list(self.existing.items()):
            if existing_id == auth_user_id:
                del self.existing[email]


@pytest.fixture(autouse=True)
def clean_managed_users():
    with session_scope() as session:
        session.execute(
            delete(PortalUserRecord).where(
                PortalUserRecord.auth_user_id.not_in(list(AUTH_USER_IDS.values()))
            )
        )
        expected = {
            Role.USER: "USER",
            Role.SUPERVISOR: "SUPERVISOR",
            Role.ADMINISTRATOR: "ADMINISTRATOR",
        }
        for role, role_value in expected.items():
            record = user_repository.lock_user_by_auth_user_id(
                session, AUTH_USER_IDS[role]
            )
            record.role = role_value
            record.status = "ACTIVE"
    yield


@pytest.fixture
def auth_admin():
    fake = FakeAuthAdmin()
    app.dependency_overrides[get_auth_admin] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_auth_admin, None)


def create_payload(role="USER", email="new.user@fitportal.test"):
    return {
        "Email": email,
        "Password": "safe-password",
        "DisplayName": "New User",
        "Role": role,
    }


def profile(role: Role) -> dict:
    return client.get("/auth/me", headers=auth_headers(role)).json()


def create_database_user(role: Role, email: str) -> PortalUser:
    with session_scope() as session:
        return user_repository.create_user(
            session,
            auth_user_id=uuid4(),
            email=email,
            display_name=email,
            role=role,
        )


def test_user_cannot_access_user_management():
    assert client.get("/users", headers=USER_HEADERS).status_code == 403
    assert client.post(
        "/users", headers=USER_HEADERS, json=create_payload()
    ).status_code == 403


def test_supervisor_can_list_and_manage_user_accounts(auth_admin):
    created = client.post(
        "/users", headers=SUPERVISOR_HEADERS, json=create_payload()
    )
    assert created.status_code == 201, created.text
    user = created.json()

    updated = client.put(
        f"/users/{user['Id']}",
        headers=SUPERVISOR_HEADERS,
        json={"DisplayName": "Updated User", "Role": "USER"},
    )
    assert updated.status_code == 200
    assert updated.json()["DisplayName"] == "Updated User"

    disabled = client.post(
        f"/users/{user['Id']}/disable", headers=SUPERVISOR_HEADERS
    )
    assert disabled.json()["Status"] == "DISABLED"
    enabled = client.post(
        f"/users/{user['Id']}/enable", headers=SUPERVISOR_HEADERS
    )
    assert enabled.json()["Status"] == "ACTIVE"

    deleted = client.delete(f"/users/{user['Id']}", headers=SUPERVISOR_HEADERS)
    assert deleted.status_code == 204
    assert UUID(user["AuthUserId"]) in auth_admin.deleted


def test_supervisor_cannot_create_or_promote_supervisor(auth_admin):
    assert client.post(
        "/users",
        headers=SUPERVISOR_HEADERS,
        json=create_payload(role="SUPERVISOR"),
    ).status_code == 409

    user = profile(Role.USER)
    response = client.put(
        f"/users/{user['Id']}",
        headers=SUPERVISOR_HEADERS,
        json={"DisplayName": user["DisplayName"], "Role": "SUPERVISOR"},
    )
    assert response.status_code == 409


@pytest.mark.parametrize("target_role", [Role.SUPERVISOR, Role.ADMINISTRATOR])
def test_supervisor_cannot_modify_manager_accounts(target_role):
    target = profile(target_role)
    for method, suffix, body in (
        ("put", "", {"DisplayName": "Changed", "Role": target_role.value}),
        ("post", "/enable", None),
        ("post", "/disable", None),
        ("delete", "", None),
    ):
        response = client.request(
            method.upper(),
            f"/users/{target['Id']}{suffix}",
            headers=SUPERVISOR_HEADERS,
            json=body,
        )
        assert response.status_code == 409


def test_administrator_can_create_and_manage_supervisor(auth_admin):
    created = client.post(
        "/users",
        headers=ADMIN_HEADERS,
        json=create_payload(
            role="SUPERVISOR", email="new.supervisor@fitportal.test"
        ),
    )
    assert created.status_code == 201, created.text
    supervisor = created.json()

    demoted = client.put(
        f"/users/{supervisor['Id']}",
        headers=ADMIN_HEADERS,
        json={"DisplayName": "Demoted", "Role": "USER"},
    )
    assert demoted.status_code == 200
    assert demoted.json()["Role"] == "USER"


def test_administrator_can_promote_user_to_supervisor():
    user = profile(Role.USER)
    response = client.put(
        f"/users/{user['Id']}",
        headers=ADMIN_HEADERS,
        json={"DisplayName": user["DisplayName"], "Role": "SUPERVISOR"},
    )
    assert response.status_code == 200
    assert response.json()["Role"] == "SUPERVISOR"


def test_api_does_not_create_additional_administrators(auth_admin):
    response = client.post(
        "/users",
        headers=ADMIN_HEADERS,
        json=create_payload(role="ADMINISTRATOR"),
    )
    assert response.status_code == 409
    assert auth_admin.created == []


def test_final_active_administrator_cannot_demote_disable_or_delete(auth_admin):
    administrator = profile(Role.ADMINISTRATOR)
    user_id = administrator["Id"]

    demote = client.put(
        f"/users/{user_id}",
        headers=ADMIN_HEADERS,
        json={"DisplayName": administrator["DisplayName"], "Role": "USER"},
    )
    disable = client.post(f"/users/{user_id}/disable", headers=ADMIN_HEADERS)
    delete_response = client.delete(f"/users/{user_id}", headers=ADMIN_HEADERS)

    assert demote.status_code == 409
    assert disable.status_code == 409
    assert delete_response.status_code == 409
    assert auth_admin.deleted == []


def test_portal_row_failure_removes_new_supabase_identity(auth_admin, monkeypatch):
    def fail(*_args, **_kwargs):
        raise DuplicateUserError("duplicate")

    monkeypatch.setattr(user_repository, "create_user", fail)
    response = client.post(
        "/users", headers=SUPERVISOR_HEADERS, json=create_payload()
    )

    assert response.status_code == 409
    assert auth_admin.deleted == [auth_admin.created[0][2]]


def test_existing_auth_identity_without_profile_is_adopted(auth_admin):
    auth_user_id = uuid4()
    auth_admin.existing["orphan@fitportal.test"] = auth_user_id

    response = client.post(
        "/users",
        headers=ADMIN_HEADERS,
        json=create_payload(email="orphan@fitportal.test"),
    )

    assert response.status_code == 201
    assert response.json()["AuthUserId"] == str(auth_user_id)
    assert auth_admin.created == []


def test_existing_portal_profile_is_a_conflict_without_auth_changes(auth_admin):
    response = client.post(
        "/users",
        headers=ADMIN_HEADERS,
        json=create_payload(email="user@fitportal.test"),
    )

    assert response.status_code == 409
    assert auth_admin.created == []
    assert auth_admin.deleted == []


def test_supabase_duplicate_email_race_is_reconciled(auth_admin):
    auth_user_id = uuid4()
    calls = 0

    def find(email):
        nonlocal calls
        calls += 1
        return None if calls == 1 else auth_user_id

    auth_admin.find_user_by_email = find
    auth_admin.create_error = DuplicateAuthUserError("already registered")

    response = client.post(
        "/users",
        headers=ADMIN_HEADERS,
        json=create_payload(email="raced@fitportal.test"),
    )

    assert response.status_code == 201
    assert response.json()["AuthUserId"] == str(auth_user_id)


def test_unreconciled_supabase_duplicate_email_is_a_conflict(auth_admin):
    auth_admin.create_error = DuplicateAuthUserError("already registered")

    response = client.post(
        "/users",
        headers=ADMIN_HEADERS,
        json=create_payload(email="duplicate@fitportal.test"),
    )

    assert response.status_code == 409


def test_lost_create_response_reconciles_existing_auth_identity(auth_admin):
    auth_user_id = uuid4()
    calls = 0

    def find(email):
        nonlocal calls
        calls += 1
        return None if calls == 1 else auth_user_id

    auth_admin.find_user_by_email = find
    auth_admin.create_error = AuthAdminTransportError("response lost")

    response = client.post(
        "/users",
        headers=ADMIN_HEADERS,
        json=create_payload(email="lost-response@fitportal.test"),
    )

    assert response.status_code == 201
    assert response.json()["AuthUserId"] == str(auth_user_id)


def test_cleanup_failure_is_reported(auth_admin, monkeypatch):
    def fail(*_args, **_kwargs):
        raise DuplicateUserError("duplicate")

    monkeypatch.setattr(user_repository, "create_user", fail)
    auth_admin.delete_error = AuthAdminError("cleanup unavailable")

    response = client.post(
        "/users", headers=ADMIN_HEADERS, json=create_payload()
    )

    assert response.status_code == 502
    assert "cleanup must be retried" in response.json()["detail"]
    assert len(auth_admin.deleted) == 1


def test_database_delete_failure_does_not_delete_auth_identity(auth_admin, monkeypatch):
    created = client.post(
        "/users", headers=ADMIN_HEADERS, json=create_payload()
    ).json()

    def fail(*_args, **_kwargs):
        raise RuntimeError("commit failed")

    monkeypatch.setattr(user_repository, "delete_user", fail)
    response = client.delete(f"/users/{created['Id']}", headers=ADMIN_HEADERS)

    assert response.status_code == 500
    assert auth_admin.deleted == []
    with session_scope() as session:
        assert user_repository.find_by_email(session, created["Email"])


def test_auth_delete_failure_leaves_committed_profile_deletion(auth_admin):
    created = client.post(
        "/users", headers=ADMIN_HEADERS, json=create_payload()
    ).json()
    auth_admin.delete_error = AuthAdminError("Auth unavailable")

    response = client.delete(f"/users/{created['Id']}", headers=ADMIN_HEADERS)

    assert response.status_code == 502
    with session_scope() as session:
        assert user_repository.find_by_email(session, created["Email"]) is None


def test_administrator_cannot_modify_another_administrator(auth_admin):
    other = create_database_user(Role.ADMINISTRATOR, "other-admin@fitportal.test")

    for method, suffix, body in (
        ("put", "", {"DisplayName": "Changed", "Role": "USER"}),
        ("post", "/enable", None),
        ("post", "/disable", None),
        ("delete", "", None),
    ):
        response = client.request(
            method.upper(),
            f"/users/{other.id}{suffix}",
            headers=ADMIN_HEADERS,
            json=body,
        )
        assert response.status_code == 409


def test_administrator_can_demote_self_when_another_active_admin_exists():
    create_database_user(Role.ADMINISTRATOR, "other-admin@fitportal.test")
    administrator = profile(Role.ADMINISTRATOR)

    response = client.put(
        f"/users/{administrator['Id']}",
        headers=ADMIN_HEADERS,
        json={"DisplayName": administrator["DisplayName"], "Role": "USER"},
    )

    assert response.status_code == 200


def test_concurrent_self_demotions_leave_one_active_administrator():
    first = PortalUser.model_validate(profile(Role.ADMINISTRATOR))
    second = create_database_user(Role.ADMINISTRATOR, "other-admin@fitportal.test")
    barrier = Barrier(2)

    def demote(actor: PortalUser) -> str:
        barrier.wait()
        try:
            user_management.update_user(
                actor,
                actor.id,
                UserUpdate(DisplayName=actor.display_name, Role=Role.USER),
            )
            return "updated"
        except UserManagementConflictError:
            return "blocked"

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(demote, (first, second)))

    assert sorted(results) == ["blocked", "updated"]
    with session_scope() as session:
        assert user_repository.count_active_administrators(session) == 1
    assert response.json()["Role"] == "USER"


def test_concurrent_self_demotions_leave_one_active_administrator():
    first = PortalUser.model_validate(profile(Role.ADMINISTRATOR))
    second = create_database_user(Role.ADMINISTRATOR, "other-admin@fitportal.test")
    barrier = Barrier(2)

    def demote(actor):
        barrier.wait()
        try:
            user_management.update_user(
                actor,
                actor.id,
                UserUpdate(DisplayName=actor.display_name, Role=Role.USER),
            )
            return "demoted"
        except UserManagementConflictError:
            return "protected"

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(demote, (first, second)))

    assert sorted(results) == ["demoted", "protected"]
    with session_scope() as session:
        assert user_repository.count_active_administrators(session) == 1
