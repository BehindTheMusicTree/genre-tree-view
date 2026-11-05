# Table of content

- [Table of content](#table-of-content)
- [Setup](#setup)
- [Commands](#commands)
- [Branching model (Gitflow)](#branching-model-gitflow)
- [Cutting a release](#cutting-a-release)
- [Hotfixes](#hotfixes)

# Setup

```bash
pnpm install
pnpm dev              # builds the library in watch mode + runs apps/playground, in parallel
```

# Commands

Run from repo root unless noted.

```bash
pnpm build            # builds all workspace packages
pnpm typecheck        # tsc --noEmit across all packages
pnpm lint             # eslint across all packages
pnpm test             # vitest run, library package only
pnpm coverage         # vitest run --coverage, library package only
```

Scoped to the library only (`packages/genre-tree-view`):

```bash
pnpm --filter @behindthemusictree/genre-tree-view test:watch
pnpm --filter @behindthemusictree/genre-tree-view test -- <pattern>   # single test file/name
```

PRs are validated by `validate.yml` (build, typecheck, lint, coverage). The coverage gate in
`packages/genre-tree-view/vitest.config.ts` enforces these minimums:

| Scope | Lines / statements | Branches | Functions |
| --- | --- | --- | --- |
| Whole library | 90% | 85% | 90% |
| Each selection, pan/zoom, outline and node-selection module | 95% | 90% | 90% |

The stricter scope names `use-node-info-panel`, `use-pan-zoom`, and
`GenreTreeOutline` explicitly. Each file must pass independently so coverage in one cannot hide
untested behavior in another. Public export/type declarations and benchmarks remain excluded;
do not exclude executable behavior to make a gate pass. Thresholds do not auto-update.

Coverage is a minimum signal, not an acceptance criterion for correctness. For interaction
changes, reviewers must check regressions for the affected contracts: controlled and
uncontrolled selection, parent acceptance or rejection, panel opening/closing without callback
echoes, interrupted gestures/animations, and silent viewport restoration after layout or size
changes. Geometry changes need assertions about layout invariants in every affected renderer.
Tests should assert observable results rather than internal calls solely to increase coverage.
The browser checks in consuming apps must verify URL and Back/Forward behavior; this library
does not own routing. A passing percentage does not waive an unresolved correctness issue.

# Branching model (Gitflow)

- **`main`** — always reflects the latest released version. Every commit on `main` is tagged
  `vX.Y.Z` and triggers `publish.yml`. Never commit to `main` directly.
- **`develop`** — the integration branch. Feature and fix work targets `develop`, not `main`.
- **`feature/*`** — branch off `develop` for new work; open a PR back into `develop`.
- **`release/*`** — branch off `develop` when preparing a release (e.g. `release/1.1.0`).
- **`hotfix/*`** — branch off `main` for urgent fixes that can't wait for the next release cycle;
  PR into `main`, then back-merge into `develop`.

# Cutting a release

1. Branch `release/x.y.z` off `develop`.
2. On that branch, run `pnpm release <patch|minor|major>`. This bumps the package version,
   moves the `CHANGELOG.md` `[Unreleased]` section into a dated entry, commits, and pushes the
   branch (see `scripts/release.sh`).
3. Open a PR from `release/x.y.z` into `main` and merge it.
4. On `main`, tag the merge commit `vX.Y.Z` and push the tag — this triggers `publish.yml`, which
   builds the package, publishes it on npm (trusted publishing, with provenance) and creates a GitHub
   Release. No manual approval is needed.
5. Merge `release/x.y.z` (or `main`) back into `develop` so `develop` picks up the version bump.

# Hotfixes

1. Branch `hotfix/x.y.z` off `main`.
2. Fix the issue, then follow the same version-bump/tag/publish steps as a release (steps 2–4
   above), PRing into `main` instead of via a `release/*` branch.
3. Merge `main` back into `develop` so the fix isn't lost on the next regular release.
