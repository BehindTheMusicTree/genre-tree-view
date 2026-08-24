# Architecture

## Workspace

pnpm workspace with two members:

- `packages/genre-tree-view` — the published library (tsup build, Vitest tests).
- `apps/playground` — a Vite app for manually exercising the component against mock data; not
  published, depends on the library via `workspace:*`.

## Four renderers sharing one tree engine

- **`GenreTree.tsx`** renders one connected hierarchy as an interactive D3/SVG tree. It owns
  pan/zoom (`use-pan-zoom.ts`) and zoom buttons when `interactive` is true (the default); when
  `false`, it renders the bare SVG at natural size with no viewport/listeners of its own.
- **`GenreTreeWheel.tsx`**, **`GenreTreeWheelRight.tsx`**, **`GenreTreeWheelRadial.tsx`**, and
  **`GenreTreeWheelRadialPopCore.tsx`** all distribute the root genres of a forest around a wheel
  and mount a single (or, for the two radial variants, up to four) `GenreTree` instance(s) with
  `interactive={false}` for the selected root's subtree. Each applies one shared pan/zoom
  transform to itself and the mounted tree(s) together, rather than the tree owning an
  independent one:
  - `GenreTreeWheel` hugs the bottom of its container; the selected root's subtree grows upward
    (`orientation="vertical"`) from top-center.
  - `GenreTreeWheelRight` hugs the left edge; the selected root's subtree grows rightward
    (`orientation="horizontal-anchored"`) from right-center.
  - `GenreTreeWheelRadial` places roots around a full circle, developing up to 4 as full subtrees
    simultaneously — one per cardinal direction, using the four anchored/mirrored orientations
    (`vertical` / `horizontal-anchored` / `vertical-flipped` / `horizontal-anchored-flipped` for
    top/right/bottom/left respectively). Clicking a chip re-lays-out the ring so that root lands
    on the right.
  - `GenreTreeWheelRadialPopCore` is `GenreTreeWheelRadial` for forests where each root optionally
    splits into a required "core" child and an optional "pop" child (`GenreTreeNode.side`, see
    `pop-core-split.ts`). Each developed cardinal's outward subtree is only its core branch; if the
    root also has a pop branch, that subtree renders as a full interactive tree fanned out *inside*
    the wheel's own circle (in the cardinal's own quadrant) via a self-contained polar layout —
    `pop-core-radial-layout.ts` — instead of the cartesian `tree-renderer.ts` pipeline the other
    renderers share. The circle grows past its normal chip-clearance floor to fit the largest
    developed pop subtree.
  - `GenreTreeWheel` and `GenreTreeWheelRight` share their rotation/mounting logic via
    `GenreTreeWheelBase.tsx`'s `WheelCore`, parameterized by a `direction` prop. `GenreTreeWheelRadial`
    and `GenreTreeWheelRadialPopCore` are separate, near-identical components (`WheelRadialCore` /
    `WheelRadialPopCoreCore`) rather than one parameterized core, since the pop-core variant's two
    deltas (core-only outward branch, in-circle pop rendering) touch enough of the render body that
    sharing it would need its own branching throughout.
- All four renderers pull from the same tree-building/layout pipeline:
  - `NodeHelper.tsx` — `buildTreeHierarchyStructure` turns the flat `GenreTreeNode[]` into a d3
    hierarchy.
  - `tree-renderer.ts` — layout (`createTreeLayout`, `setupTreeLayout`), SVG sizing
    (`calculateSvgDimensions`), and DOM rendering (`renderTree`) for the `<GenreTree>` SVG.
  - `d3-helper/d3-grid-helper.ts` and `d3-helper/d3-path-helper.ts` — lower-level D3 grid/path
    geometry helpers used by the renderer.
  - `root-grouping.ts` — `groupNodesByRoot` partitions the flat node list into per-root subtrees
    for the wheel renderers.
  - `wheel-geometry.ts` and `radial-wheel-geometry.ts` — chip placement and rotation math
    (`calculateWheelRadius`, `computeRotationForSelection`, `getChipAngle`, `computeRadialLayout`,
    `calculateWheelRadiusForAngles`) shared by the wheel renderers.
  - `constants.ts` — shared sizing/color constants (node dimensions, font sizing by item count,
    wheel radius, rotation easing/timing) consumed by all renderers.
  - `pop-core-split.ts` — `splitRootGroupBySide` partitions one root group's nodes into its core
    and pop branches (`GenreTreeWheelRadialPopCore` only).
  - `pop-core-radial-layout.ts` — self-contained polar tree layout/render module (angle + radius
    per node, node/link DOM construction) for pop subtrees fanned out inside the wheel's circle
    (`GenreTreeWheelRadialPopCore` only); reuses `NodeHelper.tsx`'s position-agnostic per-node
    rendering primitives (`addHoverNameLabel`, `addToolbarActions`, `addReparentTargetOverlay`)
    rather than `tree-renderer.ts`'s cartesian-coupled `renderTree`.

## Public surface

`index.ts` is the sole export boundary:

- Components: `GenreTree`, `GenreTreeWheel`, `GenreTreeWheelRight`, `GenreTreeWheelRadial`,
  `GenreTreeWheelRadialPopCore`.
- Helpers: `getGenreTreeColor`, `DEFAULT_FRAME_WIDTH`, `DEFAULT_FRAME_HEIGHT`,
  `groupNodesByRoot`.
- Types: `GenreTreeNode`, `GenreTreeProps`, `GenreTreePlayState`, `TreeOrientation`,
  `GenreTreeAction`, `GenreTreeWheelProps`, `GenreTreeWheelRightProps`,
  `GenreTreeWheelRadialProps`, `GenreTreeWheelRadialPopCoreProps`, `GenreTreeRootGroup`.

Anything not re-exported here is a private implementation detail — treat new internals as private
unless a consumer need is established.

## Extraction context

This package was extracted from `grow-the-music-tree-frontend` so any BehindTheMusicTree app can
render the tree without depending on that app's contexts, data hooks, or domain types. Keep this
package free of app-specific data-fetching, routing, or domain assumptions — everything
consumer-specific goes through props/callbacks.
