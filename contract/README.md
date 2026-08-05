# The packing contract

This folder is our interface to the rest of the project. The visualiser team and the portal team
build against **these files**, not against our source code.

If you change anything here, you are changing someone else's sprint. Read
[Changing the contract](#changing-the-contract) before you touch it.

| File | Purpose |
|---|---|
| `packing-request.schema.json` | What we accept |
| `packing-response.schema.json` | What we return |
| `examples/` | Real request and response pairs, valid against the schemas |

## For the visualiser team, in short

You need three things out of a response and you can ignore the rest:

1. `containers[]` gives you one entry per physical box used. Each has the box's `interior`
   dimensions, so you know how big to draw the room.
2. `containers[].placements[]` gives you every item in that box, with `position` (the corner it
   sits at) and `size` (how big it is **as placed**, rotation already applied). Draw a cuboid at
   `position` of `size`. That is the whole rendering job.
3. `placements[].step` is a global 1-based pack order across the whole response. Sort by `step`
   and reveal one item at a time and you have the step-by-step player the client asked for.

You never have to do rotation maths. We resolve it and hand you final dimensions.

**`examples/` is committed so you can build the whole visualiser before our solver works.** Point
your code at a static example file, get it rendering, and swap in a live response later.

## Units and axes

**All lengths are integer millimetres. All weights are integer grams.** No floats, no unit
suffixes. See [ADR-0002](../docs/decisions/0002-units-and-coordinates.md).

The origin `(0,0,0)` is the **inside** bottom-left-back corner of the box.

```
        y (height, up)
        |
        |
        +--------- x (width)
       /
      z (depth, toward viewer)
```

`position` is the corner of the item closest to the origin, never its centre. An item at
`position: {x:0,y:0,z:0}` with `size: {width:150,height:100,depth:50}` fills `x` 0 to 150,
`y` 0 to 100, `z` 0 to 50.

Box dimensions are **interior usable space**, already excluding wall thickness. The client flagged
this and it is still open with him, so treat it as an assumption we have written down rather than a
fact he confirmed.

## Request shape

```jsonc
{
  "requestId": "ord-10432",     // echoed back, for correlating logs
  "mode": "standard",           // standard | fluid | own_packaging (only standard is implemented)
  "boxes":  [ /* box types the warehouse stocks */ ],
  "items":  [ /* what needs to ship */ ],
  "rules":  { "incompatibleGroups": [ /* groups that cannot share a box */ ] }
}
```

A **box** is a *type*, not a physical box. `available: null` means the warehouse has effectively
unlimited cartons of that type, which is the normal case. The solver may use a type many times and
each physical use appears as its own entry in `containers[]`.

An **item** is a *line*, not a unit. `quantity: 3` means three identical units. In the response each
unit appears as its own placement, distinguished by `unit` (1-based).

**Groups** are free-text tags on an item, like `"DG-3"` or `"keyboards"`. Rules are expressed over
groups, never over individual items, which is what makes the mechanism generic enough for both
dangerous goods and the client's "keyboards in one box, headphones in another" example.

## Response shape

```jsonc
{
  "requestId": "ord-10432",
  "status": "solved",           // solved | partial | rejected
  "containers": [ /* one per physical box used */ ],
  "unpacked":   [ /* anything we could not place, each with a reason */ ],
  "metrics":    { "solveTimeMs": 142, "containerCount": 1, "volumeUtilisation": 0.3 }
}
```

`status` is derived, not independent:

| status | meaning |
|---|---|
| `solved` | every unit placed, `unpacked` is empty |
| `partial` | some units placed, some not |
| `rejected` | nothing placed |

The client's instruction was "just reject the order" when something cannot be packed. We return the
detail rather than a bare error so the portal can show *which* item failed and *why*. Deciding what
to do about it is the portal's call, not ours.

`unpacked[].reason` is one of:

| reason | meaning |
|---|---|
| `NO_BOX_FITS` | the unit is larger than the interior of every available box type |
| `INCOMPATIBLE` | it fits, but group rules bar it from every box it could have shared |
| `EXCEEDS_WEIGHT` | it fits by volume but would breach a box's weight limit |

## Changing the contract

1. **Additive changes are cheap.** A new optional field breaks nobody. Just do it.
2. **Breaking changes need a heads-up.** Renaming or removing a field, or changing a meaning, goes
   to the visualiser and portal teams *before* it is merged. Post in the group chat and give them a
   sprint to adapt.
3. **Every change updates `examples/`** in the same commit. An example that no longer validates is
   worse than no example, because someone is building against it right now.
4. **Record the reasoning** in `docs/decisions/` if it settles a real question.

## Validating

Any JSON Schema 2020-12 validator works. Whatever language we land on, the check to wire into CI is
"every file in `examples/` validates against its schema".
