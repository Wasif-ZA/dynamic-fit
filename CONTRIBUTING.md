# Contributing

Small team, thirteen weeks. These rules exist to keep us out of the two failure modes that kill
student team projects: everything landing in the last fortnight, and nobody being able to prove what
they did.

## Branch and PR

```
main            always works. Never commit straight to it.
feat/<thing>    new work
fix/<thing>     bug fixes
docs/<thing>    docs and decision records
```

1. Branch off `main`.
2. Push and open a PR. Small PRs get reviewed; 800-line PRs get rubber-stamped, which is worse than
   no review.
3. **One teammate reviews before merge.** Not optional, and not the same person every time.
4. Squash merge. Keeps `main` readable.

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

`contract/` is what other teams build against. See [ADR-0003](docs/decisions/0003-solver-only-scope.md).

- Adding an optional field breaks nobody. Just do it.
- Renaming, removing, or changing the meaning of a field goes to the visualiser and portal teams
  **before** the PR merges. Post in the group chat, give them time to react.
- Any contract change updates `contract/examples/` in the same commit. An example that no longer
  validates is worse than no example, because someone is building against it right now.

Run the checker before you push:

```bash
uv run --with jsonschema tools/validate-contract.py
```

It validates every example against the schemas and checks the geometry is physically possible:
nothing sticking out of a box, nothing overlapping, step numbers contiguous.

## Write a decision record when you settle something

If you made a call someone would reasonably question later, add a file to
[`docs/decisions/`](docs/decisions/). Ten minutes now saves the same argument in three weeks, and it
is dated evidence for the reflective report.

## Log your work weekly

Two thirds of this unit is marked on evidence built up week by week, and none of it can be
reconstructed in November from memory. The reflective report has to refer to specific artefacts.

Every week, note what you did, what you decided, and what you got stuck on. Link the PRs and the
issues. Ten minutes on a Sunday.

The marking rewards **breadth**. Contributions across many different parts of the project beat being
the strongest engineer on one part. If you have only touched the placement heuristic for three
sprints, review someone's PR, write a decision record, work on the contract docs, or pair with the
visualiser team on integration.

## Issues

Use the templates. Keep an issue focused on one thing. Link the PR that closes it, so the trail from
"we decided to do this" to "here is the code" survives to November.

## Local setup

Nothing to set up yet, the solver has not started. Two things worth knowing when it does:

- **If your clone lives in a synced folder** (OneDrive, Dropbox, Google Drive), keep the virtual
  environment and `node_modules` **outside** it. Sync clients choke on thousands of small files, and
  some package managers fail outright on hardlinks in synced folders.
- **Never commit a `.env`.** Commit `.env.example` naming the variables with no values.
