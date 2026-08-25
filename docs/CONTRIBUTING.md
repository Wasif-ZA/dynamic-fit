# Contributing

Small team, thirteen weeks. These rules exist to keep us out of the two failure modes that kill
student team projects: everything landing in the last fortnight, and nobody being able to prove what
they did.

The repo is documentation only right now. The C++ sections below apply once code starts.

## Branch and PR

```
main            always works. Never commit straight to it.
feat/<thing>    new work
fix/<thing>     bug fixes
docs/<thing>    docs and decision records
ci/<thing>      CI and repository automation
```

1. Branch off `main`.
2. Push and open a PR. Small PRs get reviewed; 800-line PRs get rubber-stamped, which is worse than
   no review.
3. **One teammate reviews before merge.** Not optional, and not the same person every time.
4. Squash merge. Keeps `main` readable.
5. Delete the merged branch locally and on GitHub, then prune remote-tracking refs. Reuse the same
   branch while its PR is open; do not create retry or revision branches.

`CI gate` is the one status check required by branch protection. That name is part of the repository
settings: do not rename it or reuse it for another job without updating protection at the same time.

Write commit messages that say why, not what. The diff already says what.

```
Reject oversized items before box selection

Saves scanning every box type for something that fits in none of them,
and gives the portal a specific reason instead of a generic failure.
```

## Whoever writes the code should not write its tests

Pair up across the team. The person who wrote an implementation shares its blind spots, and their
tests tend to confirm what the code does rather than what it should do. Someone else writing the
tests catches a class of bug that self-review reliably misses.

**This applies to AI-generated code too.** If you generated the implementation, do not also generate
its tests from the same context. Get a teammate to write them, or write them yourself first.

## Do not break the contract quietly

[`docs/contract.md`](docs/contract.md) is what other teams build against. See
[ADR-0003](docs/decisions/0003-solver-only-scope.md).

- Adding an optional field breaks nobody. Just do it.
- Renaming, removing, or changing the meaning of a field goes to the visualiser and portal teams
  **before** the PR merges. Post in the group chat, give them time to react.
- Any contract change updates the worked examples in the same commit. An example that contradicts
  the spec is worse than no example, because someone is building against it right now.
- The [invariants](docs/contract.md#invariants) are the test list. If you change one, say so loudly.

## Write a decision record when you settle something

If you made a call someone would reasonably question later, add a file to
[`docs/decisions/`](docs/decisions/). Ten minutes now saves the same argument in three weeks, and it
is dated evidence for the reflective report.

## C++ conventions

Agreed in [ADR-0004](docs/decisions/0004-cpp-implementation.md), detail in
[`docs/architecture.md`](docs/architecture.md). The short version:

- **C++20.** Avoid C++23 library features, support is still patchy across our machines.
- **Exceptions are for programmer error, not packing outcomes.** An item that does not fit is a
  return value. Expected failures come back as `unpacked` entries with a reason.
- **No raw `new` or `delete`, no owning raw pointers.** Values by default, `std::unique_ptr` where
  polymorphism forces it.
- **Pass by `const&` or `std::span`.** The hot path runs thousands of fit checks per solve.
- **`[[nodiscard]]` on anything that answers a question.**
- **Volumes are `std::int64_t`.** Cubic millimetres overflow 32 bits for anything container-sized,
  and signed overflow is undefined behaviour, not merely a wrong number.
- **Build debug with `-fsanitize=address,undefined`** and fix what it reports before pushing.
- Run the formatter before committing. Formatting arguments in review waste everyone's time.

## Log your work weekly

Two thirds of this unit is marked on evidence built up week by week, and none of it can be
reconstructed in November from memory. The reflective report has to refer to specific artefacts.

Every week, note what you did, what you decided, and what you got stuck on. Link the PRs and the
issues. Ten minutes on a Sunday.

The marking rewards **breadth**. Contributions across many different parts of the project beat being
the strongest engineer on one part. If you have only touched the placement heuristic for three
sprints, review someone's PR, write a decision record, improve the contract docs, or pair with the
visualiser team on integration.

## Issues

Keep an issue focused on one thing. Say what needs doing, why (link the requirement or ADR), and how
we know it is done. Link the PR that closes it, so the trail from "we decided this" to "here is the
code" survives to November.

For a bug, always attach the request JSON that triggers it. A packing bug is close to impossible to
chase without the exact input.

For something only the client can answer, add it to the
[open questions](docs/client-requirements.md#open-questions-for-the-client) so we ask them all in
one go, and write down what we are assuming until he replies. Never block on an answer if you can
pick a default and record it.

## Local setup

Install the solver and its development tools from `fitsolver/`:

```bash
python -m pip install -e ".[dev,api]"
python -m pytest -c pyproject.toml
python -m ruff check .
```

The explicit `-c pyproject.toml` keeps a `pytest.ini` in a parent directory from hijacking test
collection. This matters when the clone sits inside a larger Python workspace.

- **If your clone lives in a synced folder** (OneDrive, Dropbox, Google Drive), keep virtualenvs,
  caches and build directories out of it. Sync clients choke on thousands of small files.
- **Never commit a `.env`.** Commit `.env.example` naming the variables with no values.
