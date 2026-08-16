# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`@behindthemusictree/genre-tree-view` — a reusable, presentational D3-based tree visualization
component for React, published to GitHub Packages. It renders a flat `GenreTreeNode[]` as an
interactive genre/hierarchy tree via callback props (`onPlayPause`, `onAddChild`,
`onRenameRequest`, `onDeleteRequest`, `onReparentRequest`, `onReparent`, `onUploadFiles`). All
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

Release (from `main`, clean working tree only): `pnpm release -- <patch|minor|major>`. Bumps the
package version, updates `CHANGELOG.md`, commits, tags, and pushes — `publish.yml` then builds
and publishes to GitHub Packages on the pushed tag.

## Architecture

### Two renderers sharing one tree engine

- `GenreTree.tsx` renders one connected hierarchy as an interactive D3/SVG tree. It owns pan/zoom
  (`use-pan-zoom.ts`) and zoom buttons when `interactive` is true (the default); when `false`, it
  renders the bare SVG at natural size with no viewport/listeners of its own.
- `GenreTreeWheel.tsx` distributes all root genres around a wheel hugging the bottom of its
  container. Clicking a chip rotates the wheel so that root lands top-center and swaps in a
  single `GenreTree` (with `interactive={false}`) rendering that root's subtree, oriented
  `"vertical"` (growing upward from the anchor) instead of the default `"horizontal"`. The wheel
  applies one shared pan/zoom transform to itself and the mounted tree together, rather than the
  tree owning an independent one. Only the selected root's subtree is ever mounted.
- Both renderers pull from the same tree-building/layout pipeline:
  - `NodeHelper.tsx` — `buildTreeHierarchyStructure` turns the flat `GenreTreeNode[]` into a d3
    hierarchy.
  - `tree-renderer.ts` — layout (`createTreeLayout`, `setupTreeLayout`), SVG sizing
    (`calculateSvgDimensions`), and DOM rendering (`renderTree`) for the `<GenreTree>` SVG.
  - `d3-helper/d3-grid-helper.ts` and `d3-helper/d3-path-helper.ts` — lower-level D3 grid/path
    geometry helpers used by the renderer.
  - `root-grouping.ts` — `groupNodesByRoot` partitions the flat node list into per-root subtrees
    for the wheel.
  - `wheel-geometry.ts` — chip placement and rotation math (`calculateWheelRadius`,
    `computeRotationForSelection`, `getChipAngle`) for `GenreTreeWheel`.
  - `constants.ts` — shared sizing/color constants (node dimensions, font sizing by item count,
    wheel radius, rotation easing/timing) consumed by both renderers.

### Public surface

`index.ts` is the sole export boundary: `GenreTree`, `GenreTreeWheel`, `getGenreTreeColor`,
`WHEEL_DEFAULT_FRAME_HEIGHT`, `groupNodesByRoot`, and the public types (`GenreTreeNode`,
`GenreTreeProps`, `GenreTreePlayState`, `TreeOrientation`, `GenreTreeWheelProps`,
`GenreTreeRootGroup`). Anything not re-exported here is a private implementation detail — treat
new internals as private unless a consumer need is established.

### Extraction context

This package was extracted from `grow-the-music-tree-frontend` so any BehindTheMusicTree app can
render the tree without depending on that app's contexts, data hooks, or domain types. Keep this
package free of app-specific data-fetching, routing, or domain assumptions — everything
consumer-specific goes through props/callbacks.
