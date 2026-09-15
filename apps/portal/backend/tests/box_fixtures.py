"""Reusable Box Inventory test fixtures."""

from app.models import BoxType

DEFAULT_BOX_TYPES: list[BoxType] = [
    BoxType(
        Reference="BOX-S",
        Width=220,
        Length=160,
        Depth=120,
        MaxWeight=15.0,
        BoxWeight=0.12,
        Active=True,
        MaximumBoxes=100,
    ),
    BoxType(
        Reference="BOX-M",
        Width=320,
        Length=240,
        Depth=180,
        MaxWeight=25.0,
        BoxWeight=0.21,
        Active=True,
        MaximumBoxes=100,
    ),
    BoxType(
        Reference="BOX-L",
        Width=450,
        Length=350,
        Depth=300,
        MaxWeight=32.0,
        BoxWeight=0.38,
        Active=True,
        MaximumBoxes=100,
    ),
]
