# DynamicSolver

The packing solver for the COMP4050 warehouse packing project.

Given a list of items and the box types a warehouse stocks, work out **which boxes to use** and
**where each item goes inside them**.

Written in C++20. See [ADR-0004](docs/decisions/0004-cpp-implementation.md).

> **This repo is documentation only right now.** No source, no build, nothing to run. Sprint 0 is
> for agreeing what we are building and what we hand the other teams. Code comes next.

## Scope: we build the solver, nothing else

| Piece | Who builds it |
|---|---|
| **Packing solver** | **Us** |
| 3D visualiser | Another team |
| Portal / web front end | Another team |

We do not write visualiser or portal code. We support those teams by publishing a stable,
documented interface and worked examples they can build against before our solver is finished.

**That interface is [`docs/contract.md`](docs/contract.md).** It is our real deliverable to the rest
of the project. Treat a breaking change to it as a breaking change to someone else's sprint.

## Start here

| Doc | What it covers |
|---|---|
| [`docs/client-requirements.md`](docs/client-requirements.md) | What the client asked for, from the Q&A session |
| [`docs/contract.md`](docs/contract.md) | The input/output interface other teams consume, with worked examples |
| [`docs/architecture.md`](docs/architecture.md) | How the solver is structured and why |
| [`docs/decisions/`](docs/decisions/) | Decision log. Read before re-opening a settled question |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Branching, PRs, and how we log work for the unit |

## The problem in one paragraph

This is 3D bin packing, which is NP-hard, so we are not chasing a provably optimal answer. We need a
good answer fast. The client's stated bar is **1 to 2 seconds** for a single order. Load is low: a
large warehouse does 50,000 orders across a whole day, and the biggest realistic burst is around
1,000. Optimise for latency on one order, not for throughput.

## What the client actually cares about

Ranked, in the client's own priority order:

1. **Efficiency.** Pack into as few boxes, with as little wasted space, as possible.
2. **Extensibility.** He said this repeatedly and unprompted. The end goal is that someone develops
   this further after the unit ends. He named object-oriented design and gave an example: a box
   abstraction where a shipping container and a small parcel are the same kind of thing.
3. **Packing groups.** Certain items legally cannot share a box (dangerous goods classes). Must be
   generic enough to also express arbitrary grouping, like "keyboards in one box, headphones in
   another". This is a core requirement, not a stretch goal.

He also wants **multiple modes** eventually. Standard mode is real geometry. Fluid mode ignores
geometry and packs by volume, for liquids and squishable apparel. Own-packaging mode skips boxing
entirely for items that ship in their own carton. We build standard mode. The architecture should
make the other two obvious drop-ins, because that is what he means by extensibility.

## Explicitly out of scope

The client ruled these out. Do not build them.

- Authentication and access control. Already exists on their side.
- Fragile and this-way-up handling. Fragile items are handled separately in reality.
- Rate limiting and request throttling. Wrong shape of load.
- Box weight limits. Real, but they are not hitting it yet. Model the field, skip the logic.

## Next

Before anyone writes solver code:

1. **Ask the client the two blocking questions** in
   [open questions](docs/client-requirements.md#open-questions-for-the-client). Can items be
   rotated, and are box dimensions internal or external. He is back around 2026-08-19.
2. **Pick the toolchain.** Build system, JSON library, test framework. Write it up as ADR-0005.
3. **Send the other teams [`docs/contract.md`](docs/contract.md)** so they can start now rather than
   waiting on us.
