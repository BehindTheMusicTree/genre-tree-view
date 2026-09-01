---
name: code-review
description: Guide for reviewing pull requests in this repository. Use this when asked to review a pull request or diff.
---

This repository is `@behindthemusictree/genre-tree-view`, a presentational D3-based tree
visualization component for React (pnpm workspace: `packages/genre-tree-view` is the published
library, `apps/playground` is a Vite app for manual testing). See `CLAUDE.md` and `ARCHITECTURE.md`
for the module breakdown and public export surface, and `CONTRIBUTING.md` for the branching model
and contribution conventions.

When reviewing a pull request, check for:

- **Rendering-only boundary**: this package owns rendering only. Data fetching, mutations, and
  popups/dialogs belong to the consumer via callback props (`onPlayPause`, `onAddChild`,
  `onRenameRequest`, `onDeleteRequest`, `onReparentRequest`, `onReparent`, `additionalActions`).
  Flag any change that reaches outside this boundary (e.g. direct API calls, owning dialog state).
- **Shared layout pipeline consistency**: the five renderers (`GenreTree`, `GenreTreeWheel`,
  `GenreTreeWheelRight`, `GenreTreeWheelRadial`, `GenreTreeWheelRadialPopCore`) share one
  tree-building/layout pipeline. A change to shared layout math (radii, spacing, angle conventions)
  should be checked against all renderers that consume it, not just the one being edited.
- **Radial geometry conventions**: polar-to-cartesian conversions in this codebase follow the CSS
  `rotate()` convention (`x = radius * sin(angle)`, `y = -radius * cos(angle)`). Flag any new radial
  math that silently uses the standard math convention instead.
- **Margin/clearance accounting applied exactly once**: radial spacing constants (e.g. node
  half-width plus outer margin) must be applied in exactly one place in the sizing chain. Watch for
  a margin being both baked into a circle's own radius calculation and re-subtracted per-node
  downstream — that double-application cancels out incorrectly for the tightest-fit case.
- **Test coverage**: this project enforces a 95% coverage threshold (lines/branches/functions/
  statements) in `vitest.config.ts`. A behavioral change should come with updated or new tests in
  `packages/genre-tree-view/src/__tests__/`. If an existing test's expected value encodes the old
  (pre-change) behavior as correct, it should be rewritten, not left passing by coincidence.
- **Changelog**: user-facing fixes or features should add an entry under `[Unreleased]` in
  `CHANGELOG.md`.
- **Git workflow**: per `CLAUDE.md`, no commits directly to `main` or `develop` — changes should
  land on a `feature/*`, `fix/*`, `chore/*`, `release/*`, or `hotfix/*` branch per the Gitflow model
  in `CONTRIBUTING.md`.
