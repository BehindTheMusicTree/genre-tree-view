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
  `showToolbar` (default true) suppresses the hover toolbar and hover name-label on every node,
  and the wheel renderers' root/center chips' own inner toolbar and hover name-label, when false —
  the chips themselves (name label, click-to-select/expand) stay visible.
- **`GenreTreeWheel.tsx`**, **`GenreTreeWheelRight.tsx`**, **`GenreTreeWheelRadial.tsx`**, and
  **`GenreTreeWheelRadialPopCore.tsx`** all distribute the root genres of a forest around a wheel
  and mount a single (or, for the two radial variants, one per root) `GenreTree` instance(s) with
  `interactive={false}` for the selected root's subtree. Each applies one shared pan/zoom
  transform to itself and the mounted tree(s) together, rather than the tree owning an
  independent one:
  - `GenreTreeWheel` hugs the bottom of its container; the selected root's subtree grows upward
    (`orientation="vertical"`) from top-center.
  - `GenreTreeWheelRight` hugs the left edge; the selected root's subtree grows rightward
    (`orientation="horizontal-anchored"`) from right-center.
  - `GenreTreeWheelRadial` places all roots around a full circle, each root's angular width
    proportional to its own subtree's node count (`computeRadialLayout` in
    `radial-wheel-geometry.ts`), developing every one of them as a full subtree simultaneously. Unlike `GenreTreeWheel`/`GenreTreeWheelRight`, each
    developed root's branch is *not* a mounted `<GenreTree>` (cartesian `tree-renderer.ts`
    pipeline); it's a self-contained polar layout — `core-radial-layout.ts`'s
    `buildCoreHierarchy`/`computeCoreRadialLayout` — rendered with straight-line links via the same
    node/link primitives the pop-core wheel uses (`renderPopSubtree` from
    `pop-core-radial-layout.ts`), into a `<g class="gtv-wheel-core-sector" data-gtv-root-id="{rootId}">`
    inside a shared `<svg class="gtv-wheel-pop-layer">` layer. Each root's branch is confined to its
    own bisected angular sector (capped by `POP_WEDGE_SPAN_DEGREES`, `bisectAngles`/
    `computeSectorBounds` in `radial-wheel-geometry.ts`) so neighboring roots' subtrees can't
    overlap; the wheel's own circle (`wheelRadius`) grows past its normal chip-clearance floor to
    fit whichever developed branch reaches deepest. Clicking a chip re-lays-out the ring so that
    root lands on the right, recalculating every other root's angle.
  - `GenreTreeWheelRadialPopCore` is `GenreTreeWheelRadial` for forests where each root optionally
    splits into a required "core" child and an optional "pop" child (`GenreTreeNode.side`, see
    `pop-core-split.ts`). Each developed root's outward branch is only its core branch, laid out
    and rendered exactly as in `GenreTreeWheelRadial` above (`core-radial-layout.ts`, straight
    links, `.gtv-wheel-core-sector` with `data-gtv-root-id`); if the root also has a pop branch,
    that subtree renders as a second, full interactive tree fanned out *inside* the wheel's own
    circle (in the same angular sector) via `pop-core-radial-layout.ts`'s pop layout. The circle
    grows past its normal chip-clearance floor to fit the largest developed core or pop subtree,
    whichever reaches deepest. Unlike the other three renderers (which take an optional `centerLabel`
    string), its wheel's pivot point renders a full interactive chip — the same
    `.gtv-wheel-chip-anchor`/`.gtv-wheel-chip` markup and styling as a ring root chip — for the
    root named exactly `"Mainstream Pop"` — required to exist among `nodes`, or the component
    throws — and that root (plus its own descendants, if any) is excluded from the ring's own
    chips. The center "Mainstream Pop" node may have its own subtree: hidden by default, it
    toggles open/closed via a dedicated floating button stacked above the zoom controls in the
    bottom-left corner (rendered only when the center node has a subtree; local component state,
    not exposed via props) — the center chip itself is not clickable. When expanded, its direct
    children spread around a full-circle invisible **mainstream pop root circle** proportional to
    each child's own subtree size, with deeper descendants radiating further out and staying
    within the **mainstream pop outer circle**, via `computeCenterRadialLayout` in
    `pop-core-radial-layout.ts` — the same node/link rendering (`renderPopSubtree`) as each ring
    root's pop wedge, just laid out over the full circle instead of one root's own sector. The
    wheel's own edge —
    the **core root circle**, where ring root chips sit — grows to keep a gap past that subtree's
    outer radius (`MAINSTREAM_POP_ROOT_CIRCLE_GAP` / `MAINSTREAM_POP_OUTER_CIRCLE_GAP` in
    `constants.ts`).
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
    (`calculateSvgDimensions`), and DOM rendering (`renderTree`) for the `<GenreTree>` SVG. When a
    tree is mounted with `hideRoot` (every wheel renderer's subtree, growing out of a root chip),
    every visible node — not just the root's direct children — renders filled with that root's own
    genre color and bold white label text, so the subtree reads as a continuation of the chip
    rather than a jump into plain cards; `GenreTreeWheelRadialPopCore`'s in-circle "pop" branch
    doesn't use `hideRoot` and keeps its plain styling.
  - `d3-helper/d3-grid-helper.ts` and `d3-helper/d3-path-helper.ts` — lower-level D3 grid/path
    geometry helpers used by the renderer.
  - `root-grouping.ts` — `groupNodesByRoot` partitions the flat node list into per-root subtrees
    for the wheel renderers.
  - `wheel-geometry.ts` and `radial-wheel-geometry.ts` — chip placement and rotation math
    (`calculateWheelRadius`, `computeRotationForSelection`, `getChipAngle`, `computeRadialLayout`,
    `calculateWheelRadiusForAngles`) shared by the wheel renderers, plus the radial divider/sector
    fill math each wheel variant uses to separate and tint adjacent roots' angular spans:
    `getWheelDividerAngle`/`buildWheelSectorGradient` (evenly-spaced simple wheel, a single static
    `conic-gradient` since the whole `.gtv-wheel` rotates as one unit) and `bisectAngles` plus
    `buildSectorClipPathPolygon`/`computeSectorBounds` (the two radial wheels' proportionally-spaced,
    continuously-animated roots — rendered as individually-rotated divider lines and arc-sampled
    `clip-path` sector fans instead of a periodic gradient, so re-layout animates smoothly instead
    of snapping at the 0°/360° seam). Divider lines and sector fills are rendered as oversized
    elements anchored at the wheel's rotation pivot, relying on `.gtv-wheel-container`'s
    `overflow: hidden` to clip them at the real frame edge under any pan/zoom instead of computing
    a rectangle intersection.
  - `constants.ts` — shared sizing/color constants (node dimensions, font sizing by item count,
    wheel radius, rotation easing/timing) consumed by all renderers.
  - `pop-core-split.ts` — `splitRootGroupBySide` partitions one root group's nodes into its core
    and pop branches (`GenreTreeWheelRadialPopCore` only); a root must have at most one non-pop
    direct child, or it throws (fail-fast — no silently dropping ambiguous data).
  - `pop-core-radial-layout.ts` — self-contained polar tree layout/render module (angle + radius
    per node, node/link DOM construction, `renderPopSubtree`) for pop subtrees fanned out inside
    the wheel's circle (`GenreTreeWheelRadialPopCore`'s pop branches and its center "Mainstream
    Pop" subtree); reuses `NodeHelper.tsx`'s position-agnostic per-node rendering primitives
    (`addHoverNameLabel`, `addToolbarActions`, `addReparentTargetOverlay`) rather than
    `tree-renderer.ts`'s cartesian-coupled `renderTree`.
  - `core-radial-layout.ts` — the polar layout counterpart for each root's outward-developing
    branch (`buildCoreHierarchy`, `computeCoreRadialLayout`, `calculateCoreSubtreeRadialExtent`),
    used by both `GenreTreeWheelRadial` and `GenreTreeWheelRadialPopCore`; rendered via
    `pop-core-radial-layout.ts`'s `renderPopSubtree`, so both a root's core branch and its pop
    branch share the same node/link DOM construction and only differ in the layout math that
    produces each node's angle/radius.

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
