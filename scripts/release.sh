#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == -- ]]; then shift; fi
BUMP="${1:-}"
if [[ $# != 1 || ! "$BUMP" =~ ^(patch|minor|major)$ ]]; then
  echo 'Usage: pnpm release -- <patch|minor|major>' >&2
  exit 1
fi
cd "$(git rev-parse --show-toplevel)"
BRANCH=$(git branch --show-current)
if [[ "$BRANCH" != release/* && "$BRANCH" != hotfix/* ]]; then
  echo 'Error: use a release branch from current develop, or a hotfix branch from main' >&2
  exit 1
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo 'Error: working tree must be clean before release preparation' >&2
  exit 1
fi
node scripts/release-utils.cjs check "$BUMP"
(cd packages/genre-tree-view && npm version "$BUMP" --no-git-tag-version --ignore-scripts > /dev/null)
pnpm install --lockfile-only
node scripts/release-utils.cjs prepare
printf 'Prepared release files. Review, commit and open a PR against main. CI creates the tag after merge; integrate main back into develop afterward.\n'
