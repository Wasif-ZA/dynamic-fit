# ADR-0003: We build the solver only, and publish a contract

- **Status:** accepted
- **Date:** 2026-08-05

## Context

The wider project has several teams. Someone builds the 3D visualiser, someone builds the portal,
and we build the packing solver.

The failure mode for a split like this is predictable. Everyone waits on everyone else, integration
is left to the last fortnight, and the interfaces turn out not to match. The visualiser team in
particular cannot build anything until they know what our output looks like, and if they wait for
our solver to work they lose most of the semester.

## Decision

**We build the solver. We do not write visualiser or portal code.**

We support the other teams by publishing a versioned, documented interface in `contract/`, with
worked example request and response pairs, committed to the repo from day one.

The examples are the important half. They mean the visualiser team can build their entire renderer
against a static file before our solver places a single item.

We treat the contract as a real deliverable with real obligations:

- Additive changes are free.
- Breaking changes go to the other teams before merge, not after.
- Every contract change updates `contract/examples/` in the same commit.

## Consequences

- The visualiser team is unblocked immediately. They never wait on us.
- Integration risk moves from the end of the semester to the start, when it is cheap to fix.
- We are constrained by our own published interface, which is the point. Changing it has a social
  cost, so we think before changing it.
- We carry a documentation burden the other teams do not, because `contract/README.md` has to be
  good enough for someone outside our team to build against without asking us questions.
- Where "help another team" shades into "write their code" is a judgement call. Explaining the
  contract, supplying example data, and debugging an integration together is help. Committing to
  their repo is not.
