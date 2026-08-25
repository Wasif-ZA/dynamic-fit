"""BoxPacker-equivalent baseline (dvdoug/BoxPacker v3/v4 algorithm, in Python).

Why reimplement rather than call the real thing: BoxPacker is PHP. Requiring
PHP + composer in CI to produce a comparison number is fragile, and you cannot
run it inside the Python bench harness. This is a faithful port of the
*algorithm* so both packers can be measured on identical inputs, in-process.

Validate it against the real library once, by hand, and record the delta in
the sprint log. Then use this for continuous comparison.

BoxPacker's algorithm, as implemented here:

  Packer.pack()
    - sort items: keep-flat first, then volume desc, then weight desc
    - for each box type (volume ascending), run VolumePacker over ALL
      remaining items; keep the box that packs the most item volume
    - repeat with what is left
    - WeightRedistributor: try to level contents across the chosen boxes

  VolumePacker.pack()  -- layer / row / column structure
    - fill along x to form a row
    - when nothing more fits in the row, start a new row (advance y)
    - when nothing more fits in the layer, start a new layer (advance z)
    - orientation chosen per item to fit the current remaining space snugly

The structural point: it is ONE deterministic pass. No restarts, no search.
That is precisely the weakness a budgeted anytime solver exploits.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from fitsolver.domain import Carton, Item, PackedCarton, Placement  # noqa: E402
from fitsolver.geometry import orientations  # noqa: E402


def _sort_items(items: list[Item]) -> list[Item]:
    """BoxPacker's ItemList comparator, approximately."""
    return sorted(
        items,
        key=lambda i: (i.allowed_rotations != "any", i.volume, i.mass),
        reverse=True,
    )


def _best_orientation(item: Item, space: tuple[int, int, int]):
    """Pick the orientation that fits the remaining space most snugly.

    BoxPacker's OrientatedItemFactory prefers orientations that leave least
    wasted width/depth in the current row, with a slight preference for
    keeping height low.
    """
    best = None
    best_key = None
    for idx, dims in orientations(item):
        if any(dims[a] > space[a] for a in range(3)):
            continue
        # least wasted x, then least wasted y, then least height
        key = (space[0] - dims[0], space[1] - dims[1], dims[2])
        if best_key is None or key < best_key:
            best_key, best = key, (idx, dims)
    return best


def volume_pack(carton: Carton, items: list[Item]
                ) -> tuple[PackedCarton, list[Item]]:
    """Layer / row fill of a single carton. Returns (packed, leftovers)."""
    cw, cd, ch = carton.inner_dims
    pc = PackedCarton(carton=carton)
    remaining = list(items)
    mass = 0
    limit = carton.max_contents_mass

    z = 0
    seq = 0
    while z < ch and remaining:
        layer_height = 0
        y = 0
        while y < cd and remaining:
            row_depth = 0
            x = 0
            placed_in_row = False
            while x < cw and remaining:
                space = (cw - x, cd - y, ch - z)
                chosen = None
                for n, item in enumerate(remaining):
                    if limit is not None and mass + item.mass > limit:
                        continue
                    o = _best_orientation(item, space)
                    if o is not None:
                        chosen = (n, item, o)
                        break
                if chosen is None:
                    break
                n, item, (idx, dims) = chosen
                pc.placements.append(Placement(item=item, pos=(x, y, z),
                                               dims=dims, orientation=idx,
                                               sequence=seq))
                seq += 1
                mass += item.mass
                remaining.pop(n)
                x += dims[0]
                row_depth = max(row_depth, dims[1])
                layer_height = max(layer_height, dims[2])
                placed_in_row = True
            if not placed_in_row:
                break
            y += row_depth
        if layer_height == 0:
            break
        z += layer_height
    return pc, remaining


def _redistribute(cartons: list[PackedCarton]) -> list[PackedCarton]:
    """WeightRedistributor, simplified: drop any carton whose contents fit
    into the others. BoxPacker levels weight; the measurable effect on our
    metrics is carton elimination, so that is what we model."""
    changed = True
    while changed and len(cartons) > 1:
        changed = False
        cartons.sort(key=lambda c: len(c.placements))
        donor = cartons[0]
        moved = []
        for p in donor.placements:
            for target in cartons[1:]:
                pcx, left = volume_pack(
                    target.carton,
                    [q.item for q in target.placements] + [p.item])
                if not left:
                    target.placements = pcx.placements
                    moved.append(p)
                    break
        if len(moved) == len(donor.placements):
            cartons = cartons[1:]
            changed = True
    return cartons


def boxpacker_pack(items: list[Item], cartons: list[Carton]
                   ) -> tuple[list[PackedCarton], list[Item]]:
    """Full BoxPacker-equivalent solve. Single deterministic pass."""
    remaining = _sort_items(list(items))
    by_volume = sorted(cartons, key=lambda c: c.volume)
    out: list[PackedCarton] = []

    while remaining:
        best: tuple[PackedCarton, list[Item]] | None = None
        best_vol = -1
        for carton in by_volume:
            pc, left = volume_pack(carton, remaining)
            if not pc.placements:
                continue
            vol = sum(p.dims[0] * p.dims[1] * p.dims[2] for p in pc.placements)
            if vol > best_vol:
                best_vol, best = vol, (pc, left)
        if best is None:
            break
        out.append(best[0])
        remaining = best[1]

    out = _redistribute(out)
    return out, remaining
