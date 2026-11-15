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
pnpm exec playwright install chromium # once, for browser checks
pnpm test:browser      # Chromium touch/desktop gestures against pnpm build output
```

Scoped to the library only (`packages/genre-tree-view`):

```bash
pnpm --filter @behindthemusictree/genre-tree-view test:watch
pnpm --filter @behindthemusictree/genre-tree-view test -- <pattern>   # single test file/name
```

PRs are validated by `validate.yml` (build, typecheck, lint, coverage and browser gestures).
Browser checks use the compiled playground and canonical genre fixture. They assert gesture
behavior; attached Chrome performance counters are diagnostics, not phone timing budgets.
Use `PLAYWRIGHT_CHANNEL=chrome pnpm test:browser` to use a locally installed Chrome instead. The coverage gate in
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

- **`main`** — always reflects the latest released version. A validated version increase on `main` is tagged
  `vX.Y.Z` by CI and triggers `publish.yml`. Never commit to `main` directly.
- **`develop`** — the integration branch. Feature and fix work targets `develop`, not `main`.
- **`feature/*`** — branch off `develop` for new work; open a PR back into `develop`.
- **`release/*`** — branch off `develop` when preparing a release (e.g. `release/1.1.0`).
- **`hotfix/*`** — branch off `main` for urgent fixes that can't wait for the next release cycle;
  PR into `main`, then back-merge into `develop`.

# Cutting a release

1. Branch `release/x.y.z` off `develop`.
2. On that branch, run `pnpm release <patch|minor|major>`. This bumps the package version,
   moves the non-empty `CHANGELOG.md` `[Unreleased]` section into a dated entry, and updates
   the lockfile without committing, pushing or tagging (see `scripts/release.sh`).
3. Review and commit the prepared files, push the branch and open a PR into `main`.
4. After merge, CI validates the canonical package version and changelog, creates its annotated
   tag and triggers `publish.yml`. Publication verifies release notes and the exact tagged commit
   on `main`, publishes with npm provenance and creates the GitHub Release after npm succeeds.
   A retry skips an existing npm version only when the packed artifact has identical SHA-512 integrity.
   Do not create or push release tags locally.
5. Merge `release/x.y.z` (or `main`) back into `develop` so `develop` picks up the version bump.

Activation of the shared App credentials and tag rulesets is separate, after this contract
reaches `main`. Initial activation does not publish the existing version.

# Hotfixes

1. Branch `hotfix/x.y.z` off `main`.
2. Fix the issue, then follow the same version-bump/tag/publish steps as a release (steps 2–4
   above), PRing into `main` instead of via a `release/*` branch.
3. Merge `main` back into `develop` so the fix isn't lost on the next regular release.

# Android browser gestures

`pnpm test:android` uses Chrome inside one booted Android emulator, through
Playwright's experimental Android API. Install Android SDK platform-tools and an
API 35 x86_64 `google_apis` image, create a Pixel 5 AVD in portrait, then boot it
and run `adb devices`. Exactly one authorized, booted device must be listed.
Chrome 105 or newer must be installed. Non-rooted devices also need Chrome's
“Enable command line on non-rooted devices” flag. Keep the emulator awake.
See [Playwright Android requirements](https://playwright.dev/docs/api/class-android).

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm test:android
```

The runner starts the production preview on 127.0.0.1:4173, installs an ADB reverse
mapping for that port and removes it afterward. Reserve this port. Each test
**clears the selected device's Chrome app data**, launches Chrome, and closes it
on completion. Use a disposable emulator. Missing ADB, ambiguous devices, old or
missing Chrome, and unavailable preview fail explicitly.

Input uses CDP `Input.dispatchTouchEvent`, not native OS input. These are functional
regression tests against the canonical fixture, not emulator latency or FPS gates;
physical-phone latency needs separate measurements. Desktop and emulated-touch
checks remain in `pnpm test:browser`. Reports, screenshots on failure, traces and
console errors go to `android-report/` and `android-results/`.

`android-browser.yml` supports manual feature-branch runs and daily 03:17 UTC runs
checking out `develop`. Scheduled workflows require the file on the default branch
(currently `develop`); if that changes to `main`, activation must wait for a normal
approved release. CI cold-boots API 35 with image-provided Chrome, records Chrome
and SDK image revisions, and retains diagnostics/logcat for 14 days. It does not
update Chrome during tests. This job initially runs manually/nightly. Promotion to
a required PR check needs a separate decision after ten consecutive first-attempt
clean runs, each under 15 minutes.
