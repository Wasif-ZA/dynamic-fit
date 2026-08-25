#!/usr/bin/env bash
#
# Rebuild the Dynamic Fit monorepo so every contributor's commits survive the merge.
#
# WHY THIS EXISTS
#
#   Copying files into a new repository attributes Aaron's commits and Persephone's
#   to whoever ran the copy. Sixty percent of COMP4050 is graded on individual
#   contribution evidence, so that is not a tidiness question.
#
#   `git subtree add` without `--squash` keeps the original commit objects, with
#   their authors, dates and messages, so `git log --follow` still finds them.
#
# WHAT IT DOES
#
#   1. Starts a fresh repository at TARGET.
#   2. Imports each source repository under a prefix, history intact.
#   3. Moves the solver's files into their monorepo positions with `git mv`.
#   4. Lays the integration work from SOURCE_TREE over the top.
#   5. Stages everything and STOPS. It does not commit that last step and never
#      pushes. Review, then commit yourself.
#
# USAGE
#
#   bash scripts/assemble-with-history.sh [TARGET]
#
#   TARGET defaults to ../dynamic-fit-assembled, so it never writes over the tree
#   you are reading this in.
#
# AFTERWARDS
#
#   docs/MERGE-RUNBOOK.md covers the rename, the push, and the pull requests.

set -euo pipefail

SOURCE_TREE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-$(dirname "$SOURCE_TREE")/dynamic-fit-assembled}"

PORTAL_REMOTE="https://github.com/AaronMinhas/comp4050-portal.git"
VISUALISER_REMOTE="https://github.com/sweetpea004/COMP4050-2026-Discovery-Visualiser.git"
SOLVER_REMOTE="https://github.com/Wasif-ZA/DynamicSolver.git"

# The finished renderer is on the Persephone branch. The default branch holds an
# early stub whose buildSceneFromData draws a placeholder cube, and importing it
# would lose nine commits of real work.
VISUALISER_BRANCH="Persephone"

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

if [ -e "$TARGET" ]; then
  echo "TARGET already exists: $TARGET" >&2
  echo "Remove it or pass a different path. This script will not write over it." >&2
  exit 1
fi

say "Creating $TARGET"
mkdir -p "$TARGET"
cd "$TARGET"
git init -q -b main

# subtree add needs something to attach to, so the tree cannot be empty.
git commit -q --allow-empty -m "Start the Dynamic Fit monorepo

Empty root commit. Every subsystem below arrives by git subtree with its own
history attached, so each contributor keeps authorship of their work.

See docs/decisions/0007-monorepo-with-preserved-history.md."

import() {
  local name="$1" remote="$2" branch="$3" prefix="$4"
  say "Importing $name from $branch into $prefix"
  git remote add "$name" "$remote"
  git fetch -q "$name" "$branch"
  # No --squash: that collapses the imported work into one commit and loses
  # exactly the per-author record this script exists to keep.
  git subtree add --prefix="$prefix" "$name" "$branch" \
    -m "Import $name from $remote ($branch)

Brought in with git subtree, history preserved. Original commits keep their
authors and dates; verify with: git log --follow $prefix"
  git tag "import/$name" FETCH_HEAD
}

import portal      "$PORTAL_REMOTE"     main                  apps/portal
import visualiser  "$VISUALISER_REMOTE" "$VISUALISER_BRANCH"  apps/visualiser
import solver      "$SOLVER_REMOTE"     main                  .import/solver

say "Moving the solver into its monorepo positions"
mkdir -p packages docs/prototypes
git mv .import/solver/fitsolver packages/solver
git mv .import/solver/contract contract
git mv .import/solver/docs docs
git mv ".import/solver/bin4d - BFS Greedy" docs/prototypes/bin4d-bfs-greedy
for doc in BENCHMARK.md PLAN.md CONTRIBUTING.md; do
  git mv ".import/solver/$doc" "docs/$doc"
done
git mv .import/solver/LICENSE LICENSE
for flow in benchmark.yml contract-release.yml; do
  mkdir -p .github/workflows
  git mv ".import/solver/.github/workflows/$flow" ".github/workflows/$flow"
done

# What is left of the import is superseded by the overlay: the solver's own
# README described a documentation-only C++ project, and its ci.yml only knew
# about the solver.
git rm -r -q --ignore-unmatch .import

git commit -q -m "Move the solver into the monorepo layout

git mv rather than a copy, so git log --follow still reaches the original
commits. The solver README and its single-subsystem CI are dropped here and
replaced by the repository root README and the unified workflow."

say "Laying the integration work over the top"
# tar rather than rsync: rsync is not in a default Git Bash install.
tar -C "$SOURCE_TREE" \
    --exclude='.git' \
    --exclude='.venv' \
    --exclude='node_modules' \
    --exclude='__pycache__' \
    --exclude='.pytest_cache' \
    --exclude='.hypothesis' \
    --exclude='.ruff_cache' \
    --exclude='*.egg-info' \
    --exclude='.uv-cache' \
    -cf - . | tar -C "$TARGET" -xf -

git add -A

say "Done. The last step is staged, not committed. Nothing was pushed."
cat <<'NEXT'

Staged now: the unified CI, CODEOWNERS, the end-to-end suite, the Portal solve
routes and box catalogue, the new ADRs, and the repository README.

Check it, then commit yourself:

    git status
    git diff --cached --stat
    git commit -m "Integrate the portal, solver and visualiser in one repository"

Confirm the histories really did survive before pushing. Each of these should
show its original author, not you:

    git log --follow --format='%h %an %ad %s' -- apps/portal/backend/app/models.py
    git log --follow --format='%h %an %ad %s' -- apps/visualiser/visualiser.js
    git log --follow --format='%h %an %ad %s' -- packages/solver/src/fitsolver/pack.py

And that the tree actually works:

    UV_LINK_MODE=copy uv sync --group dev
    UV_LINK_MODE=copy uv run pytest

Then follow docs/MERGE-RUNBOOK.md for the rename, the push and the pull requests.
NEXT
