# Software Design Description

One design document for Dynamic Fit, written by division and kept in this folder. Agreed at the
team meeting on 22 October 2026.

| File | Covers | Who fills it |
|---|---|---|
| [`template.md`](template.md) | The blank section list. Copy it to start a division | Nobody edits it directly |
| [`solver.md`](solver.md) | FitSolver, `packages/solver/` | Solver team |
| `portal.md` | FitPortal, `apps/portal/` | Portal team: copy `template.md` |
| `visualiser.md` | FitVisualizer, `apps/visualiser/` | Visualiser team: copy `template.md` |
| [`team.md`](team.md) | Roles, responsibilities and contribution, all divisions | Everyone, one row each |

Meeting minutes and sprint retrospectives use the templates in [`../templates/`](../templates/).

## What the markers look for

The unit rubric marks the Software Product and the Development Process on these headings. Each
heading points to the section that answers it.

| Rubric heading | Answered in |
|---|---|
| Requirements | Section 2 of each division file, plus [`../client-requirements.md`](../client-requirements.md) |
| Architecture | Sections 3 and 4 of each division file |
| Software quality | Section 6 (testing and CI) |
| Usability | Section 7 (deploying and running it) |
| Documentation | This folder, linked from the root `README.md` |
| Project management | Section 8 (tooling: board, PRs, CI) |
| Team organisation | [`team.md`](team.md), roles |
| Team work and contribution | [`team.md`](team.md), contribution table, with links to PRs and issues |

## Rules

- Link to evidence instead of restating it: a PR, an issue, an ADR, a test file or a benchmark row.
- A design choice someone could question gets a row in the trade-offs table and, if it is settled,
  an ADR in [`../decisions/`](../decisions/).
- Commit your own section yourself, so the history shows who wrote what.
