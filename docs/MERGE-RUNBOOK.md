# Merge runbook

Everything that touches GitHub or writes history. **Run these yourself.** They rename a
repository, push, and change how two other people work, none of which should happen
without you looking at it first.

## The shape of this

Get one version of the whole system working on `main`, lock `main` so nothing lands on
it without review, then hand the team the freedom to argue with any of it on a branch.

    step 1-3   build the base and check it works
    step 4-6   land it on main and lock main
    step 7     give Aaron and Persephone access
    step 8     turn the known open questions into issues
    step 9     tell them main is theirs to challenge

The base is a starting point, not a verdict. A good deal of it is a first answer, and
some of it is probably wrong. The point of locking `main` is not to freeze the design,
it is to make sure the next change to it is reviewed by whoever owns that area and does
not break the other two subsystems. `docs/CONTRIBUTING.md` is the rule they will read.

Step 2 is the one to stop at if anything looks wrong.

---

## Before anything: this is a team decision

Aaron owns `comp4050-portal`. Persephone owns `COMP4050-2026-Discovery-Visualiser`.
Merging their repositories into yours changes where they work, which project board
their issues live on, and how their pull requests get reviewed.

Show them [ADR-0007](decisions/0007-monorepo-with-preserved-history.md) and get a yes
before step 4. Everything up to the push is reversible; their agreement is not.

Two things to tell them plainly:

- **Their commit history comes with them.** `git subtree` keeps every commit's author
  and date. Nobody's contribution record gets absorbed into yours. That matters because
  60 percent of this unit is graded on exactly that record.
- **They keep ownership.** `.github/CODEOWNERS` means a change to `apps/portal/` still
  needs Aaron's review and a change to `apps/visualiser/` still needs Persephone's,
  including when the change is yours.

---

## 1. Build the merged tree

```bash
cd projects/dynamic-fit
bash scripts/assemble-with-history.sh ../dynamic-fit-assembled
```

The script imports all three repositories with history, moves the solver into place,
lays the integration work over the top, and stops with everything staged.

## 2. Check the histories actually survived

This is the whole point of the exercise, so check it rather than assume it.

```bash
cd ../dynamic-fit-assembled

git log --follow --format='%h %an %ad %s' -- apps/portal/backend/app/models.py
git log --follow --format='%h %an %ad %s' -- apps/visualiser/visualiser.js
git log --follow --format='%h %an %ad %s' -- packages/solver/src/fitsolver/pack.py
```

Each must show its original author. If any shows you as the author of work you did not
write, **stop**: the import squashed and the contribution evidence is gone. Delete the
target directory and re-run step 1.

Then confirm the base actually works, before it becomes the thing everyone builds on:

```bash
UV_LINK_MODE=copy uv sync --group dev
UV_LINK_MODE=copy uv run pytest
UV_LINK_MODE=copy uv run python contract/validate_fixtures.py
cd apps/visualiser && npm install && npx vite build && cd -
cd apps/portal/frontend && npm install && npx vite build && cd -
```

Expected: 192 passed, 11/11 fixtures valid, both builds clean.

## 3. Commit the integration work

```bash
git status
git diff --cached --stat

git commit -m "Integrate the portal, solver and visualiser in one repository

Each subsystem's tests passed while the system did not work: the Portal
serialises ItemCode and the solver's adapter read item_code, so every real
order failed at the first field. Nothing could catch it because no repository
held two subsystems.

Adds the Portal solve routes and box catalogue, an end-to-end suite that runs
all three together, a renderer contract check that reads its field list from
visualiser.js itself, unified CI, and CODEOWNERS keeping each subtree with
whoever built it.

See docs/decisions/0006, 0007 and 0008."
```

## 4. Rename the empty repository

`Box-package` is empty, so nothing is buried by reusing it. GitHub redirects the old
URL, so no existing clone breaks.

```bash
gh repo rename dynamic-fit --repo Wasif-ZA/Box-package
gh repo edit Wasif-ZA/dynamic-fit \
  --description "Dynamic Fit: warehouse carton packing. Portal, solver and 3D visualiser."
```

## 5. Push the base to `main`

The repository is empty, so this is the initial import rather than a change to anything.
It is the only push that will ever go straight to `main`.

```bash
git remote add origin https://github.com/Wasif-ZA/dynamic-fit.git
git push -u origin main
```

If `main` already carries the old `Box-package` README commit, take it over deliberately
rather than forcing:

```bash
git fetch origin
git rebase origin/main       # one trivial README commit underneath
git push -u origin main
```

## 6. Lock `main` before anyone else can push to it

Do this **before** step 7. Between pushing and protecting, `main` is open, so keep that
window closed rather than merely short.

**Without this, CODEOWNERS does nothing.** It only requests reviewers; it blocks nothing
on its own.

```bash
gh api -X PUT repos/Wasif-ZA/dynamic-fit/branches/main/protection \
  -H "Accept: application/vnd.github+json" \
  --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["Solver, portal, end to end", "Published contract", "Front ends build"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "require_code_owner_reviews": true
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
```

Check it took:

```bash
gh api repos/Wasif-ZA/dynamic-fit/branches/main/protection \
  --jq '{reviews: .required_pull_request_reviews, checks: .required_status_checks.contexts}'
```

`enforce_admins` is false on purpose: you can still push directly in an emergency. Do
not make that a habit, because a direct push is invisible to the review record the unit
marks.

The three context names must match the job names in `.github/workflows/ci.yml`. Rename a
job without updating this and the gate silently disappears.

## 7. Give Aaron and Persephone write access

CODEOWNERS cannot request a review from someone with no access to the repository.

```bash
gh api -X PUT repos/Wasif-ZA/dynamic-fit/collaborators/AaronMinhas  -f permission=push
gh api -X PUT repos/Wasif-ZA/dynamic-fit/collaborators/sweetpea004 -f permission=push
```

They get `push`, not `admin`. Branch protection means push access cannot touch `main`
directly; it lets them create branches and open pull requests, which is the whole
workflow.

## 8. Turn the known open questions into issues

These are the places the base is a guess. Filing them as issues means the disagreement
lands somewhere it can be answered, rather than as a comment nobody reads in November.

**The one that can silently ruin every solve:**

```bash
gh issue create --repo Wasif-ZA/dynamic-fit \
  --title "Which Portal axis is vertical: Width, Length or Depth?" \
  --assignee AaronMinhas \
  --body "\`fitsolver/portal.py\` maps Portal fields to solver axes as
\`AXIS_ORDER = (\"width\", \"length\", \"depth\")\` into \`(x, y, z)\`, with z up. That
makes Portal's **Depth** the vertical axis.

The comment directly above it says the opposite, that Length sits in the height
slot. The code and its own comment disagree, and the comment is already marked
UNCONFIRMED.

**Why this matters more than it looks.** Getting it wrong raises nothing, rejects
nothing and fails no schema. Every item is silently rotated, every carton is the
wrong shape, and the render still looks entirely plausible.

It cannot be settled from the code:

- \`client-requirements.md\` records the client's boxes as \"width, height, depth\",
  which suggests the middle field is the height, and Portal's middle field is Length.
- The only worked Portal box is cubic, 400x400x400, which disambiguates nothing.
- Nothing in the Portal's models, forms or tests states which axis stands up.

**Done when:** the mapping is confirmed, \`AXIS_ORDER\` matches it, its comment
matches the code, and a non-cubic box is added to the Portal test data so this
cannot be ambiguous again.

Background: ADR-0008."
```

**The one that will bite when someone orders two of something:**

```bash
gh issue create --repo Wasif-ZA/dynamic-fit \
  --title "Portal has no quantity field, so three of an item arrive as three rows" \
  --assignee AaronMinhas \
  --body "Ordering three mugs sends three identical rows with the same \`ItemCode\`.
The solver packs them correctly, but they share one \`item_ref\`, so the visualiser
legend shows three identical entries and nothing distinguishes them.

Highlighting still works, since it keys on position rather than ref.

**Options:** add a quantity field to the Portal item model (the request schema
already supports \`quantity\`), or have the adapter merge duplicate codes into one
line with a count. The first is cleaner; the second needs no Portal change.

**Done when:** an order for three of one item produces three distinguishable
entries in the legend."
```

**The interface question worth a decision record:**

```bash
gh issue create --repo Wasif-ZA/dynamic-fit \
  --title "Solution documents carry no status field" \
  --assignee Wasif-ZA \
  --body "\`contract/solution.schema.json\` has no \`solved\` / \`partial\` /
\`rejected\`. Every consumer infers it from whether \`cartons\` and \`rejects\` are
empty, and the Portal summary already does that inference by hand.

\`docs/contract.md\`, superseded but not wrong about this, made status a derived
field with a written rule: solved when nothing is unpacked and something was
placed, rejected when nothing was placed, partial otherwise.

Adding an optional field breaks nobody (CONTRIBUTING, \"Do not break the contract
quietly\"), so this is cheap.

**Done when:** \`status\` is in the schema, the solver derives it, the fixtures carry
it, and the Portal summary reads it instead of recomputing it."
```

## 9. Tell them

Something like this, in the group chat. Adjust to sound like you.

> The three repos are merged into one: github.com/Wasif-ZA/dynamic-fit. Your commit
> history came with you, so `git log` still shows your work as yours.
>
> There is a working end-to-end version on `main` now: an order goes into the Portal,
> the solver packs it, the visualiser draws it. 192 tests, and CI runs all three
> together on every PR. That was the missing piece. The Portal was sending `ItemCode`
> and the solver was reading `item_code`, so every real order was failing at the first
> field, and none of our tests could see it because no repo had two subsystems in it.
>
> Persephone, your renderer is untouched, byte for byte, and I imported from your
> `Persephone` branch since `main` still has the placeholder cube.
>
> Aaron, two files of yours changed: two lines in `main.py` and a nine-line lookup
> helper in `orders.py`.
>
> `main` is locked now. Everything goes through a PR, including mine, and CODEOWNERS
> means your area needs your review.
>
> **Treat what is on `main` as a first draft, not a decision.** If you think something
> in there is wrong, branch off it as `rfc/whatever`, build your version, and open a
> PR. The only rule is CI has to stay green, so your alternative keeps the other two
> subsystems working. If it changes something in `docs/decisions/`, add the ADR that
> supersedes it rather than editing the old one.
>
> Three open questions are filed as issues. The Portal axis one is the important one,
> Aaron: if we have it backwards, everything still renders and everything is silently
> rotated.

---

## What this does not do

- **Nothing is deleted.** All four original repositories stay exactly as they are, so
  the import can be redone.
- **The old `DynamicSolver` README is still wrong** in its own repository: it says
  "documentation only" and "Written in C++20", neither of which has been true for
  weeks. That is what sent this merge down the wrong path for an afternoon. Fix it
  there or archive the repository.
- **Aaron's project board does not move.** His `TODO(#30)` comments point at issues in
  his tracker. Either remap them or keep the tracker where it is, but decide rather
  than letting them rot.
- **`docs/architecture.md` still describes a C++ layout.** Its pipeline and testing
  priorities carried over accurately; the language particulars did not. Noted in
  ADR-0005 as a follow-up.
