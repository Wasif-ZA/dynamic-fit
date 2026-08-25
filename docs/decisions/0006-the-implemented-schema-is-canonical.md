# ADR-0006: The implemented schema is canonical, and contract.md is superseded

- **Status:** accepted
- **Date:** 2026-08-25

## Context

Dynamic Fit had two interface documents, and only one of them was real.

**`docs/contract.md`** was written in Sprint 0 and has not changed since. It describes
camelCase objects, a y-up coordinate system, `containers` holding `placements` with a
global 1-based `step`, and an `unpacked` list carrying `NO_BOX_FITS`, `INCOMPATIBLE`
and `EXCEEDS_WEIGHT`. It has seven named invariants, three worked examples, and a
documented change process. It is the better-written document by a distance.

**`contract/request.schema.json` and `contract/solution.schema.json`** are JSON Schema,
snake_case, z-up, `cartons` holding `placements` with a per-carton 0-based `sequence`,
and a `rejects` list carrying `NO_FITTING_CARTON` and `INVALID_DIMENSIONS`.

The second one is what everything actually speaks:

- The solver emits it. `io.emit_document` produces exactly this shape.
- The eleven fixtures in `contract/fixtures/` are solver output in this shape.
- The visualiser renders it natively. Persephone built against the fixtures, so the
  renderer reads `carton.inner_dims`, `placement.dims` and `reject.reason_code`.
- `fitsolver/portal.py` translates the Portal into it.
- `tests/test_contract.py` gates every emitted document against it in CI.

`docs/contract.md` is implemented by nothing and consumed by nobody.

This was not obvious from the outside. The repository README described a
documentation-only project, `contract.md` sat at the top of the "start here" table,
and the working schemas were in a directory with no prose pointing at them. Reading
the documentation in the order it invites gives you a confident and wrong picture of
the interface. That is how the merge nearly standardised the whole division onto the
schema nobody had built.

## Decision

**`contract/*.schema.json` is the canonical interface.** It is what the solver emits,
what the visualiser reads, and what CI enforces.

**`docs/contract.md` is marked superseded.** It is kept, not deleted: it is the
clearest statement of the reasoning behind the interface, and several of its rules are
still live.

## Why the implemented one wins

**Three of four subsystems already speak it.** Adopting `contract.md` instead would
mean migrating the solver, its 74 tests, both JSON Schemas, eleven fixtures, the
Portal adapter, the benchmark harness and Persephone's renderer, mid-sprint, to reach
a format with no current consumers. That is a large, risky move whose only benefit is
that the losing document is better prose.

**It is machine-checkable and already checked.** JSON Schema is executable. The
solver's contract test validates every emitted document against it, so the interface
cannot drift without CI noticing. `contract.md` is prose, and prose does not fail a
build.

**Its shape is what the renderer needs.** Arrays rather than nested objects, z-up
matching Three.js after one axis swap, and a self-contained solution document that
renders "with zero further network calls", which is what its own description promises.

## What is genuinely lost, and what to do about it

`contract.md` is better in four ways. Losing them silently would be the real cost of
this decision, so each is called out:

**1. Seven named invariants.** `contract.md` lists in-bounds, no-overlap,
conservation, contiguous steps, status agreement, group rules and weight sums, and
calls them "the test list". Mostly already covered: `tests/test_properties.py` asserts
in-bounds, no-overlap, conservation, group segregation, weight limits and determinism
via Hypothesis. Not covered, and not applicable: contiguous global steps (the
implemented schema numbers per carton) and status agreement (it has no status field).

**2. A derived `status` field.** The solution document has no `solved` / `partial` /
`rejected`. A consumer infers it from `cartons` and `rejects` being empty or not. The
Portal summary already does this inference. Worth adding as an additive field.

**3. Three worked examples, checkable by hand.** The fixtures serve this purpose but
are machine-generated and large; none is small enough to verify with a pen.

**4. A written change process.** "Additive changes are cheap. Breaking changes need a
heads-up and a sprint. Update the worked examples in the same commit." That process is
good and does not depend on which schema won. It is carried forward into the pull
request template and CODEOWNERS.

## Consequences

- `docs/contract.md` gets a banner marking it superseded and pointing at the schemas,
  so the next person reading the docs in order is not misled the same way.
- The README's "start here" table points at `contract/` for the interface and at
  `contract.md` for the reasoning.
- `contract/*.schema.json` follows the change process `contract.md` set out. A
  breaking change goes to the visualiser and Portal owners before it merges;
  CODEOWNERS makes that a review requirement rather than a convention.
- The three gaps worth closing (a `status` field, a small hand-checkable example, and
  the two invariants not currently asserted) are follow-up work, not part of this
  decision.
- Nothing in the solver, the visualiser or the fixtures changes. That is the point.
