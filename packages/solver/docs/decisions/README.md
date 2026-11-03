# Solver decisions

Decisions that only bind the solver. They keep the numbers they had in DynamicSolver, so they are
named "Solver ADR-000N" to keep them apart from the repository log in
[`docs/decisions/`](../../../../docs/decisions/README.md). Solver ADRs 0001 to 0005 are that log's
0001 to 0005.

| ADR | Decision | Status |
|---|---|---|
| [0006](0006-z-up-axes.md) | z is up | accepted (supersedes the axes in ADR-0002) |
| [0007](0007-greedy2-is-the-solver.md) | greedy2 is the solver; v1 and bin4d are frozen baselines | accepted |
| [0008](0008-enforce-maximum-boxes.md) | Enforce `maximum_boxes` inside the solver | accepted |
| [0009](0009-further-optimise.md) | "Further Optimise": an opt-in exact search for one smaller carton | accepted |
