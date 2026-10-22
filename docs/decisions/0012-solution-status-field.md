# ADR-0012: Solution documents carry a derived status field

- **Status:** accepted
- **Date:** 2026-10-20

## Context

Issue #3 asked for a `solved` / `partial` / `rejected` field on the solution document.
Before this change, every consumer inferred it from whether `cartons` and `rejects` were
empty. [ADR-0006](0006-the-implemented-schema-is-canonical.md) listed the missing field
as the second of four gaps lost when `docs/contract.md` was superseded, and named it
"worth adding as an additive field".

`docs/contract.md` already had the rule: `solved` when nothing is unpacked and something
was placed, `rejected` when nothing was placed, `partial` otherwise.

## Decision

`contract/solution.schema.json` gains `status`, an enum of `solved`, `partial` and
`rejected`.

- **Derived, not chosen.** `fitsolver.io.derive_status` computes it in `emit_document`
  from the number of placements and the number of rejects. The same rule is checked
  against every fixture in `contract/validate_fixtures.py`.
- **Optional in the schema.** It is not in `required`, so a stored document written
  before this change still validates, and a consumer that ignores the field keeps
  working. The solver always emits it.
- **No `schema_version` bump.** Adding an optional field is the case
  [CONTRIBUTING](../CONTRIBUTING.md) calls safe, and `schema_version` is a `const` that
  `validate_fixtures.py` ties to the schema id and `io.SCHEMA_VERSION`.

## Consequences

- All eleven fixtures carry `status`: eight `solved`, two `partial`
  (`06_partial_rejects`, `08_orientation_locked`), one `rejected` (`07_all_rejects`).
- `docs/contract.md` invariant 5, "Status agrees", is now enforced for the implemented
  schema.
- The Portal summary endpoint and the visualiser do not read `status` yet. Neither breaks:
  they read `cartons` and `rejects` by name and ignore unknown keys. Switching the Portal
  summary to read `status` is a separate change owned by the Portal.
