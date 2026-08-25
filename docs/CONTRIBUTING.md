# Contributing

Small team, thirteen weeks. These rules exist to keep us out of the two failure modes
that kill student team projects: everything landing in the last fortnight, and nobody
being able to prove what they did.

## `main` is the agreed baseline. Disagree on a branch.

`main` holds a version of the whole system that works: an order goes into the Portal,
the solver packs it, and the visualiser draws it. That is the thing we can demo, and it
is the thing we do not break.

It is a starting point, not a verdict. Plenty of what is in there is a first answer,
and some of it is probably wrong. **If you think a piece of it is wrong, the way to say
so is a branch, not an argument.**

1. **Branch off `main`.** Use `rfc/<thing>` when you are proposing a different approach
   rather than adding to the current one. It reads differently from ordinary work in
   the branch list and in review, which is the point.
2. **Build enough of it that the diff makes your case.** A branch that shows the
   alternative working beats a paragraph explaining why the current one is bad.
3. **Open a PR.** CI has to pass. That is the real bar: your alternative has to keep
   the other two subsystems working, which is exactly the thing nobody could check
   while we were in three separate repositories.
4. **If it changes a recorded decision, add the ADR that supersedes it.** Never edit an
   accepted decision to change its meaning. Write a new one and mark the old one
   superseded, so the trail of what we changed our minds about survives. That trail is
   worth marks in the reflective report; a silent reversal is worth none.
5. **The owner of that area reviews it.** `.github/CODEOWNERS` routes it automatically.

Nothing goes straight to `main`, including from whoever set the repository up. Branch
protection enforces this rather than trusting anyone to remember.

## Branch names

```
main            always works. Never commit straight to it.
rfc/<thing>     you disagree with how something is done, and here is the alternative
feat/<thing>    new work
fix/<thing>     bug fixes
docs/<thing>    docs and decision records
ci/<thing>      CI and repository automation
```

## Pull requests

1. Push and open a PR against `main`. Small PRs get reviewed; 800-line PRs get
   rubber-stamped, which is worse than no review.
2. **One teammate reviews before merge.** Not optional, and not the same person every
   time.
3. Squash merge. Keeps `main` readable.
4. Delete the merged branch locally and on GitHub. Reuse the same branch while its PR is
   open; do not create retry or revision branches.

Three status checks are required by branch protection, named to match the jobs in
`.github/workflows/ci.yml`:

```
Solver, portal, end to end
Published contract
Front ends build
```

Those names are part of the repository settings. Renaming a job without updating branch
protection at the same time silently removes the gate.

Write commit messages that say why, not what. The diff already says what.

```
Reject oversized items before box selection

Saves scanning every box type for something that fits in none of them,
and gives the portal a specific reason instead of a generic failure.
```

## Whoever writes the code should not write its tests

Pair up across the team. The person who wrote an implementation shares its blind spots,
and their tests tend to confirm what the code does rather than what it should do.
Someone else writing the tests catches a class of bug that self-review reliably misses.

**This applies to AI-generated code too.** If you generated the implementation, do not
also generate its tests from the same context. Get a teammate to write them, or write
them yourself first.

This is not theoretical. The solver's group-segregation bug, where an item belonging to
two mutually incompatible groups was placed instead of rejected, was found by exactly
this split: the tests were written against the contract by someone who had not seen the
implementation.

## Do not break the contract quietly

[`contract/solution.schema.json`](../contract/solution.schema.json) and
[`contract/request.schema.json`](../contract/request.schema.json) are what the other
subsystems build against. See
[ADR-0006](decisions/0006-the-implemented-schema-is-canonical.md).

- Adding an optional field breaks nobody. Just do it.
- Renaming, removing, or changing the meaning of a field goes to the Portal and
  visualiser owners **before** the PR merges. CODEOWNERS makes them reviewers
  automatically, so this is now a gate rather than a courtesy.
- Any contract change updates the fixtures in the same commit. A fixture that
  contradicts the schema is worse than no fixture, because someone is building against
  it right now. `contract/validate_fixtures.py` runs in CI and will catch it.
- `docs/contract.md` is superseded and describes an interface nobody implemented. Read
  it for the reasoning, not for field names.

## Write a decision record when you settle something

If you made a call someone would reasonably question later, add a file to
[`decisions/`](decisions/). Ten minutes now saves the same argument in three weeks, and
it is dated evidence for the reflective report.

## Log your work weekly

Two thirds of this unit is marked on evidence built up week by week, and none of it can
be reconstructed in November from memory. The reflective report has to refer to specific
artefacts.

Every week, note what you did, what you decided, and what you got stuck on. Link the PRs
and the issues. Ten minutes on a Sunday.

The marking rewards **breadth**. Contributions across many different parts of the project
beat being the strongest engineer on one part. If you have only touched one subsystem for
three sprints, review someone's PR, write a decision record, improve the docs, or pair
with another subteam on integration.

## Issues

Keep an issue focused on one thing. Say what needs doing, why (link the requirement or
ADR), and how we know it is done. Link the PR that closes it, so the trail from "we
decided this" to "here is the code" survives to November.

For a bug, always attach the request JSON that triggers it. A packing bug is close to
impossible to chase without the exact input.

For something only the client can answer, add it to the
[open questions](client-requirements.md#open-questions-for-the-client) so we ask them all
in one go, and write down what we are assuming until he replies. Never block on an answer
if you can pick a default and record it.

## Local setup

One Python environment covers the solver, the Portal and the integration tests.
[uv](https://docs.astral.sh/uv/) manages it.

```bash
uv sync --group dev
uv run pytest
```

`uv run pytest` from the repository root runs all three suites together. That is the
point: each subsystem's own tests passed for months while the three disagreed about
field names, because nothing ran them in one process.

Front ends:

```bash
cd apps/visualiser     && npm install && npx vite
cd apps/portal/frontend && npm install && npx vite
```

- **If your clone lives in a synced folder** (OneDrive, Dropbox, Google Drive), prefix uv
  commands with `UV_LINK_MODE=copy`; hardlinks fail there with OS error 396. Keep
  virtualenvs, caches and build directories out of the synced folder where you can, since
  sync clients choke on thousands of small files.
- **Never commit a `.env`.** Commit `.env.example` naming the variables with no values.
