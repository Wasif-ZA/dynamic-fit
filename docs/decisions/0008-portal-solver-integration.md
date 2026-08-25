# ADR-0008: How the Portal reaches the solver

- **Status:** accepted
- **Date:** 2026-08-25

## Context

`fitsolver/portal.py` was written as "the one place the two meet", so that "a rename
on either side changes exactly one file". The idea was right. The file was written
against an assumed Portal vocabulary rather than the Portal's actual one, and the two
never met.

The Portal's Pydantic models declare PascalCase aliases and serialise them:

    {"OrderId": "ORD-001",
     "Items": [{"ItemCode": "MUG", "ItemReference": "SKU-MUG",
                "Width": 100, "Length": 100, "Depth": 120, "Weight": 0.35}]}

`portal.to_contract` looked for `items`, `item_code`, `width`. Feeding it a real
Portal order raised `'items' must be a non-empty list` on the first field.

Two further gaps sat behind that one:

- Portal `BoxType` names its identifier `Reference` and its empty-box mass
  `BoxWeight`; the adapter expected `box_reference` and `tare_weight`. Those are not
  case differences, they are different words.
- The Portal has no box catalogue at all. Boxes are reference data and Ticket #30
  moves them to Supabase, but until then there was nothing to pack into, so the
  Portal could not have called the solver even with the field names fixed.

## Decision

**Three changes, each at the boundary rather than in either subsystem's core.**

**1. `portal.to_contract` accepts both vocabularies.** A normalisation pass rewrites
PascalCase keys to the snake_case the module already reads, with two explicit renames
for `Reference` and `BoxWeight`. Keys already in snake_case pass through untouched, so
the 373-line existing test suite keeps passing and no caller had to change.

**2. The Portal owns a box catalogue**, `app/boxes.py`, whose three SKUs reproduce the
interiors in `contract/fixtures/` exactly. A solved order and a committed fixture then
render at the same scale, so a difference on screen is a real difference rather than
two unrelated catalogues. Ticket #30 replaces the module with Supabase without
changing its return type.

**3. The Portal imports the solver in process** rather than calling `/v1/solve` over
HTTP. Both live in this repository, the solver does no I/O of its own, and a network
hop between two halves of one deployment buys nothing while adding a failure mode.
`fitsolver.api` still exposes the HTTP route for a deployment that does split them.

## The Portal passes the solution document straight through

`GET /orders/{id}/solution` returns the solver's document unchanged, because that
document is already what the visualiser renders. Translating it in the Portal would
create a second place for the schema to drift, which is the failure this whole merge
exists to fix.

`GET /orders/{id}/solution/summary` is the exception: a flat, PascalCase, kilograms
shape for the Portal's own order page. That is a display concern and never crosses a
service boundary.

## The open item: which Portal axis is vertical

`portal.py` maps Portal fields to solver axes as `AXIS_ORDER = ("width", "length",
"depth")` into `(x, y, z)`, with z up. That makes Portal's **Depth** the vertical axis.

The comment directly above it says the opposite: that "Portal's `length` sits in the
height slot". The code and its own comment disagree, and the comment is already marked
UNCONFIRMED.

This matters more than it looks. Getting it wrong raises nothing, rejects nothing and
fails no schema. Every item is silently rotated, every carton is the wrong shape, and
the render looks entirely plausible. It is the most expensive kind of wrong.

It cannot be settled from the code:

- `client-requirements.md` records the client's boxes as "width, height, depth", which
  suggests the field in the middle position is the height, and Portal's middle field
  is `Length`.
- The only worked Portal box available is cubic, 400 x 400 x 400, which cannot
  disambiguate anything.
- Nothing in the Portal's models, forms or tests states which axis stands up.

**It is a question for the Portal team and, if they do not know, for the client.** It
is recorded here rather than parked in a document, and raised on the pull request that
introduces the integration. The box catalogue sidesteps it for now by choosing values
that reproduce the fixture interiors exactly, whichever way the mapping is read.

Flipping the tuple is the entire change if the answer is the other one.

## Consequences

- A Portal order now reaches the solver and comes back as a renderable document. The
  regression is locked by `tests/integration/test_end_to_end.py`, which builds its
  requests from Portal models rather than hand-written JSON, so this specific break
  cannot come back unnoticed.
- `tests/integration/test_renderer_contract.py` extracts the field list from
  `visualiser.js` itself and asserts a Portal-produced document satisfies it. A rename
  on either side fails the build.
- Merging duplicate order lines is not implemented. The Portal has no quantity field,
  so three of an item arrive as three rows with the same `ItemCode`, and the solver
  treats them as three items with a shared reference. That works for packing but makes
  `item_ref` non-unique in the solution, which the visualiser legend shows as three
  identical rows. Worth a quantity field on the Portal side rather than a workaround
  in the adapter.
