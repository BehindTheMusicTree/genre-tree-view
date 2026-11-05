#!/usr/bin/env bash
set -euo pipefail
SOURCE=$(cd "$(dirname "$0")/../.." && pwd)
FIXTURE=$(mktemp -d)
trap 'rm -rf "$FIXTURE"' EXIT
mkdir -p "$FIXTURE/scripts" "$FIXTURE/packages/genre-tree-view" "$FIXTURE/bin"
cp "$SOURCE/scripts/release.sh" "$SOURCE/scripts/release-utils.cjs" "$FIXTURE/scripts/"
cd "$FIXTURE"
printf '{"name":"fixture","version":"1.2.3"}\n' > packages/genre-tree-view/package.json
printf '## [Unreleased]\n\n- Example\n\n## [1.2.3]\n\n- Previous\n' > CHANGELOG.md
printf 'lockfile\n' > pnpm-lock.yaml
cat > bin/pnpm <<'MOCK'
#!/usr/bin/env bash
set -eu
[[ "$*" == 'install --lockfile-only' ]]
printf 'prepared\n' > pnpm-lock.yaml
MOCK
chmod +x bin/pnpm
export PATH="$FIXTURE/bin:$PATH"
git init -q -b main
git config user.email fixture@example.test
git config user.name Fixture
git add .
git commit -qm fixture
INITIAL=$(git rev-parse HEAD)
expect_failure() {
  if bash scripts/release.sh "$@" > "$FIXTURE/../genre-tree-view-release-result-$$.log" 2>&1; then
    echo 'Expected release preparation to fail' >&2
    exit 1
  fi
  rm "$FIXTURE/../genre-tree-view-release-result-$$.log"
  [[ "$(git rev-parse HEAD)" == "$INITIAL" ]]
  [[ -z "$(git tag)" ]]
}
# Keep logs outside the worktree so the clean-tree check remains meaningful.
expect_failure patch
git switch -qc develop
expect_failure patch
git switch -qc release/fixture
printf 'dirty\n' >> CHANGELOG.md
expect_failure patch
git restore CHANGELOG.md
printf '## [Unreleased]\n\n### Fixed\n' > CHANGELOG.md
git add CHANGELOG.md
git commit -qm empty
INITIAL=$(git rev-parse HEAD)
expect_failure patch
git restore --source=HEAD~1 CHANGELOG.md
git add CHANGELOG.md
git commit -qm notes
INITIAL=$(git rev-parse HEAD)
bash scripts/release.sh -- patch
[[ "$(node -p "require('./packages/genre-tree-view/package.json').version")" == 1.2.4 ]]
[[ "$(git rev-parse HEAD)" == "$INITIAL" ]]
[[ -z "$(git tag)" ]]
node -e "const fs=require('fs');if(!fs.readFileSync('CHANGELOG.md','utf8').includes('## [1.2.4] - '))process.exit(1)"
printf 'Release preparation fixtures passed\n'
