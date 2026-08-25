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

from pydantic import BaseModel, ConfigDict, Field


class PortalModel(BaseModel):
    """Shared validation behaviour for all Portal models."""

    model_config = ConfigDict(
        populate_by_name=True,
        extra="forbid",
        str_strip_whitespace=True,
    )


class Item(PortalModel):
    """An item to be packed."""

    item_code: str = Field(alias="ItemCode", min_length=1)
    item_reference: str = Field(alias="ItemReference", min_length=1)
    width: int = Field(alias="Width", gt=0)
    length: int = Field(alias="Length", gt=0)
    depth: int = Field(alias="Depth", gt=0)
    weight: float = Field(alias="Weight", gt=0)
    box_group: str | None = Field(default=None, alias="BoxGroup", min_length=1)


# TODO(#30): Persist reusable BoxType data in Supabase independently from
# orders. Box types are reference data shared across orders, not order content.
class BoxType(PortalModel):
    """Reusable box type reference data, independent of any single order.

    Omitted optional fields carry meaning: no `max_weight` means no weight
    limit, no `box_weight` means empty-box weight is not considered, and no
    `maximum_boxes` means unlimited quantity.
    """

    reference: str = Field(alias="Reference", min_length=1)
    width: float = Field(alias="Width", gt=0)
    length: float = Field(alias="Length", gt=0)
    depth: float = Field(alias="Depth", gt=0)
    max_weight: float | None = Field(default=None, alias="MaxWeight", gt=0)
    box_weight: float | None = Field(default=None, alias="BoxWeight", gt=0)
    active: bool = Field(default=True, alias="Active")
    maximum_boxes: int | None = Field(default=None, alias="MaximumBoxes", gt=0)


class Order(PortalModel):
    """An order containing items to be packed."""

    items: list[Item] = Field(alias="Items", min_length=1)


class StoredOrder(Order):
    """An order that FitPortal has accepted and assigned a reference to.

    The order ID is assigned by the Portal, so it is never supplied by the
    caller and only appears on orders that already exist. `OrderId` is the
    public `ORD-###` representation of the order's internal numeric database
    ID, so no separate reference column is needed.
    """

    order_id: str = Field(alias="OrderId")
