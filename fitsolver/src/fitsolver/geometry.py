"""Geometry core. All integer arithmetic — no floats, no epsilon comparisons.

Phase 1 uses corner-point candidate generation: O(n^2) but obviously correct
and trivially property-testable. If (and only if) the profiler indicts this
in Sprint 2, swap in Empty Maximal Spaces behind the same `place` signature.
"""
from __future__ import annotations

from .domain import Carton, Item, Placement

# The 6 axis-aligned permutations of (w, d, h).
# Index = the `orientation` field in the contract. Never reorder this table.
_PERMS: tuple[tuple[int, int, int], ...] = (
    (0, 1, 2), (0, 2, 1), (1, 0, 2), (1, 2, 0), (2, 0, 1), (2, 1, 0),
)


def orientations(item: Item) -> list[tuple[int, tuple[int, int, int]]]:
    """(orientation_index, rotated_dims) pairs permitted for this item."""
    w, d, h = item.dims
    base = (w, d, h)
    if item.allowed_rotations == "fixed":
        return [(0, base)]
    if item.allowed_rotations == "upright":
        # height axis stays vertical: only the two yaw rotations
        out = [(0, (w, d, h))]
        if w != d:
            out.append((2, (d, w, h)))  # perm (1,0,2)
        return out
    seen: set[tuple[int, int, int]] = set()
    out = []
    for idx, perm in enumerate(_PERMS):
        dims = (base[perm[0]], base[perm[1]], base[perm[2]])
        if dims not in seen:
            seen.add(dims)
            out.append((idx, dims))
    return out


def overlaps(pos_a: tuple[int, int, int], dims_a: tuple[int, int, int],
             pos_b: tuple[int, int, int], dims_b: tuple[int, int, int]) -> bool:
    return all(pos_a[i] < pos_b[i] + dims_b[i] and pos_b[i] < pos_a[i] + dims_a[i]
               for i in range(3))


def inside(pos: tuple[int, int, int], dims: tuple[int, int, int],
           carton: Carton) -> bool:
    return all(pos[i] >= 0 and pos[i] + dims[i] <= carton.inner_dims[i]
               for i in range(3))


def _support_area(pos: tuple[int, int, int], dims: tuple[int, int, int],
                  placed: list[Placement]) -> int:
    """Area of this item's base resting on the floor or on tops of items."""
    x, y, z = pos
    w, d, _ = dims
    if z == 0:
        return w * d
    area = 0
    for p in placed:
        if p.pos[2] + p.dims[2] != z:
            continue  # its top is not at our base level
        ox = min(x + w, p.pos[0] + p.dims[0]) - max(x, p.pos[0])
        oy = min(y + d, p.pos[1] + p.dims[1]) - max(y, p.pos[1])
        if ox > 0 and oy > 0:
            area += ox * oy
    return area


def supported(pos: tuple[int, int, int], dims: tuple[int, int, int],
              placed: list[Placement], min_ratio_pct: int = 70) -> bool:
    """At least min_ratio_pct% of the base must rest on something.

    Integer comparison: area*100 >= base*ratio avoids float division.
    """
    base = dims[0] * dims[1]
    return _support_area(pos, dims, placed) * 100 >= base * min_ratio_pct


def candidates(placed: list[Placement], carton: Carton) -> list[tuple[int, int, int]]:
    """Corner points: origin plus the three exposed corners of every placement.

    Sorted bottom-first (z, then y, then x) so gravity-sensible positions are
    tried first and the greedy pass produces stable, human-packable layouts.
    """
    pts: set[tuple[int, int, int]] = {(0, 0, 0)}
    for p in placed:
        x, y, z = p.pos
        w, d, h = p.dims
        pts.add((x + w, y, z))
        pts.add((x, y + d, z))
        pts.add((x, y, z + h))
    return sorted(pts, key=lambda t: (t[2], t[1], t[0]))


def fits(pos: tuple[int, int, int], dims: tuple[int, int, int],
         carton: Carton, placed: list[Placement]) -> bool:
    return (inside(pos, dims, carton)
            and not any(overlaps(pos, dims, p.pos, p.dims) for p in placed)
            and supported(pos, dims, placed))
