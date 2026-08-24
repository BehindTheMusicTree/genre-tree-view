#!/usr/bin/env bash
set -euo pipefail

BUMP="${1:-}"

if [[ -z "$BUMP" ]]; then
  echo "Usage: pnpm run release -- <patch|minor|major>"
  exit 1
fi

if [[ "$BUMP" != "patch" && "$BUMP" != "minor" && "$BUMP" != "major" ]]; then
  echo "Error: bump type must be patch, minor, or major (got '$BUMP')"
  exit 1
fi

BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$BRANCH" != release/* ]]; then
  echo "Error: releases must be cut from a release/* branch (currently on '$BRANCH')"
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Error: working tree is not clean — commit or stash changes first"
  exit 1
fi

OLD_VERSION=$(node -p "require('./packages/genre-tree-view/package.json').version")
(cd packages/genre-tree-view && npm version "$BUMP" --no-git-tag-version > /dev/null)
NEW_VERSION=$(node -p "require('./packages/genre-tree-view/package.json').version")
TODAY=$(date +%Y-%m-%d)
pnpm install --lockfile-only

node -e "
const fs = require('fs');
const v = process.argv[1];
const day = process.argv[2];
let s = fs.readFileSync('CHANGELOG.md', 'utf8');
const needle = /^## \\[Unreleased\\]$/gm;
let n = 0;
s = s.replace(needle, (m) => {
  n += 1;
  if (n === 1) return \`## [Unreleased]\\n\\n## [\${v}] - \${day}\`;
  return m;
});
fs.writeFileSync('CHANGELOG.md', s);
" "$NEW_VERSION" "$TODAY"

git add packages/genre-tree-view/package.json pnpm-lock.yaml CHANGELOG.md
git commit -m "chore: release $NEW_VERSION"
git push -u origin "$BRANCH"

echo ""
echo "Bumped $OLD_VERSION -> $NEW_VERSION on '$BRANCH' and pushed."
echo ""
echo "Next steps:"
echo "  1. Open a PR from '$BRANCH' into main and merge it."
echo "  2. On main, tag the merge commit: git tag -a v$NEW_VERSION -m v$NEW_VERSION && git push origin v$NEW_VERSION"
echo "     (this triggers publish.yml to build and publish to GitHub Packages)"
echo "  3. Merge '$BRANCH' (or main) back into develop so it picks up the version bump."
