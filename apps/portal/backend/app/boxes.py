"""Warehouse box types. TODO(#30): move to Supabase. Interiors match contract/fixtures."""

from __future__ import annotations

from app.models import BoxType

# Chosen so portal.to_contract yields the fixture inner_dims:
#   BOX-S [220, 160, 120], BOX-M [320, 240, 180], BOX-L [450, 350, 300]
DEFAULT_BOX_TYPES: list[BoxType] = [
    BoxType(
        Reference="BOX-S",
        Width=220,
        Length=160,
        Depth=120,
        MaxWeight=15.0,
        BoxWeight=0.12,
        Active=True,
    ),
    BoxType(
        Reference="BOX-M",
        Width=320,
        Length=240,
        Depth=180,
        MaxWeight=25.0,
        BoxWeight=0.21,
        Active=True,
    ),
    BoxType(
        Reference="BOX-L",
        Width=450,
        Length=350,
        Depth=300,
        MaxWeight=32.0,
        BoxWeight=0.38,
        Active=True,
    ),
]


def active_box_types() -> list[BoxType]:
    """Active boxes the solver may pack into. TODO(#30): read from Supabase."""
    return [box for box in DEFAULT_BOX_TYPES if box.active]
