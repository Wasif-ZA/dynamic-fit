# The packing contract

> **Superseded, 2026-08-25.** This document describes an interface that was never
> implemented. The interface everything actually speaks is
> [`contract/request.schema.json`](../contract/request.schema.json) and
> [`contract/solution.schema.json`](../contract/solution.schema.json), which the
> solver emits, the visualiser renders, and CI validates on every build.
>
> Keep reading it for the reasoning: the units and axes rules, the invariant list,
> and the change process are all still live, and
> [ADR-0006](decisions/0006-the-implemented-schema-is-canonical.md) records what was
> carried across and what was lost. Do not build against the field names below.


This is our interface to the rest of the project. The visualiser team and the portal team build
against **this document**.

We build the solver only ([ADR-0003](decisions/0003-solver-only-scope.md)), so this specification is
our real deliverable to the other teams. A change here changes someone else's sprint.

## For the visualiser team, in short

You need three things out of a response and can ignore the rest:

1. `containers[]` is one entry per physical box used. Each carries its `interior` dimensions, so you
   know how big to draw the room.
2. `containers[].placements[]` is every item in that box, with `position` (the corner it sits at)
   and `size` (how big it is **as placed**, rotation already applied). Draw a cuboid at `position`
   of `size`. That is the whole rendering job.
3. `placements[].step` is a global 1-based pack order across the whole response. Sort by `step` and
   reveal one item at a time and you have the step-by-step player the client asked for.

**You never do rotation maths.** We resolve it and hand you final dimensions.

The [worked examples](#worked-examples) below are complete and real. Copy one into a file, point
your renderer at it, and build the entire visualiser before our solver places a single item.

## Units and axes

**All lengths are integer millimetres. All weights are integer grams.** No floats, no unit
suffixes. See [ADR-0002](decisions/0002-units-and-coordinates.md).

The origin `(0,0,0)` is the **inside** bottom-left-back corner of the box.

```
        y (height, up)
        |
        |
        +--------- x (width)
       /
      z (depth, toward viewer)
```

`position` is the corner of the item nearest the origin, never its centre. An item at
`position: {x:0, y:0, z:0}` with `size: {width:150, height:100, depth:50}` fills `x` 0 to 150,
`y` 0 to 100, `z` 0 to 50.

Box dimensions are **interior usable space**, wall thickness already excluded. The client flagged
this and it is still open with him, so treat it as an assumption we wrote down rather than a fact he
confirmed. See [open question 2](client-requirements.md#open-questions-for-the-client).

**Volumes are cubic millimetres and do not fit in 32 bits.** A shipping container is roughly
12000 x 2400 x 2600 mm, which is about 7.5e10. Any volume is a 64-bit integer. This has bitten
people before.

## Request

```jsonc
{
  "requestId": "ord-10432",     // echoed back, for correlating logs
  "mode": "standard",           // standard | fluid | own_packaging
  "boxes":  [ /* box types the warehouse stocks */ ],
  "items":  [ /* what needs to ship */ ],
  "rules":  { "incompatibleGroups": [ /* groups that cannot share a box */ ] }
}
```

Required: `requestId`, `boxes` (at least one), `items` (at least one). `mode` defaults to
`standard`, which is the only one implemented.

### Box

A box is a **type**, not a physical box. The solver may use a type many times, and each physical use
appears as its own entry in `containers[]`.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `id` | string | yes | Unique among boxes in this request |
| `name` | string | no | Human label, for display. Not used by the solver |
| `interior` | dimensions | yes | Usable space **inside**, wall thickness already excluded |
| `maxWeight` | int (g) | no | Gross limit, **including** `tareWeight`. Omit for no limit |
| `tareWeight` | int (g) | no, default 0 | Weight of the empty box. Counts toward `maxWeight` |
| `available` | int or null | no, default null | How many are on hand. `null` means effectively unlimited, the normal case |

A `dimensions` object is `{ "width": int, "height": int, "depth": int }`, all greater than zero.

### Item

An item is a **line**, not a unit. `quantity: 3` means three identical units, and each appears
separately in the response.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `id` | string | yes | Unique among items. Identifies the **line** |
| `reference` | string | no | The warehouse's own SKU. Passed through untouched |
| `name` | string | no | Human label for display |
| `size` | dimensions | yes | Per unit |
| `weight` | int (g) | no, default 0 | **Per unit**, not per line |
| `quantity` | int | no, default 1 | How many identical units |
| `groups` | string[] | no, default [] | Free-text tags, for example `DG-3` or `keyboards` |

### Rules

| Field | Type | Meaning |
|---|---|---|
| `incompatibleGroups` | string[][] | Each entry is a set of groups where **no two members may share a box** |
| `keepTogether` | string[] | Groups whose members should share a box where possible. A preference: the solver breaks it rather than failing the order |

Rules are expressed over **groups**, never over item IDs. That is what makes the mechanism generic
enough for both dangerous goods classes and the client's "keyboards in one box, headphones in
another" example. It is a core requirement, not a stretch goal
([R1](client-requirements.md#r1-packing-groups-core)).

## Response

```jsonc
{
  "requestId": "ord-10432",
  "status": "solved",           // solved | partial | rejected
  "mode": "standard",
  "containers": [ /* one per physical box used */ ],
  "unpacked":   [ /* anything we could not place, each with a reason */ ],
  "metrics":    { "solveTimeMs": 12, "containerCount": 1, "volumeUtilisation": 0.3 },
  "warnings":   [ /* non-fatal notes for humans */ ]
}
```

`status` is **derived**, never set independently:

| status | meaning |
|---|---|
| `solved` | every unit placed, `unpacked` empty |
| `partial` | some placed, some not |
| `rejected` | nothing placed |

The client's instruction was "just reject the order". We return the detail rather than a bare error
so the portal can show *which* item failed and *why*. What to do about it is the portal's call.

### Container

One **physical** box. Two uses of the same type are two entries.

| Field | Type | Meaning |
|---|---|---|
| `instanceId` | string | Unique per physical box, for example `B-SMALL#1` |
| `boxId` | string | The box type this was drawn from |
| `name` | string | Box type's label, copied through |
| `interior` | dimensions | Copied from the box type, so a consumer never cross-references the request |
| `placements` | placement[] | Everything in this box |
| `utilisation` | object | `volumeUsed`, `volumeTotal`, `volumeRatio`, `weightUsed` (gross, includes tare), `weightLimit` |

### Placement

| Field | Type | Meaning |
|---|---|---|
| `step` | int | **Global** 1-based pack order across the whole response, not per container |
| `itemId` | string | The item line |
| `unit` | int | Which unit of that line, 1-based. A line with `quantity: 3` produces units 1, 2, 3 |
| `reference`, `name` | string | Copied through for display and scanning |
| `position` | position | Corner nearest the origin: `{x, y, z}`, all at least 0 |
| `size` | dimensions | **As placed**, rotation already applied |
| `rotation` | enum | `WHD`, `WDH`, `HWD`, `HDW`, `DWH`, `DHW`. How the item's original width, height, depth map onto placed x, y, z. `WHD` is unrotated |

`rotation` is informational. `size` already reflects it, so a renderer can ignore the field
entirely. It exists so a packer can be told "turn it on its side".

`step` numbers must be `1..n` across the whole response with no gaps and no repeats.

### Unpacked

| Field | Type | Meaning |
|---|---|---|
| `itemId`, `unit` | string, int | Which unit failed |
| `reference` | string | SKU, for display |
| `reason` | enum | See below |
| `detail` | string | Human-readable explanation for the portal to show a packer |

| reason | meaning |
|---|---|
| `NO_BOX_FITS` | larger than the interior of every box type, in any orientation |
| `INCOMPATIBLE` | it fits, but group rules bar it from every box it could have shared |
| `EXCEEDS_WEIGHT` | fits by volume but would breach a weight limit |

### Metrics

`solveTimeMs` (wall clock inside the solver; the client's bar is 1000 to 2000 ms for one order),
`containerCount`, `volumeUtilisation` (0 to 1, our headline efficiency number), and `algorithm`
(which strategy produced this, so we can compare approaches on the same input).

## Worked examples

Complete and consistent. Use them as fixtures.

### 1. Simple order, solved

Two paperbacks and a mug into one small carton.

**Request**

```json
{
  "requestId": "ord-10432",
  "mode": "standard",
  "boxes": [
    {
      "id": "B-SMALL",
      "name": "Small carton",
      "interior": { "width": 300, "height": 200, "depth": 150 },
      "maxWeight": 15000,
      "tareWeight": 250,
      "available": null
    }
  ],
  "items": [
    {
      "id": "I-BOOK",
      "reference": "SKU-BOOK-01",
      "name": "Paperback",
      "size": { "width": 150, "height": 100, "depth": 50 },
      "weight": 400,
      "quantity": 2
    },
    {
      "id": "I-MUG",
      "reference": "SKU-MUG-01",
      "name": "Ceramic mug, boxed",
      "size": { "width": 100, "height": 100, "depth": 120 },
      "weight": 350,
      "quantity": 1
    }
  ]
}
```

**Response**

```json
{
  "requestId": "ord-10432",
  "status": "solved",
  "mode": "standard",
  "containers": [
    {
      "instanceId": "B-SMALL#1",
      "boxId": "B-SMALL",
      "name": "Small carton",
      "interior": { "width": 300, "height": 200, "depth": 150 },
      "placements": [
        {
          "step": 1,
          "itemId": "I-BOOK",
          "unit": 1,
          "reference": "SKU-BOOK-01",
          "name": "Paperback",
          "position": { "x": 0, "y": 0, "z": 0 },
          "size": { "width": 150, "height": 100, "depth": 50 },
          "rotation": "WHD"
        },
        {
          "step": 2,
          "itemId": "I-BOOK",
          "unit": 2,
          "reference": "SKU-BOOK-01",
          "name": "Paperback",
          "position": { "x": 150, "y": 0, "z": 0 },
          "size": { "width": 150, "height": 100, "depth": 50 },
          "rotation": "WHD"
        },
        {
          "step": 3,
          "itemId": "I-MUG",
          "unit": 1,
          "reference": "SKU-MUG-01",
          "name": "Ceramic mug, boxed",
          "position": { "x": 0, "y": 100, "z": 0 },
          "size": { "width": 100, "height": 100, "depth": 120 },
          "rotation": "WHD"
        }
      ],
      "utilisation": {
        "volumeUsed": 2700000,
        "volumeTotal": 9000000,
        "volumeRatio": 0.3,
        "weightUsed": 1400,
        "weightLimit": 15000
      }
    }
  ],
  "unpacked": [],
  "metrics": {
    "solveTimeMs": 12,
    "containerCount": 1,
    "volumeUtilisation": 0.3,
    "algorithm": "first-fit-decreasing"
  }
}
```

Worth checking by hand, because it shows what "correct" means. The two books sit side by side along
`x` and occupy `y` 0 to 100. The mug sits above them at `y` 100 to 200. Nothing overlaps, nothing
exceeds the interior, and `weightUsed` is 400 + 400 + 350 + 250 tare = 1400 g.

### 2. Incompatible groups force a second box

Two dangerous goods items in different classes. They would fit in one carton easily, but may not
legally share it.

**Request**

```json
{
  "requestId": "ord-10433",
  "mode": "standard",
  "boxes": [
    {
      "id": "B-SMALL",
      "name": "Small carton",
      "interior": { "width": 300, "height": 200, "depth": 150 },
      "maxWeight": 15000,
      "tareWeight": 250,
      "available": null
    }
  ],
  "items": [
    {
      "id": "I-BLEACH",
      "reference": "SKU-CLEAN-08",
      "name": "Bleach concentrate 1L",
      "size": { "width": 100, "height": 100, "depth": 200 },
      "weight": 1200,
      "quantity": 1,
      "groups": ["DG-8"]
    },
    {
      "id": "I-PEROXIDE",
      "reference": "SKU-CLEAN-05",
      "name": "Peroxide solution 1L",
      "size": { "width": 100, "height": 100, "depth": 200 },
      "weight": 1100,
      "quantity": 1,
      "groups": ["DG-5"]
    }
  ],
  "rules": {
    "incompatibleGroups": [["DG-5", "DG-8"]]
  }
}
```

**Response** (abbreviated: the second container mirrors the first)

```json
{
  "requestId": "ord-10433",
  "status": "solved",
  "mode": "standard",
  "containers": [
    {
      "instanceId": "B-SMALL#1",
      "boxId": "B-SMALL",
      "name": "Small carton",
      "interior": { "width": 300, "height": 200, "depth": 150 },
      "placements": [
        {
          "step": 1,
          "itemId": "I-BLEACH",
          "unit": 1,
          "reference": "SKU-CLEAN-08",
          "name": "Bleach concentrate 1L",
          "position": { "x": 0, "y": 0, "z": 0 },
          "size": { "width": 100, "height": 200, "depth": 100 },
          "rotation": "WDH"
        }
      ],
      "utilisation": {
        "volumeUsed": 2000000,
        "volumeTotal": 9000000,
        "volumeRatio": 0.222,
        "weightUsed": 1450,
        "weightLimit": 15000
      }
    },
    {
      "instanceId": "B-SMALL#2",
      "boxId": "B-SMALL",
      "name": "Small carton",
      "interior": { "width": 300, "height": 200, "depth": 150 },
      "placements": [
        {
          "step": 2,
          "itemId": "I-PEROXIDE",
          "unit": 1,
          "reference": "SKU-CLEAN-05",
          "name": "Peroxide solution 1L",
          "position": { "x": 0, "y": 0, "z": 0 },
          "size": { "width": 100, "height": 200, "depth": 100 },
          "rotation": "WDH"
        }
      ],
      "utilisation": {
        "volumeUsed": 2000000,
        "volumeTotal": 9000000,
        "volumeRatio": 0.222,
        "weightUsed": 1350,
        "weightLimit": 15000
      }
    }
  ],
  "unpacked": [],
  "metrics": {
    "solveTimeMs": 8,
    "containerCount": 2,
    "volumeUtilisation": 0.222,
    "algorithm": "first-fit-decreasing"
  },
  "warnings": [
    "Two containers used for two items. Groups DG-5 and DG-8 are incompatible, so they cannot share a box."
  ]
}
```

This example also shows rotation. The bottle is 100 x 100 x 200 in the request, but 200 mm of depth
will not fit a 150 mm deep carton, so it is stood upright: placed size 100 x 200 x 100, rotation
`WDH` (original depth became height). The renderer just draws the placed size.

### 3. Nothing fits, rejected

**Request**

```json
{
  "requestId": "ord-10434",
  "mode": "standard",
  "boxes": [
    {
      "id": "B-SMALL",
      "name": "Small carton",
      "interior": { "width": 300, "height": 200, "depth": 150 },
      "maxWeight": 15000,
      "tareWeight": 250,
      "available": null
    }
  ],
  "items": [
    {
      "id": "I-PALLET",
      "reference": "SKU-BULK-99",
      "name": "Pallet of floor tiles",
      "size": { "width": 1200, "height": 800, "depth": 1000 },
      "weight": 450000,
      "quantity": 1
    }
  ]
}
```

**Response**

```json
{
  "requestId": "ord-10434",
  "status": "rejected",
  "mode": "standard",
  "containers": [],
  "unpacked": [
    {
      "itemId": "I-PALLET",
      "unit": 1,
      "reference": "SKU-BULK-99",
      "reason": "NO_BOX_FITS",
      "detail": "Item is 1200x800x1000 mm. The largest box interior available is 300x200x150 mm (Small carton), in any orientation."
    }
  ],
  "metrics": {
    "solveTimeMs": 1,
    "containerCount": 0,
    "volumeUtilisation": 0,
    "algorithm": "first-fit-decreasing"
  }
}
```

## Invariants

Anything claiming to implement this contract must satisfy all of these. They are the test list.

1. **In bounds.** For every placement and every axis, `position + size` is at most the container
   interior on that axis.
2. **No overlap.** No two placements in the same container share volume. Two axis-aligned boxes
   overlap only if they overlap on *all three* axes. **Touching faces are not an overlap**: an item
   ending at `x = 150` and the next starting at `x = 150` is correct packing.
3. **Conservation.** Every unit in the request appears exactly once in the response, either as a
   placement or in `unpacked`. Never both, never neither.
4. **Steps.** `step` values across the whole response are exactly `1..n`, no gaps, no repeats.
5. **Status agrees.** `solved` when `unpacked` is empty and something was placed; `rejected` when
   nothing was placed; `partial` otherwise.
6. **Rules hold.** No container holds two units whose groups appear together in an
   `incompatibleGroups` entry.
7. **Weight.** For every container, `weightUsed` equals the sum of contents plus the box's tare.

## Changing this document

1. **Additive changes are cheap.** A new optional field breaks nobody. Just do it.
2. **Breaking changes need a heads-up.** Renaming or removing a field, or changing a meaning, goes
   to the visualiser and portal teams **before** it is merged. Post in the group chat and give them
   a sprint to adapt.
3. **Update the worked examples in the same commit.** An example that contradicts the spec is worse
   than no example, because someone is building against it right now.
4. **Record the reasoning** in [`decisions/`](decisions/) if it settles a real question.
