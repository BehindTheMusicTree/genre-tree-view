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
  `defaultViewport` / `onViewportChange` expose the pan/zoom as a `GenreTreeViewport` (content-space
  center `x`,`y` + `zoom`, independent of the container's pixel size — `viewToViewport` /
  `viewportToView` in `zoom-pan.ts`). `defaultViewport` is a mount-only seed: the first
  `fitToFrame` in `use-pan-zoom.ts` applies it (zoom clamped to the fitted min scale) instead of
  fitting. `viewportRestore` queues an explicitly revisioned viewport until the target frame's
  content and viewport are measurable. Hosts provide related focus, selection and restoration in
  the same props update, with a new revision per navigation. A successful measurement updates
  bounds and zoom limits, then chooses restoration, pending selection centering, initial frame
  fit, or preservation of the current view. Repeated measurements never refit a handled frame.
  User gestures, node clicks and explicit Fit supersede pending restoration. Automatic selection
  synchronization does not center over the restored selection; a new selection can center normally.
  The mount-only `defaultViewport` seed retains its existing centering guard. Restoration adds no
  timed guard. Resize and restoration do not emit `onViewportChange`.
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
    (`subdivideWedge` in `radial-wheel-geometry.ts`). A core branch's layout is stretched by at most
    `MAX_WEDGE_STRETCH`; the angle left over goes into even gaps between the first branching node's
    children (`layoutWedge`'s `"between-children"` slack), so the subtree reaches both edges of its
    branch's wedge instead of leaving an empty gutter at the sector border. The circle
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
    the **core root circle**, where ring root chips sit — grows only when that subtree's outer radius plus `POP_CORE_NODE_CLEARANCE`
    (17.5% of `MAX_NODE_WIDTH`) and `POP_SUBTREE_OUTER_MARGIN` would overlap the ring roots' chip clearance.
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
  and without Core/Pop sections. Selection, open
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
    `GenreTreeWheelRadialPopCoreBase.tsx` offers "Zoom in" on every zoomable node's info panel (which stays open on the zoomed node),
    the same zoom on a node or chip double-click — or double-tap, which `defer-click.ts` detects itself as a second
    click on the same target within `DOUBLE_CLICK_DELAY_MS`, since touch browsers don't reliably fire `dblclick` — and,
    while focused, the `@behindthemusictree/ui` `Breadcrumb` (placed by `.gtv-wheel-breadcrumb`): one top-centre trail
    (bottom-left in narrow containers) of a Home crumb, every zoomable ancestor view (the middle collapses behind "…" past
    three) and the current view, which opens its info panel. A selection outside the current frame refocuses on its top-level root (the whole tree
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
  - `GenreTreeNode.scene`: `GenreTreeWheelRadialPopCoreBase` draws an `"underground"` node and its descendants in a darker shade (`shadeSurface`, `UNDERGROUND_DARKEN_RATIO`); its zone (`gtv-wheel-scene-sector`, `SCENE_SECTOR_OUTER_RADIUS`) out to the wheel's edge is juxtaposed with, not layered over, the root's sector: `WheelBackdrop` cuts it out of the sector path (evenodd, span bounded by `clampSpanToSector`) and fills it with one color, `getSceneWashFill`; a muted root gives every zone `MUTED_SECTOR_FILL`, so all muted areas share one grey; a parent whose children switch between an underground subtree and a non-underground one is placed on that zone boundary (`sceneBoundaryAnchor`, used by `measureWedge` and `layoutWedge` only for core wedges via `anchorOnSceneBoundaries`; pop hierarchies draw no zones), the edge `computeUndergroundSceneSpans` draws; a root with a single core branch whose top node sits on such a boundary (the first branching node, `hasSceneBoundary`) moves its chip onto that edge (`computeRootChipOffsetDegrees`, clamped only by its sector), and its pop wedge follows that axis only as far as its measured need allows (`computeRootWedgeAxes`), so pop nodes are never crowded.
- **Layout vs. size metric**: radial layouts (wedge measurement, ring radius, root sectors, positions) depend on tree topology only, every node reserving the fixed `NODE_LAYOUT_SLOT_RADIUS`. `itemCount` drives rendering only (dot radius, fonts, border widths, label rank), so switching the size metric never moves nodes.
- **`itemCount` contract**: every node's `itemCount` is a subtree total (itself plus all descendants),
  supplied by the consumer. `buildTreeHierarchyStructure` only stratifies, and every renderer, root chip,
  outline row and the info panel reads `itemCount` as-is — nothing rolls counts up.
- **Node selection and the host-owned detail panel**: the library no longer draws a panel. Each
  top-level renderer owns one `useNodeInfoPanel({ selectedNodeId, onSelectedNodeChange })` instance
  (`use-node-info-panel.ts`; `GenreTreeOutline` keeps the id in its store), so a click, a controlled
  `selectedNodeId` or a cleared one (`null`/`undefined`) drives selection, and `onSelectedNodeChange`
  fires only for user actions — a controlled selection never echoes back. The pop-core wheel drops a
  selection whose node isn't drawn in the current focus frame.
  The detail panel is the single `DetailPanel` shell from `@behindthemusictree/ui`, mounted by the host
  as a sibling of the tree. Two contracts connect them:
  - `obscuredInset` (`{ left?, right?, bottom? }`, px): the area the host's panel covers. `usePanZoom`
    centers a clicked node in the remaining space (`centerOnElement`), the pop-core region label avoids
    it, and `GenreTreeOutline` pads its list by it. Hosts should pass a stable or last-open inset.
  - `onNodeStyleResolverChange`: each renderer publishes once a stable `(node) => { fill, textColor }`
    (`use-expose-node-style.ts`) so the host's panel colors a node exactly like the tree does.
  Content-only pieces for the host's panel live in `GenreNodePanelContent.tsx`:
  `useGenreNodeRelations(nodes, nodeId, resolver)` (node, parent, children, root-first ancestors, each
  styled), `GenreNodeAncestors`, `GenreNodeFamily` (the mini tree) and `GenreNodeItemCount`, built on
  the ui package's `PanelSection` and `FieldList`, which own the section frame and field rows: `styles.css` only styles the tree and its chips, never a generic section. `NodeToolbar` is exported for the actions row.
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
- **Floating controls layout**: the busy indicator, the `floatingControlsLeading` slot and the zoom
  card share one bottom-right row (`.gtv-wheel-floating-controls`); in containers narrower than
  768px they stack in a column, since the breadcrumb takes the bottom-left. There is no
  orientation prop. `GenreTreeProps.showZoomControls` (`"auto"`
  default | `"always"` | `"never"`) shows the zoom buttons everywhere, nowhere, or only off touch
  screens (`gtv-zoom-controls--auto`, hidden under `@media (pointer: coarse)`, where pinch replaces
  them); the `floatingControlsLeading` slot is unaffected. `GenreTreeOutline` omits that prop.

## Public surface

`index.ts` is the sole export boundary:

- Components: `GenreTree`, `GenreTreeWheel`, `GenreTreeWheelRight`, `GenreTreeWheelRadial`,
  `GenreTreeWheelRadialPopCore`, `GenreTreeOutline`, `GenreNodeAncestors`, `GenreNodeFamily`,
  `GenreNodeItemCount`, `NodeToolbar` (content only; the shell is ui's `DetailPanel`; load `styles.css`).
- Helpers: `getGenreTreeColor`, `getTextColorOnFill`, `tintSurface`, `ROOT_TINT_RATIO`, `TEXT_COLOR`, `ACCENT_TEXT_COLOR`, `DEFAULT_FRAME_WIDTH`, `DEFAULT_FRAME_HEIGHT`,
  `groupNodesByRoot`, `isZoomableNode`, `useGenreNodeRelations`.
- Types: `GenreTreeNode`, `GenreTreeProps`, `GenreTreePlayState`, `TreeOrientation`,
  `GenreTreeAction`, `InfoPanelChild`, `GenreNodeRelations`, `GenreNodeStyle`, `GenreNodeStyleResolver`, `ObscuredInset`, `GenreNodeAncestorsProps`, `GenreNodeFamilyProps`, `GenreNodeItemCountProps`, `NodeToolbarProps`, `GenreTreeWheelProps`, `GenreTreeWheelRightProps`,
  `GenreTreeWheelRadialProps`, `GenreTreeWheelRadialPopCoreProps`, `FocusChangeReason`, `GenreTreeOutlineProps`, `GenreTreeRootGroup`,
  `WheelZoomMode`, `ZoomControlsVisibility`.

Anything not re-exported here is a private implementation detail — treat new internals as private
unless a consumer need is established.

## Extraction context

This package was extracted from `grow-the-music-tree-frontend` so any BehindTheMusicTree app can
render the tree without depending on that app's contexts, data hooks, or domain types. Keep this
package free of app-specific data-fetching, routing, or domain assumptions — everything
consumer-specific goes through props/callbacks.
