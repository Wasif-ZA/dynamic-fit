# Team organisation and contribution

Each person fills in their own row and commits it themselves.

## Roles

The unit names four roles: project manager, scrum master, developer and tester. One person can hold
more than one. Say what the role meant in practice, not only its name.

| Division | Name | GitHub | Role | Responsibilities in practice |
|---|---|---|---|---|
| Solver | Wasif Zaman | Wasif-ZA | Project manager, scrum master, reviewer | Chaired team meetings, wrote minutes and retrospectives, set the PR and review rules, reviewed solver PRs before merge, set up this monorepo |
| Solver | Jesse Osuna | jesseosu | Developer (algorithm lead) | Built the first greedy packer and greedy2, ran the benchmarks, wrote the user stories and the week 8 slides |
| Solver | Khuslee Batsuuri | khuslee0409 | Developer, project board | Added the `maximum_boxes` limit with tests, kept the board and issues current, checked the unit guide and rubric |
| Solver | Jacob Liu | JacobLiu124 | Developer, tester | Built the BFS greedy solver, wrote its tests, researched algorithms, reviewed and merged PRs |
| Portal | | AaronMinhas | | |
| Portal | | | | |
| Visualiser | | sweetpea004 | | |
| Visualiser | | | | |

## How the divisions worked together

- **Interface:** the published JSON schemas in [`contract/`](../../contract/). A change to a field
  name goes to the other two divisions before it merges.
- **Repositories:** each division built in its own repository, then merged into this monorepo with
  history kept ([ADR-0007](../decisions/0007-monorepo-with-preserved-history.md)).
- **Meetings:** the solver team met on Thursday afternoons on Google Meet; minutes are in DynamicSolver [`docs/meetings/`](https://github.com/Wasif-ZA/DynamicSolver/tree/main/docs/meetings). [Portal and visualiser: add yours.]
- **Reviews:** every pull request reviewed by another team member before merge.

## Contribution

One row per person. Link evidence: pull requests, issues, reviews, decision records, minutes.

| Name | Built | Reviewed | Documented | Other (meetings, client contact, presenting) |
|---|---|---|---|---|
| Wasif Zaman | Portal adapter (DynamicSolver PR #3), CI gate (#6), solver correctness fixes (#4, superseded by greedy2), two greedy2 fixes from review (`9ed091a`), CLI fix (#33); this monorepo (`e7254d4` to `280fb37`) | DynamicSolver #7, #16, #17, #19; Dynamic Fit #6, #8, #9 | ADR-0005 to ADR-0008, this SDD template and `solver.md`, meeting minutes (DynamicSolver `docs/meetings/`) | Chaired the 13 Aug, 10 Sep and 17 Sep meetings; Sprint 0 and 1 retrospectives; close and Q&A at the week 8 presentation |
| Jesse Osuna | First greedy packer (`e140a4d`); greedy2 in 12 phases (DynamicSolver PR #17) | | User stories (branch `docs/user-stories`), greedy2 README and design notes | Week 8 slides (`a31042f`); 32,000-item benchmark; relayed client and tutor feedback; hosted the 22 Oct meeting |
| Khuslee Batsuuri | `maximum_boxes` limit with tests (DynamicSolver PR #19) | Opened issue #2, the greedy review that led to the correctness fixes | Closed issues #8 to #10; board issues #12 to #15 | Found the grade weights and rubric; input and output section at the week 8 presentation |
| Jacob Liu | BFS greedy solver (`1ed7bcd`); its tests (DynamicSolver PR #7) and more tests (#16) | Merged #3 and #17; reviewer on #33 and #35 | Minutes at the 17 Sep meeting | Algorithm research (OR-Tools vs greedy); proposed grouping hazardous and food items |

The solver rows are a draft built from the repo history and meeting minutes. Check your own row, fix it, and commit the change yourself.

## Peer agreement

Signed off by every member on [date]: the table above is a fair account of who did what.
