# ADR-0011: Which Portal axis is vertical

- **Status:** proposed
- **Date:** 2026-10-20

Tracked in [issue #1](https://github.com/Wasif-ZA/dynamic-fit/issues/1). The problem first
appeared as the open item in [ADR-0008](0008-portal-solver-integration.md). This record
gives that open item an owner and an exit condition. It does not settle anything.

## Context

The Portal item has three size fields: `Width`, `Length` and `Depth`. The solver packs in
`(x, y, z)` with z up. The adapter has to say which Portal field is z.

`packages/solver/src/fitsolver/portal.py` currently says:

    AXIS_ORDER = ("width", "length", "depth")   # -> (x, y, z)

That makes **Depth** the vertical axis. The comment above it claims the opposite, that
"Portal's `length` sits in the height slot", and is marked UNCONFIRMED. Code and comment
disagree.

Evidence available, none of it conclusive:

- `docs/client-requirements.md` (line 63) records the client's boxes as "width, height,
  depth". If the client's middle field is the height, the Portal field in the middle
  position, `Length`, would be the vertical one.
- The only worked Portal box is cubic, 400 x 400 x 400, which disambiguates nothing.
- Nothing in the Portal's models, forms or tests states which axis stands up.

## Why it matters

A wrong mapping raises nothing, rejects nothing and fails no schema. Every item is silently
rotated, every carton is the wrong shape, and the render looks plausible. The Portal's box
catalogue (ADR-0008) avoids the problem for now by using values that reproduce the fixture
interiors whichever way the mapping is read.

## Current assumption

`AXIS_ORDER = ("width", "length", "depth")`, so Depth is vertical. This is an assumption,
not a confirmed answer, and the comment next to it disagrees with it. Flipping the tuple is
the whole code change if the answer is different.

## What the client must confirm

> In your item and box records, which of Width, Length and Depth is the vertical
> dimension, the one that stands up when the item sits in a carton? Please give one real,
> non-cubic example, for instance a box that is 600 mm tall, with its three numbers in the
> field order your system uses.

## Done when (from issue #1)

- The mapping is confirmed by the client or the Portal team.
- `AXIS_ORDER` matches it and its comment matches the code.
- A non-cubic box is added to the Portal test data so the mapping cannot be ambiguous
  again.

Then change this status to accepted, or write a superseding record if the answer reverses
the assumption.
