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
  `defaultViewport` / `onViewportChange` expose the pan/zoom as a `GenreTreeViewport` (content-space
  center `x`,`y` + `zoom`, independent of the container's pixel size — `viewToViewport` /
  `viewportToView` in `zoom-pan.ts`). `defaultViewport` is a mount-only seed: the first
  `fitToFrame` in `use-pan-zoom.ts` applies it (zoom clamped to the fitted min scale) instead of
  fitting, and `centerOnElement` is suppressed for `DEFAULT_VIEWPORT_CENTER_GUARD_MS` afterwards so
  initial-selection centering doesn't override it. `onViewportChange` fires from `commitView`
  (the single settle point), but not for the mount fit or the seed.
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
  - `GenreTreeWheelRadialPopCore` is `GenreTreeWheelRadial` for forests where each root's direct
    children optionally split into any number of "core" children and any number of "pop" children
    (`GenreTreeNode.side`, see `pop-core-split.ts`). Each developed root's outward branches are
    only its core children, one subtree per child, laid out and rendered exactly as in
    `GenreTreeWheelRadial` above (`core-radial-layout.ts`, straight links, each root's own
    `.gtv-wheel-core-sector` with `data-gtv-root-id`, one `.gtv-wheel-core-branch` per child inside
    it); if the root also has pop children, each of those subtrees renders as a second, full
    interactive tree fanned out *inside* the wheel's own circle (in the same angular sector, one
    `.gtv-wheel-pop-branch` per child) via `pop-core-radial-layout.ts`'s pop layout. A root's wedge
    is subdivided across its own branches proportionally to each branch's subtree size
    (`subdivideWedge` in `radial-wheel-geometry.ts`). The circle
    grows past its normal chip-clearance floor to fit the largest developed core or pop subtree,
    whichever reaches deepest. Unlike the other three renderers (which take an optional `centerLabel`
    string), its wheel's pivot point renders a full interactive chip — the same
    `.gtv-wheel-chip-anchor`/`.gtv-wheel-chip` markup and styling as a ring root chip — for the
    root named exactly `"Mainstream Pop"` — required to exist among `nodes`, or the component
    throws — and that root (plus its own descendants, if any) is excluded from the ring's own
    chips. The center "Mainstream Pop" node's own subtree, if any, is always expanded (no toggle); the
    center chip clicks like a ring root chip (centers on it, opens the info panel). Its direct
    children spread around a full-circle invisible **mainstream pop root circle** proportional to
    each child's own subtree size, with deeper descendants radiating further out and staying
    within the **mainstream pop outer circle**, via `computeCenterRadialLayout` in
    `pop-core-radial-layout.ts` — the same node/link rendering (`renderPopSubtree`) as each ring
    root's pop wedge, just laid out over the full circle instead of one root's own sector. The
    wheel's own edge —
    the **core root circle**, where ring root chips sit — grows only when that subtree's outer radius plus half a max node width
    (`MAX_NODE_WIDTH`) and `POP_SUBTREE_OUTER_MARGIN` would overlap the ring roots' chip clearance.
  - `GenreTreeWheel` and `GenreTreeWheelRight` share their rotation/mounting logic via
    `GenreTreeWheelBase.tsx`'s `WheelCore`, parameterized by a `direction` prop. `GenreTreeWheelRadial`
    and `GenreTreeWheelRadialPopCore` are separate, near-identical components (`WheelRadialCore` /
    `WheelRadialPopCoreCore`) rather than one parameterized core, since the pop-core variant's two
    deltas (core-only outward branch, in-circle pop rendering) touch enough of the render body that
    sharing it would need its own branching throughout.
- **`GenreTreeOutline.tsx`** is the non-graphical counterpart of `GenreTreeWheelRadialPopCore`:
  the same forest as nested `<details>` lists (all collapsed initially), "Mainstream Pop"
  first, then each other root with its direct children split into "Core" and "Pop" sections via
  `splitRootGroupBySide`. Roots flagged `detached` (`GenreTreeNode.detached`) are left out of
  that list and rendered in a separate `.gtv-outline-list--detached` list after it, neutral gray
  and without Core/Pop sections. It reuses the React `NodeToolbar` and `InfoPanel`. Selection, open
  sections, play state and reparent mode live in a small external store created once per
  instance; each row is a memoized recursive `OutlineNode` that subscribes to its own slice via
  `useSyncExternalStore`, and receives only stable props (node id, a model memoized on `nodes`,
  and a callbacks object that reads the latest callback props through a ref). Selecting a node
  therefore re-renders only the previously and newly selected rows plus the panel. `<details>`
  open state is controlled and a section's children only render while it is open. Panel chip
  navigation and `selectedNodeId` open the target row's ancestor sections and scroll it into view
  after the commit. `GenreTreeOutlineSkeleton` is its `viewMode="outline"` loading placeholder.
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
  - `tree-index.ts` — `buildTreeIndex` builds, in one pass, the by-id, children-by-parent,
    root-id and ancestor lookups; `use-tree-index.ts`'s `useTreeIndex` memoizes it per `nodes`
    identity. `GenreTree`, `GenreTreeWheelRadialBase`, `GenreTreeWheelRadialPopCoreBase` and
    `GenreTreeOutline` use it instead of rescanning `nodes` per lookup.
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
    wheel radius, rotation easing/timing) consumed by all renderers. `getGenreNodeStyle` gives every
    pop-core node (chip, dot, info-panel header) a fill/text color that depends only on the full tree,
    so a genre keeps its color in every zoom frame.
  - `pop-core-frame.ts` — `resolvePopCoreFrame` picks the pop-core wheel's center node (the
    "Mainstream Pop" root, or a focused node's single pop child / the focused node itself) and its
    ring nodes, so `focusNodeId` can render any subtree as its own wheel; `isZoomableNode` is the
    rule for which nodes may be that focus (any node with children and at most one pop child).
    `GenreTreeWheelRadialPopCoreBase.tsx` offers "Zoom in" on every zoomable node's info panel (which stays open on the zoomed node) and,
    while focused, `WheelBreadcrumb.tsx`: one top-centre trail (bottom-left in narrow containers) of a Home crumb,
    every zoomable ancestor view (the middle collapses behind "…" past three) and the current view. The info
    panel header's Previous button walks the selected-node history kept by `use-focus-history.ts`'s
    `useFocusHistory` (in memory only; skips nodes no longer drawn). A selection outside the current frame refocuses on its top-level root (the whole tree
    for Mainstream Pop's lineage or a root itself).
  - `pop-core-split.ts` — `splitRootGroupBySide` partitions one root group's nodes into its core
    and pop branches (`GenreTreeWheelRadialPopCore` only); a root may have any number of core and
    pop direct children, each becoming its own branch.
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
  - `GenreTreeNode.scene`: `GenreTreeWheelRadialPopCoreBase` draws an `"underground"` node and its descendants in a darker shade (`shadeSurface`, `UNDERGROUND_DARKEN_RATIO`); layout is unaffected.
- **Layout vs. size metric**: radial layouts (wedge measurement, ring radius, root sectors, positions) depend on tree topology only, every node reserving the fixed `NODE_LAYOUT_SLOT_RADIUS`. `itemCount` drives rendering only (dot radius, fonts, border widths, label rank), so switching the size metric never moves nodes.
- **`itemCount` contract**: every node's `itemCount` is a subtree total (itself plus all descendants),
  supplied by the consumer. `buildTreeHierarchyStructure` only stratifies, and every renderer, root chip,
  outline row and the info panel reads `itemCount` as-is — nothing rolls counts up.
- **Node info panel**: clicking any node opens a read-only panel showing that node's item count
  (row label supplied by the required `itemCountLabel` prop) and side, its ancestors root-first (including the parent) as a vertical chain, and its direct
  children, each as a clickable circle node filled with that node's own color — internal presentational chrome,
  like `NodeHelper.tsx`'s reparent drop-target overlay, not exposed to consumers and independent of
  the `onNodeClick` callback, which keeps firing unchanged. It always anchors to the left edge of
  the renderer's viewport (`resolveInfoPanelSide` in `info-panel-geometry.ts`); clicking a node or
  a panel chip centers that node within the space that remains visible beside the panel rather
  than the viewport's full width, via `resolveInfoPanelObscuredArea` feeding `centerOnElement`'s
  `obscured` argument in `use-pan-zoom.ts`. Each top-level renderer owns exactly one
  `useNodeInfoPanel({ selectedNodeId, onSelectedNodeChange })` hook instance (`use-node-info-panel.ts`) — except `GenreTreeOutline`, which
  keeps the selected id in its own store — so only one panel is ever open per component instance; `GenreTreeWheelRadialPopCoreBase.tsx` shares its single instance across all
  three of its D3 click sites (a root's pop branch, its core branch, the center "Mainstream Pop"
  subtree) plus its ring chip buttons. The panel closes via its own close button (hidden by
  `hideInfoPanelClose`) or when a controlled `selectedNodeId` is cleared to `null`/`undefined`.
  The pop-core wheel also hides the panel at render time whenever its node isn't drawn in the
  current focus frame, so a focus change can never leave a panel pointing at an off-screen node.
  The hook fires `onSelectedNodeChange` when a user action changes the shown node (or with `null`
  on the close button); each renderer's effect that follows `selectedNodeId` calls
  `showNodeInfo(…, { notify: false })` so a controlled selection never echoes back, and
  re-selecting the node already shown never fires. `GenreTreeOutline` applies the same rules to
  its store's `selectedId`. The panel's top offset is the `--gtv-info-panel-top` CSS variable
  (default `12px`). Rendered by
  `InfoPanel.tsx`, a dumb `{ node, side, onClose }` component mounted as a sibling after the
  pan/zoom-transformed content so it never scales or pans with the tree. Its Ancestors and Family
  sections each wrap `InfoPanelSection.tsx`, which owns the section's chevron collapse toggle.
  `GenreTreeProps.renderInfoPanelBody`
  (an optional `(node, sections) => { primary, aside? }`, threaded through all six renderers to
  `InfoPanel`) composes the panel body: `InfoPanel` builds its sections from tree data (`toolbar`,
  `ancestors`, `family` — preceded in edit mode by the parents editor — and `itemCount`, each `null`
  when empty) and the consumer places them among its own content (e.g. a consumer-fetched detail like
  essential tracks), so the order is the same in every panel mode and the library stays agnostic of
  what it renders, mirroring `additionalActions`. Omitted, the body is the four sections in one column.
  `InfoPanel` keeps the frame: `.gtv-info-panel-primary` precedes `.gtv-info-panel-aside` in the DOM
  (the compact stack), the expanded grid puts the aside left via `grid-template-areas`, a missing aside
  makes it single-column (`--expanded-solo`), and the edit-mode danger zone ends the left column when
  expanded and follows the body when compact.
  `GenreTreeProps.overlayPanel` (`{ title, content, onClose }`, threaded through all six renderers) mounts
  `OverlayPanel.tsx` with the expanded info panel's CSS classes, so a consumer panel (e.g. About) covers the
  identical area; it renders independent of node selection, and Escape / its ✕ fire `onClose`. Setting
  `onExpandedChange` (with `expanded`, `extraContent`, `collapsed`, `hideExpandButton`, same semantics as the
  info panel's) makes it an info-panel peer instead: compact in the info panel's left slot, expanding to the
  expanded info panel's area, Escape collapsing it before closing. The expand toggle is the shared
  `InfoPanelExpandButton.tsx`.
  A host with left / center / right columns sets `--gtv-center-left`, `--gtv-center-right` and `--gtv-center-top`
  (lengths with a unit, default `12px` / `12px` / the panel top): the overlay fills the center column and an
  expanded info panel spans the left and center columns. A host that floats its own control over the panels'
  top edge (e.g. a search bar) sets `--gtv-info-panel-header-inset` (default `0px`) to that control's height plus
  its margins: every panel header's fill extends behind the control and its content starts below it, and
  `GenreTreeOutline`'s list is pushed down by the same amount.
- **Hover**: `GenreTreeProps.onNodeHover` fires when the pointer enters a node (and, in
  `GenreTreeOutline`, when a row's name receives focus) so a consumer can prefetch what it loads
  on click. `GenreTreeOutline` and `GenreTreeWheelRadialPopCore` (D3 nodes via
  `renderPopSubtree` and ring chips) fire it; the other renderers accept and ignore it.
- **Wheel/touch capture**: `GenreTreeProps.wheelZoom` (`"always"` default | `"modifier"`) is passed
  to `usePanZoom`. In `"always"` mode any wheel over the viewport zooms at the cursor (drag pans).
  In `"modifier"` mode (for trees stacked in a scrolling page): a vertical-dominant
  wheel without Ctrl/Meta is left un-`preventDefault`ed so the page scrolls, while a
  horizontal-dominant one pans X (and is `preventDefault`ed, blocking macOS swipe-back);
  `usePanZoom` returns `touchAction: "pan-y"` (else `"none"`), which each interactive renderer
  applies to its viewport; a lone touch pointer never pans the tree (mouse/pen drag still does)
  but stays tracked as a potential pinch half; and a non-passive `touchmove` listener
  `preventDefault`s whenever two or more fingers are down, so the browser can't claim a
  vertically-drifting pinch as page scroll (cooperative gestures, like Google Maps).
  `GenreTreeOutline` has no pan/zoom viewport and omits the prop.
- **Floating controls layout**: `GenreTreeProps.controlsOrientation` (`"vertical"` default |
  `"horizontal"`) adds `gtv-wheel-floating-controls--horizontal` to each interactive renderer's
  zoom/pop/fit controls, laying them out in a row. `GenreTreeOutline` omits the prop.

## Public surface

`index.ts` is the sole export boundary:

- Components: `GenreTree`, `GenreTreeWheel`, `GenreTreeWheelRight`, `GenreTreeWheelRadial`,
  `GenreTreeWheelRadialPopCore`, `GenreTreeOutline`.
- Helpers: `getGenreTreeColor`, `DEFAULT_FRAME_WIDTH`, `DEFAULT_FRAME_HEIGHT`,
  `groupNodesByRoot`, `isZoomableNode`.
- Types: `GenreTreeNode`, `GenreTreeProps`, `GenreTreePlayState`, `TreeOrientation`,
  `GenreTreeAction`, `GenreTreeWheelProps`, `GenreTreeWheelRightProps`,
  `GenreTreeWheelRadialProps`, `GenreTreeWheelRadialPopCoreProps`, `FocusChangeReason`, `GenreTreeOutlineProps`, `GenreTreeRootGroup`,
  `WheelZoomMode`, `ControlsOrientation`, `GenreTreeOverlayPanel`.

Anything not re-exported here is a private implementation detail — treat new internals as private
unless a consumer need is established.

## Extraction context

This package was extracted from `grow-the-music-tree-frontend` so any BehindTheMusicTree app can
render the tree without depending on that app's contexts, data hooks, or domain types. Keep this
package free of app-specific data-fetching, routing, or domain assumptions — everything
consumer-specific goes through props/callbacks.
