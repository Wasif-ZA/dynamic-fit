# ADR-0005: The solver is written in Python

- **Status:** accepted
- **Date:** 2026-08-25
- **Supersedes:** [ADR-0004](0004-cpp-implementation.md)

## Context

This record catches the decision log up with the code. It is not proposing a change;
the change already happened and was never written down.

[ADR-0004](0004-cpp-implementation.md) chose C++20 on 2026-08-05. What is actually in
the repository is a Python package, `fitsolver`, with roughly 700 lines of source, 74
passing tests including Hypothesis property tests, a published JSON Schema, a Portal
adapter, and a benchmark harness with an ablation study behind it.

Nothing in C++ was ever written.

The gap left three artefacts contradicting each other, which is worse than either
choice on its own:

- `README.md` still said "Written in C++20" and "This repo is documentation only
  right now. No source, no build, nothing to run."
- ADR-0004 still read **accepted**, so anyone consulting the log before re-opening a
  settled question was told the answer was C++.
- The code was Python and had been for weeks.

A decision log that disagrees with the repository is worse than no log, because it is
consulted and believed. [ADR-0001](0001-record-decisions.md) exists to stop questions
being re-argued every fortnight, and it cannot do that while it is wrong.

## Decision

**The solver is written in Python.** ADR-0004 is superseded.

C++ is not ruled out for a later port. It is no longer the plan of record, and the
README no longer claims it is.

## Why Python turned out to be right

**Nothing in ADR-0004's own reasoning survived contact with the schedule.** Its case
rested on headroom for a more thorough search inside the latency budget. The
benchmark then measured that headroom at zero value: an anytime search over item
orderings, given a budget twenty times larger, produced **no change** in carton count
(`docs/BENCHMARK.md`). All the gain was structural, in carton selection. A faster
language buys more of something that was measured not to help.

**The latency bar is met with room to spare.** The client asked for 1 to 2 seconds for
one order. A typical order solves in roughly 5 ms. ADR-0004 conceded "the naive
heuristic will meet it in any language", and that turned out to be the whole story.

**The measured result is good.** 28 cartons against a BoxPacker-equivalent baseline's
34, a 17.6 percent improvement on the client's primary metric. That number exists
because effort went into the algorithm and the benchmark rather than into a build
system.

**Property testing was affordable.** `tests/test_properties.py` generates orders with
Hypothesis and asserts the layout invariants on every one. `architecture.md` predicted
this would suit invariants 1 and 2 "unusually well", and in Python it cost a day
rather than a sprint.

**There was no C++ toolchain on the machines being used.** No compiler, no CMake, no
build system. ADR-0004 flagged this as "a real task" and it never got done, which is
its own evidence about where the time was better spent.

## What it costs

**No compiler enforcing the integer discipline.** [ADR-0002](0002-units-and-coordinates.md)
commits to integer millimetres and grams. Python integers do not overflow, so the
64-bit volume hazard ADR-0004 worried about disappears here, and would return in a
port. The discipline is now convention plus tests rather than types.

**The performance ceiling is lower.** Real, and not currently binding. If a future
mode makes search worth doing and profiling shows Python is the constraint, that is
the trigger for a port, and it is a measurable trigger rather than a preference. The
solver's HTTP boundary (`fitsolver.api`) means such a port swaps one process for
another without touching the Portal or the visualiser.

**The report has to tell this story honestly.** ADR-0004 was a reasonable decision on
its stated reasoning; the benchmark then falsified the reasoning. That is a better
story for the reflective report than a clean guess, provided the record shows both the
original argument and the measurement that overturned it. Both are in the log.

## Consequences

- `README.md` is corrected: it described a documentation-only C++ repository that had
  not existed for weeks.
- ADR-0004 is marked superseded, per [ADR-0001](0001-record-decisions.md)'s rule that
  an accepted decision is never edited to change its meaning.
- `docs/architecture.md` still describes a C++ layout with `.hpp` headers and
  `std::span`. Its pipeline, its type shapes and its testing priorities all carried
  over accurately; the language particulars did not. It needs a pass, tracked
  separately rather than silently rewritten here.
- The C++ toolchain ADR that ADR-0004 asked for is not needed unless a port starts.
