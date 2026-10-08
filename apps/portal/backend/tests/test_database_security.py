from sqlalchemy import text

from app import store
from app.database import get_engine
from app.models import Item, Order

APPLICATION_TABLES = {
    "portal_users",
    "orders",
    "order_items",
    "box_types",
    "solutions",
}
APPLICATION_SEQUENCES = {
    "order_id_sequence",
    "order_reference_sequence",
    "order_items_id_seq",
    "box_types_sort_key_seq",
}


def test_application_tables_have_rls_enabled():
    with get_engine().connect() as connection:
        rows = connection.execute(
            text(
                "select relname, relrowsecurity from pg_class "
                "join pg_namespace on pg_namespace.oid = pg_class.relnamespace "
                "where nspname = 'public' and relname = any(:tables)"
            ),
            {"tables": list(APPLICATION_TABLES)},
        ).all()

    assert {name for name, _ in rows} == APPLICATION_TABLES
    assert all(enabled for _, enabled in rows)


def test_client_roles_have_no_application_table_privileges():
    privileges = (
        "SELECT",
        "INSERT",
        "UPDATE",
        "DELETE",
        "TRUNCATE",
        "REFERENCES",
        "TRIGGER",
    )
    with get_engine().connect() as connection:
        for role in ("anon", "authenticated"):
            for table in APPLICATION_TABLES:
                for privilege in privileges:
                    assert not connection.scalar(
                        text("select has_table_privilege(:role, :table, :privilege)"),
                        {
                            "role": role,
                            "table": f"public.{table}",
                            "privilege": privilege,
                        },
                    )


def test_client_roles_cannot_use_application_sequences():
    with get_engine().connect() as connection:
        existing = set(
            connection.scalars(
                text(
                    "select relname from pg_class "
                    "join pg_namespace on pg_namespace.oid = pg_class.relnamespace "
                    "where nspname = 'public' and relkind = 'S'"
                )
            )
        )
        assert APPLICATION_SEQUENCES <= existing
        for role in ("anon", "authenticated"):
            for sequence in APPLICATION_SEQUENCES:
                for privilege in ("USAGE", "SELECT", "UPDATE"):
                    assert not connection.scalar(
                        text("select has_sequence_privilege(:role, :sequence, :privilege)"),
                        {
                            "role": role,
                            "sequence": f"public.{sequence}",
                            "privilege": privilege,
                        },
                    )


def test_default_privileges_do_not_grant_client_table_or_sequence_access():
    with get_engine().connect() as connection:
        grants = connection.scalar(
            text(
                "select count(*) from pg_default_acl defaults "
                "join pg_namespace namespace on namespace.oid = defaults.defaclnamespace "
                "cross join lateral aclexplode(defaults.defaclacl) acl "
                "join pg_roles grantee on grantee.oid = acl.grantee "
                "where namespace.nspname = 'public' "
                "and defaults.defaclobjtype in ('r', 'S') "
                "and grantee.rolname in ('anon', 'authenticated')"
            )
        )

    assert grants == 0


def test_backend_role_can_still_use_tables_and_sequences():
    created = store.save_order(
        Order(
            Items=[Item(
                ItemCode="ITM-001",
                ItemReference="Security boundary check",
                Width=1,
                Length=1,
                Depth=1,
                Weight=1,
            )]
        )
    )

    assert store.find_order(created.order_id) == created
