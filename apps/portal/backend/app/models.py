"""Portal data models.

Field names follow the PascalCase JSON format used across Dynamic Fit, mapped to
snake_case Python attributes by alias.

`Item` and `BoxType` implement the agreed OpenAPI contract. Dimensions are in
millimetres, and `BoxType` dimensions are internal measurements. All weights are
in kilograms.

Items are supplied per optimisation request, so an `Order` carries its own
items. Box types are reusable reference data and are therefore kept independent
of orders.
"""

from datetime import datetime, timezone
from enum import StrEnum
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

OrderStatus = Literal["DRAFT", "AWAITING_OPTIMISATION", "OPTIMISED", "FINAL"]


class Role(StrEnum):
    """Stable role values shared by the Portal API contract."""

    ADMINISTRATOR = "ADMINISTRATOR"
    SUPERVISOR = "SUPERVISOR"
    USER = "USER"


class UserStatus(StrEnum):
    ACTIVE = "ACTIVE"
    DISABLED = "DISABLED"


ROLE_LABELS: dict[Role, str] = {
    Role.ADMINISTRATOR: "Administrator",
    Role.SUPERVISOR: "Supervisor",
    Role.USER: "User",
}


class PortalModel(BaseModel):
    """Shared validation behaviour for all Portal models."""

    model_config = ConfigDict(
        populate_by_name=True,
        extra="forbid",
        str_strip_whitespace=True,
    )


class Item(PortalModel):
    """An item to pack, following the client's item schema. Quantity defaults to 1."""

    # The client's own identifier: any non-blank text, stored as given.
    item_code: str = Field(alias="ItemCode", min_length=1)
    item_reference: str = Field(alias="ItemReference", min_length=1)
    width: int = Field(alias="Width", gt=0)
    length: int = Field(alias="Length", gt=0)
    depth: int = Field(alias="Depth", gt=0)
    weight: float = Field(alias="Weight", gt=0, le=32)
    box_group: str | None = Field(default=None, alias="BoxGroup", min_length=1)
    quantity: int = Field(default=1, alias="Quantity", ge=1)

    @field_validator("box_group", mode="before")
    @classmethod
    def empty_box_group_is_none(cls, value: object) -> object:
        """Blank BoxGroup is treated as omitted."""
        if value is None:
            return None
        if isinstance(value, str) and not value.strip():
            return None
        return value


class BoxType(PortalModel):
    """Deployment-wide box inventory record, independent of any single order.

    MaximumBoxes is the quantity of this box type available to use. None means
    no limit; finalising an order subtracts the boxes used from a set quantity.
    """

    reference: str = Field(alias="Reference", min_length=1)
    width: float = Field(alias="Width", gt=0)
    length: float = Field(alias="Length", gt=0)
    depth: float = Field(alias="Depth", gt=0)
    max_weight: float | None = Field(default=None, alias="MaxWeight", gt=0)
    box_weight: float | None = Field(default=None, alias="BoxWeight", gt=0)
    active: bool = Field(default=True, alias="Active")
    maximum_boxes: int | None = Field(default=None, alias="MaximumBoxes", ge=0)


class BoxTypeUpdate(PortalModel):
    """Mutable box fields; Reference is deliberately absent and immutable."""

    width: float = Field(alias="Width", gt=0)
    length: float = Field(alias="Length", gt=0)
    depth: float = Field(alias="Depth", gt=0)
    max_weight: float | None = Field(default=None, alias="MaxWeight", gt=0)
    box_weight: float | None = Field(default=None, alias="BoxWeight", gt=0)
    active: bool = Field(alias="Active")
    maximum_boxes: int | None = Field(default=None, alias="MaximumBoxes", ge=0)


class BoxRequirement(PortalModel):
    """One solution requirement compared with current inventory."""

    reference: str = Field(alias="Reference", min_length=1)
    required: int = Field(alias="Required", ge=1)
    available: int | None = Field(default=None, alias="Available", ge=0)
    active: bool | None = Field(default=None, alias="Active")
    exists: bool = Field(alias="Exists")
    sufficient: bool = Field(alias="Sufficient")


class InventoryFeasibility(PortalModel):
    """Advisory only; finalisation re-checks inventory under row locks."""

    sufficient: bool = Field(alias="Sufficient")
    requirements: list[BoxRequirement] = Field(alias="Requirements")


class BoxImportRequest(PortalModel):
    """Final reviewed inventory states to apply as one logical operation."""

    boxes: list[BoxType] = Field(alias="Boxes", min_length=1)

    @model_validator(mode="after")
    def references_are_unique(self) -> "BoxImportRequest":
        references = [box.reference for box in self.boxes]
        duplicates = sorted(
            reference for reference in set(references) if references.count(reference) > 1
        )
        if duplicates:
            raise ValueError(
                f"Duplicate box Reference values in import: {', '.join(duplicates)}"
            )
        return self


class BoxImportResponse(PortalModel):
    """Summary of one successfully applied atomic import."""

    imported: int = Field(alias="Imported")
    boxes: list[BoxType] = Field(alias="Boxes")


class Order(PortalModel):
    """Create-order request. Portal assigns identity after validation."""

    items: list[Item] = Field(alias="Items", min_length=1)


class StoredOrder(Order):
    """A stored order. Identity and lifecycle fields are assigned by Portal."""

    order_id: str = Field(alias="OrderId")
    reference: str = Field(alias="Reference", min_length=1)
    status: OrderStatus = Field(default="DRAFT", alias="Status")
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc), alias="CreatedAt"
    )


class PortalUser(PortalModel):
    id: UUID = Field(alias="Id")
    auth_user_id: UUID = Field(alias="AuthUserId")
    email: str = Field(alias="Email", min_length=3)
    display_name: str | None = Field(default=None, alias="DisplayName", min_length=1)
    role: Role = Field(alias="Role")
    status: UserStatus = Field(alias="Status")
    created_at: datetime = Field(alias="CreatedAt")
    updated_at: datetime = Field(alias="UpdatedAt")


class UserCreate(PortalModel):
    email: str = Field(alias="Email", min_length=3)
    password: str = Field(alias="Password", min_length=8)
    display_name: str | None = Field(default=None, alias="DisplayName", min_length=1)
    role: Role = Field(default=Role.USER, alias="Role")

    @field_validator("email")
    @classmethod
    def normalise_email(cls, value: str) -> str:
        value = value.strip().lower()
        if "@" not in value or value.startswith("@") or value.endswith("@"):
            raise ValueError("Email must be a valid address")
        return value


class UserUpdate(PortalModel):
    display_name: str | None = Field(default=None, alias="DisplayName", min_length=1)
    role: Role = Field(alias="Role")


class VisualizerHandoff(PortalModel):
    solution_url: str = Field(alias="SolutionUrl")
    expires_in: int = Field(alias="ExpiresIn", gt=0)
