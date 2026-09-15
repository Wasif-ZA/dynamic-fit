"""SQLAlchemy persistence models mirroring the Supabase migrations."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    ForeignKey,
    Identity,
    Index,
    Integer,
    Numeric,
    Sequence,
    Text,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

# Sequence gaps are expected because PostgreSQL sequences are not rolled back.
ORDER_ID_SEQUENCE = Sequence("order_id_sequence", start=1)
ORDER_REFERENCE_SEQUENCE = Sequence("order_reference_sequence", start=1)

class Base(DeclarativeBase):
    pass


class PortalUserRecord(Base):
    __tablename__ = "portal_users"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    auth_user_id: Mapped[UUID] = mapped_column(Uuid, nullable=False, unique=True)
    email: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    display_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    role: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="ACTIVE")
    created_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        CheckConstraint(
            "role in ('USER', 'SUPERVISOR', 'ADMINISTRATOR')",
            name="portal_users_role_is_valid",
        ),
        CheckConstraint(
            "status in ('ACTIVE', 'DISABLED')",
            name="portal_users_status_is_valid",
        ),
        CheckConstraint(
            "length(btrim(email)) > 0", name="portal_users_email_not_blank"
        ),
        CheckConstraint(
            "display_name is null or length(btrim(display_name)) > 0",
            name="portal_users_display_name_not_blank",
        ),
    )


class OrderRecord(Base):
    __tablename__ = "orders"

    order_id: Mapped[str] = mapped_column(Text, primary_key=True)
    order_number: Mapped[int] = mapped_column(BigInteger, nullable=False, unique=True)
    reference: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now()
    )

    items: Mapped[list["OrderItemRecord"]] = relationship(
        back_populates="order",
        cascade="all, delete-orphan",
        order_by="OrderItemRecord.position",
        lazy="selectin",
    )

    __table_args__ = (
        CheckConstraint(
            "status in ('DRAFT', 'AWAITING_OPTIMISATION', 'OPTIMISED', 'FINAL')",
            name="orders_status_is_a_lifecycle_state",
        ),
        CheckConstraint(
            "length(btrim(order_id)) > 0", name="orders_order_id_not_blank"
        ),
        CheckConstraint(
            "length(btrim(reference)) > 0", name="orders_reference_not_blank"
        ),
        Index("orders_newest_first_idx", created_at.desc(), order_number.desc()),
    )


class OrderItemRecord(Base):
    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    order_id: Mapped[str] = mapped_column(
        Text, ForeignKey("orders.order_id", ondelete="CASCADE"), nullable=False
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)

    item_code: Mapped[str] = mapped_column(Text, nullable=False)
    item_reference: Mapped[str] = mapped_column(Text, nullable=False)

    width: Mapped[int] = mapped_column(Integer, nullable=False)
    length: Mapped[int] = mapped_column(Integer, nullable=False)
    depth: Mapped[int] = mapped_column(Integer, nullable=False)

    weight: Mapped[float] = mapped_column(Numeric, nullable=False)

    box_group: Mapped[str | None] = mapped_column(Text, nullable=True)

    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    order: Mapped[OrderRecord] = relationship(back_populates="items")

    __table_args__ = (
        UniqueConstraint(
            "order_id", "position", name="order_items_position_is_unique_per_order"
        ),
        CheckConstraint("position >= 0", name="order_items_position_is_zero_based"),
        CheckConstraint(
            "length(btrim(item_code)) > 0", name="order_items_item_code_not_blank"
        ),
        CheckConstraint(
            "length(btrim(item_reference)) > 0",
            name="order_items_item_reference_not_blank",
        ),
        CheckConstraint(
            "width > 0 and length > 0 and depth > 0",
            name="order_items_dimensions_are_positive",
        ),
        CheckConstraint(
            "weight > 0 and weight <= 32", name="order_items_weight_within_limits"
        ),
        CheckConstraint(
            "box_group is null or length(btrim(box_group)) > 0",
            name="order_items_box_group_not_blank",
        ),
        CheckConstraint("quantity >= 1", name="order_items_quantity_is_at_least_one"),
        Index("order_items_order_id_idx", "order_id", "position"),
    )


class BoxTypeRecord(Base):
    __tablename__ = "box_types"

    reference: Mapped[str] = mapped_column(Text, primary_key=True)
    # Existing references retain their listing position across imports.
    sort_key: Mapped[int] = mapped_column(BigInteger, Identity(), nullable=False)

    width: Mapped[float] = mapped_column(Numeric, nullable=False)
    length: Mapped[float] = mapped_column(Numeric, nullable=False)
    depth: Mapped[float] = mapped_column(Numeric, nullable=False)

    max_weight: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    box_weight: Mapped[float | None] = mapped_column(Numeric, nullable=True)

    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Quantity available to use. NULL means no limit and is never consumed.
    maximum_boxes: Mapped[int | None] = mapped_column(Integer, nullable=True)

    __table_args__ = (
        CheckConstraint(
            "length(btrim(reference)) > 0", name="box_types_reference_not_blank"
        ),
        CheckConstraint(
            "width > 0 and length > 0 and depth > 0",
            name="box_types_dimensions_are_positive",
        ),
        CheckConstraint(
            "max_weight is null or max_weight > 0",
            name="box_types_max_weight_is_positive",
        ),
        CheckConstraint(
            "box_weight is null or box_weight > 0",
            name="box_types_box_weight_is_positive",
        ),
        CheckConstraint("maximum_boxes >= 0", name="box_types_stock_is_never_negative"),
        Index("box_types_sort_key_idx", "sort_key"),
    )


class SolutionRecord(Base):
    __tablename__ = "solutions"

    order_id: Mapped[str] = mapped_column(
        Text, ForeignKey("orders.order_id", ondelete="CASCADE"), primary_key=True
    )
    solution_json: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=func.now()
    )

    __table_args__ = (
        CheckConstraint(
            "jsonb_typeof(solution_json) = 'object'",
            name="solutions_document_is_an_object",
        ),
    )
