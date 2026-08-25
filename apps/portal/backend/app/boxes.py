"""The box types the warehouse stocks.

Reference data, not order content, so it is deliberately kept out of `Order`.
Ticket #30 moves this to Supabase; until then it is a module-level catalogue so
the solve endpoint has something to pack into.

The three SKUs and their interiors reproduce the solver's committed fixtures
(`contract/fixtures/`), so a solved order and a fixture render at the same scale
and a difference on screen means a real difference rather than two unrelated
catalogues.

Field order matters here. `fitsolver.portal.AXIS_ORDER` reads Portal boxes as
(Width, Length, Depth) into the solver's (x, y, z), so these values are chosen to
produce the fixture `inner_dims` exactly. Which of those axes is vertical is still
open with the client; see `docs/decisions/0006-portal-solver-integration.md`.
"""

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
    """The catalogue the solver may draw from.

    TODO(#30): read this from Supabase. Keep the return type so callers do not
    change when persistence lands.
    """
    return [box for box in DEFAULT_BOX_TYPES if box.active]
