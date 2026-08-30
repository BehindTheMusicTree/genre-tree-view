# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`@behindthemusictree/genre-tree-view` — a reusable, presentational D3-based tree visualization
component for React, published to GitHub Packages. It renders a flat `GenreTreeNode[]` as an
interactive genre/hierarchy tree via callback props (`onPlayPause`, `onAddChild`,
`onRenameRequest`, `onDeleteRequest`, `onReparentRequest`, `onReparent`, `additionalActions`). All
data fetching, mutations, and popups/dialogs are the consumer's responsibility — this package
owns rendering only.

pnpm workspace with two members:

- `packages/genre-tree-view` — the published library (tsup build, Vitest tests).
- `apps/playground` — a Vite app for manually exercising the component against mock data; not
  published, depends on the library via `workspace:*`.

## Commands

Run from repo root unless noted.

```bash
pnpm install
pnpm dev              # builds the library in watch mode + runs the playground, in parallel
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

Coverage thresholds are enforced at 95% (lines/branches/functions/statements) in
`vitest.config.ts`, excluding `src/index.ts` and `src/types.ts`.

Release: cut a `release/x.y.z` branch off `develop`, then run
`pnpm release -- <patch|minor|major>` on it. Bumps the package version, updates `CHANGELOG.md`,
commits, and pushes the branch — merging into `main` and tagging triggers `publish.yml` to build
and publish to GitHub Packages. See `CONTRIBUTING.md` for the full branching model and release
flow.

## Architecture

Five renderers (`GenreTree`, `GenreTreeWheel`, `GenreTreeWheelRight`, `GenreTreeWheelRadial`,
`GenreTreeWheelRadialPopCore`) share one tree-building/layout pipeline. See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the full
breakdown of modules and the public export surface — keep that file in sync with this one instead
of duplicating details here.
