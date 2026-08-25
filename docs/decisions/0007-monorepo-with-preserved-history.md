# ADR-0007: One repository, with every contributor's history carried across

- **Status:** accepted
- **Date:** 2026-08-25

## Context

Dynamic Fit was spread across four GitHub repositories:

| Repository | Owner | State on 2026-08-25 |
|---|---|---|
| `Wasif-ZA/DynamicSolver` | Wasif | The solver. Python `fitsolver`, 74 tests, JSON Schemas, Portal adapter, benchmarks, 3 CI workflows |
| `AaronMinhas/comp4050-portal` | Aaron | FastAPI backend and React front end, 75 tests, PR workflow |
| `sweetpea004/COMP4050-2026-Discovery-Visualiser` | Persephone | Three.js renderer, complete, on an unmerged `Persephone` branch |
| `Wasif-ZA/Box-package` | Wasif | Empty. A README and nothing else |

Every subteam's tests passed. The system did not work.

The Portal serialises `ItemCode`; the solver's Portal adapter read `item_code`. A real
order sent from the Portal to the solver failed at the first field with `'items' must
be a non-empty list`, before anything was packed. That break had been there since the
adapter was merged, and no test anywhere could see it, because no repository contained
both halves.

That is the case for one repository, and it is not about convenience. An end-to-end
run touches the Portal, the solver and the visualiser at once. No repository held two
of them, so nothing could run one.

## Decision

**One repository, `Wasif-ZA/dynamic-fit`, renamed from the empty `Box-package`.**

    dynamic-fit/
      apps/portal/           FitPortal, backend and front end
      apps/visualiser/       FitVisualizer
      packages/solver/       FitSolver, its tests and its benchmarks
      contract/              the JSON Schemas and the fixtures
      docs/                  requirements, architecture, decisions
      tests/integration/     the only tests that span subsystems
      .github/CODEOWNERS     each subtree still belongs to whoever built it

**Every repository is imported with `git subtree add` and no `--squash`,** so the
original commits keep their authors, dates and messages.

## Why the empty repository is the host

`Box-package` had one commit and no content, so nothing is buried by importing into
it. Using `DynamicSolver` instead would leave a repository named for the solver
holding the Portal and the visualiser too, which is the confusion the rename removes.

## Why history preservation is not optional

**Sixty percent of this unit is graded on individual contribution evidence.** The
Development Process task and the Individual Reflective Report both rest on what the
record shows each person did. Copying files into a new repository attributes Aaron's
eight commits and Persephone's nine to whoever ran the copy. That is not tidiness, it
is the difference between a defensible contribution record and an erased one.

`git subtree add` without `--squash` keeps the original commit objects reachable, so
`git log --follow` on any imported path shows the real author and date.

The visualiser is imported from the **`Persephone` branch**, not `main`. Its `main`
holds an early stub whose `buildSceneFromData` draws a placeholder green cube; the
finished renderer, the legend, the rejects list and the highlight controls are all on
the branch. Importing `main` would import the wrong work and lose nine commits.

## Ownership after the merge

Merging the code does not transfer ownership of it. `.github/CODEOWNERS` keeps each
subtree with the person who built it, so a change to the Portal still needs Aaron and
a change to the visualiser still needs Persephone. The contract and the decision log
need all three, because a change to either changes someone else's sprint.

CODEOWNERS only requests reviewers on its own. For it to hold, `main` needs branch
protection with "Require a pull request before merging" and "Require review from Code
Owners" both enabled.

## What it costs

**Two people have to move.** Aaron's project board and issue numbers, and Persephone's
branch workflow, point at their own repositories. The `TODO(#30)` comments through the
Portal refer to issues in Aaron's tracker, which do not follow the code. Those either
get remapped or the tracker stays where it is.

**This is a team decision, not one person's.** Aaron and Persephone each own their
repository. The import is prepared as a script and offered as a pull request rather
than done to them.

**Three CI workflows become one.** `DynamicSolver` had CI, benchmark and
contract-release workflows keyed to its old paths. They are replaced by a single
workflow covering all three subsystems, which is the point, but the benchmark and
release jobs need porting rather than dropping.

## Alternatives considered

**Keep four repositories and add a fifth for integration tests**, pulling the others in
as submodules. Least disruptive. Rejected because submodule pins drift, so the
integration suite tests whichever commits were last pinned rather than what anyone is
working on, which is the failure that produced the Portal break in the first place.

**Use `DynamicSolver` as the host.** Its history stays in place with no import.
Rejected on naming, as above.

**Copy the files in and start a fresh history.** Simplest, and it destroys the
contribution evidence three assessments depend on. Rejected outright.

## Consequences

- `scripts/assemble-with-history.sh` performs the import and is re-runnable, so the
  merge is reviewable before it happens rather than a state someone arrived at.
- The old repositories stay as they are. Nothing is deleted and the import can be redone.
- CI runs the solver suite, the Portal suite and the end-to-end suite on every pull
  request, so a change that breaks another subteam fails before it merges.
- Moving the solver from a repository root into `packages/solver/` shifted the depth
  its tests used to locate `contract/`. That lookup now searches upward instead of
  counting directories, so the next move does not break it.
