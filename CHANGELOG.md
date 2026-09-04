# Changelog

All notable changes to `@behindthemusictree/genre-tree-view` are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- `showToolbar` prop on `GenreTreeProps` (default `true`). When `false`, suppresses the hover
  toolbar (play/pause, add-child, overflow menu) and its hover name-label on every node, and
  the wheel renderers' root/center chips' own inner toolbar and hover name-label — the chips
  themselves (name label, click-to-select/expand) stay visible.
- `allowWheelRotation` prop on `GenreTreeWheel`/`GenreTreeWheelRight`/`GenreTreeWheelRadialPopCore`
  (default `true`). When `false`, clicking a chip still fires `onRootSelect` (and, on
  `GenreTreeWheel`/`GenreTreeWheelRight`, still swaps in the selected subtree), but the wheel
  itself stays at its current rotation instead of spinning the selected chip to the anchor.

### Fixed

- Wheel-chip toolbar icons now scale with the node's computed font size instead of staying a
  fixed pixel size, matching the label's scaling behavior.
- Wheel-chip toolbar font-size no longer shrinks below the prior fixed size on small nodes, so
  toolbar buttons keep a usable hit target.
- The toolbar's overflow ("More actions") button now exposes its open/closed state via
  `aria-expanded` and `aria-haspopup` for assistive tech.
- Click-drag and plain wheel-panning are now clamped so the tree can no longer be panned
  completely out of view with no visible edge left to drag back from.

## [1.2.0] - 2026-09-03

### Added

- `GenreTreeSkeleton`, `GenreTreeWheelSkeleton`, and `GenreTreeViewSkeleton` (plus the
  `GenreTreeViewMode`-driven `GenreTreeViewSkeletonProps`), moved here from `app-kit` so any
  consumer of `genre-tree-view` can render a matching loading fallback without depending on
  `app-kit`.

### Fixed

- `GenreTreeWheelRadialPopCore`'s pop-tint sectors now render light label and toolbar-icon text,
  matching solid-colored core sectors, instead of the dark text that undercut contrast against their
  tinted background. The "Mainstream Pop" center subtree keeps its dark text.

## [1.1.2] - 2026-09-01

### Fixed

- `GenreTreeWheelRadialPopCore` pop subtrees are now glued a fixed distance inside the ring roots'
  own circle regardless of the branch's height, instead of anchoring outward from the mainstream
  circle (which only let the single tallest developed branch reach the ring roots' circle, leaving
  shallower branches visually pulled toward the center). The gap that now adapts to available space
  is the one between a branch's deepest node and the mainstream circle, not the branch's own depth
  positioning.
- Node hover labels and toolbar icons now use the same color as the node's main label instead of
  a hardcoded color.
- Toolbar icon/button size now scales with the node's computed label font-size (at a moderate
  ratio) instead of a fixed pixel size, so nodes with larger labels get a proportionally larger
  toolbar. Also fixes a CSS gap where toolbar buttons didn't inherit `font-size` from their
  container.
- `.gtv-wheel` (the rotated wheel layer of sector washes/dividers/chips) no longer intercepts
  pointer events itself, so it can't block clicks/hover on the node svg it's stacked with;
  `.gtv-wheel-chip-anchor` re-enables pointer events for the chips it contains.
- Toolbar button hover state now uses a translucent overlay instead of a hardcoded light gray
  background, so white icon color (used on selected wheel chips and other colored fills) stays
  legible on hover instead of nearly disappearing against the light background.

## [1.1.1] - 2026-08-31

### Added

- Run validation workflow on pull requests targeting `main` and `develop`.

### Fixed

- `GenreTreeWheelRadial` and `GenreTreeWheelRadialPopCore` now size each root's angular sector
  (dividers, colored wash, wedge cap) proportionally to that root's own node count, instead of
  bisecting its immediate ring neighbors' angles — a root with a much smaller weight than its
  neighbors used to get a sector far wider than its actual share (e.g. ~25° instead of ~5.7° for a
  weight-3 root sandwiched between weight-25 and weight-21 neighbors).
- `GenreTreeWheelRadialPopCore`'s "fit to frame" no longer crops the popped tree: it now measures
  the actually-rendered `.gtv-node-rect`/`.gtv-link` content instead of the pop layer's own `<svg>`
  box, which only covered the reserved wheel-circle radius and undersized the fit for content drawn
  further out via `overflow: visible`.
- `GenreTreeWheelRadial` and `GenreTreeWheelRadialPopCore`'s connecting links now curve along the
  wheel's own rings instead of cutting straight chords across it.
- `GenreTreeWheelRadialPopCore`'s outer circle now nests the mainstream subtree correctly, sizes
  pop-branch depth spacing off the deepest pop branch and the mainstream gap, and adapts to pop
  reach instead of stretching depth spacing — closing gaps and overlaps between the pop branches
  and the center mainstream circle.
- `GenreTreeWheelRadialPopCore`'s svg canvas now grows independently of the visual outer circle to
  fit a deep core branch: previously, `coreRootCircleRadius` doubled as both the visual outer
  circle's radius and the svg canvas's own size, so a deep core branch needing extra canvas room
  to avoid being clipped also dragged the visual circle and every ring root chip outward with it,
  reopening a gap on the pop side.

### Documentation

- Reworked `CLAUDE.md` to provide clearer Claude Code guidance and document the package's extraction context.
- Restructured `CONTRIBUTING.md` headings and removed the redundant manual table of contents.

## [1.1.0] - 2026-08-29

### Fixed

- `GenreTree`'s "fit to frame" no longer clips content for a tree larger than its (explicitly
  sized) ancestor: the pan/zoom viewport div no longer floors its own `minWidth`/`minHeight` at
  the tree's unscaled size, which used to grow it past a smaller ancestor and make fit-to-frame
  measure the wrong (inflated) viewport.
- Manual zoom-out (wheel/pinch/button) can now always reach at least as far out as "fit to frame"
  computes for the current content, instead of bottoming out at the static `ZOOM_MIN_SCALE` floor
  while "fit to frame" jumps straight past it for large trees.
- `GenreTreeWheelRadial` and `GenreTreeWheelRadialPopCore` now confine each root's core/pop wedge
  to that root's actual bisected angular sector (capped at 80°) instead of always using the full
  80° span, preventing a developed subtree from overflowing into a neighboring root's sector when
  more than four or five roots share a ring.
- `GenreTreeWheelRadial` no longer crashes with a `d3.stratify()` "multiple roots" error (and
  renders blank) when a root has both core-side and pop-side children — it now splits the two
  sides before building the core hierarchy, matching `GenreTreeWheelRadialPopCore`.

### Changed

- `GenreTreeWheelRadialPopCore` now marks its pop/core boundary with a single circle
  (`.gtv-wheel-circle`) instead of two; the region inside it is lightened with a white overlay
  (`--gtv-wheel-inner-tint-ratio`, default `0.55`) to distinguish it from the core region outside.

- `GenreTreeWheelRadial` and `GenreTreeWheelRadialPopCore` now lay out each cardinal's outward
  "core" branch with a polar layout (`core-radial-layout.ts`) confined to an 80° wedge, rendered
  with straight-line links via the same node/link primitives as the in-circle pop branch, instead
  of mounting a cartesian `<GenreTree>` subtree. The wheel's circle radius now grows to fit
  whichever developed branch (core or pop) reaches deepest.

### Added

- All four wheel renderers (`GenreTreeWheel`, `GenreTreeWheelRight`, `GenreTreeWheelRadial`,
  `GenreTreeWheelRadialPopCore`) now draw a thin radial divider line at the bisector between every
  pair of angularly-adjacent roots, and tint the angular sector behind each root's own chip with
  that root's genre color (15% opacity) — both extending to the container's edge.
- Every node of a wheel subtree (not just its hidden root) now renders filled with that root's own
  genre color and bold white label text, reading as a continuation of the root chip instead of a
  visual gap into plain cards. In `GenreTreeWheelRadialPopCore`, this applies to the "core" branch
  only — the in-circle "pop" branch keeps its plain styling.

## [1.0.4] - 2026-08-27

### Fixed

- `GenreTree`'s initial "fit to screen" no longer produces a negative zoom scale when the
  viewport's laid-out size collapses below `ZOOM_FIT_PADDING * 2` (the tree content div is
  `position: absolute` and doesn't contribute to its parent's layout size). The viewport now has
  an intrinsic `minWidth`/`minHeight` floor matching the tree's own size, and `fitToFrame` no-ops
  instead of mirroring content out of view when the viewport is still too small to fit into.

## [1.0.3] - 2026-08-26

### Fixed

- `splitRootGroupBySide` now throws when a root has more than one non-`"pop"` direct child instead
  of silently picking the first one and dropping the rest from rendering.

## [1.0.2] - 2026-08-26

### Fixed

- `calculateSvgDimensions` no longer clips a single root or a childless straight chain: when every
  node shares the same breadth coordinate, `svgHeight` now floors at a full node's height plus
  toolbar clearance instead of collapsing to just the toolbar clearance.

## [1.0.1] - 2026-08-26

### Added

- `side?: "core" | "pop"` on `GenreTreeNode` — marks one of a root's two direct children as its
  optional "pop" branch (the other, unmarked or explicitly `"core"`, is required).
- `GenreTreeWheelRadialPopCore`, a fifth tree renderer: `GenreTreeWheelRadial` for forests using
  the new `side` field. Each developed cardinal's outward subtree renders only its core branch;
  if that root also has a pop branch, that subtree renders as a full interactive tree fanned out
  inside the wheel's own circle instead of being hidden — the pop child sits at the outer ring next
  to its cardinal root chip, and each generation below it steps inward toward the wheel's center.
  The circle grows as needed to fit the largest developed pop subtree. Unlike the other three wheel
  renderers, it takes no `centerLabel` prop — its pivot point instead renders the `nodes` root named
  exactly `"Mainstream Pop"` (which must exist, or the component throws) as a full interactive
  chip, styled the same as the ring's own root chips, and that root (plus its own descendants, if
  any) is excluded from the ring's own chips. The center node's own subtree, if it has one, is
  hidden by default and toggles open/closed via a dedicated floating button: expanded, it spreads
  full-circle around the center chip (deeper generations radiating further out), and the wheel's
  own edge grows to keep clear of it.
- A "Fit to frame" pass now runs automatically on the first render of `GenreTree`, `GenreTreeWheel`,
  `GenreTreeWheelRight`, `GenreTreeWheelRadial`, and `GenreTreeWheelRadialPopCore` — once, before
  any user interaction — instead of starting every tree at scale 1 / pan (0, 0) regardless of size.

### Changed

- `MAX_NODE_WIDTH`/`MAX_NODE_HEIGHT` doubled (350→700 / 60→120) and `WHEEL_POP_CORE_RADIUS`
  grown (420→945) so `GenreTreeWheelRadialPopCore`'s wheel and node cards read at a larger scale.
- Node label font size is now derived directly from each node's own rendered box height (a ratio
  that grows with the node's log-scaled item-count position, from 0.3x at the smallest to 0.5x at
  the largest) instead of a separate, disconnected min/max font range — keeps labels proportional
  to their node regardless of how node sizing itself is tuned.

### Fixed

- `GenreTreeWheelRadial`: a filler (non-selected) root chip's decorative mini-tree preview no
  longer paints over its own chip label — `.gtv-wheel-chip-anchor` now stays above its
  `.gtv-wheel-radial-mini-tree` sibling regardless of DOM order.
- `GenreTreeWheelRadialPopCore`: a pop subtree now grows outward from its cardinal root toward the
  wheel's center instead of the reverse; the center "Pop" root node is now centered on the wheel's
  pivot and styled to match the ring's own chips; node labels render with `line-height: 1` so
  large font sizes stay vertically centered instead of skewed by the browser's default line-height.
- `GenreTreeWheelRadialPopCore`: `.gtv-wheel-pop-outer-circle` now matches `.gtv-wheel-circle`'s
  border treatment instead of a distinguishable dashed style, and a new `.gtv-wheel-middle-circle`
  marks the "Mainstream Pop" center subtree's own boundary — the annulus between the two is tinted
  relative to the surrounding background via `--gtv-wheel-annulus-tint-ratio`. The center
  "Mainstream Pop" chip and its expanded subtree now render with a white fill (previously the
  hashed root color), with dark label text and a thicker border for legibility.
- Zoom-out floor (`ZOOM_MIN_SCALE` 0.25→0.05) lowered to match the smaller "fit to frame" scale
  that large trees now need after the node-size increase above — the zoom-out button no longer
  greys out before the whole tree is visible.

## [1.0.0] - 2026-08-22

### Changed

- **Breaking:** removed `onUploadFiles` from `GenreTreeProps` (and the hardcoded upload button/
  hidden file input it powered) in favor of a generic `additionalActions` prop:
  `additionalActions?: (node: GenreTreeNode) => GenreTreeAction[]`. Each `GenreTreeAction` supplies
  its own `icon`, `label`, `onClick`, optional `enabled`/`danger`, and a `placement` of `"primary"`
  (inline icon-row button — upload's old slot) or `"overflow"` (kebab-menu row, the default).
  Consumers that need file selection should build their own `<input type="file">` inside the
  action's `onClick` closure, which already has the right node bound.

### Added

- `GenreTreeWheelRight`, a third tree renderer alongside `GenreTree` and `GenreTreeWheel`: a
  mechanical mirror of `GenreTreeWheel` rotated 90° — its chip ring hugs the left edge instead of
  the bottom, clicking a chip spins it to land right-center, and the selected subtree grows
  rightward instead of upward. Shares the same props and pan/zoom/rotation behavior as
  `GenreTreeWheel`.
- `centerLabel` prop on `GenreTreeWheel` — an optional label (e.g. a brand name) centered on
  the wheel's pivot point, staying upright and fixed regardless of the wheel's rotation.
- A "Fit to frame" button next to the zoom in/out controls on `GenreTree`, `GenreTreeWheel`, and
  `GenreTreeWheelRight` — recenters and rescales the shared pan/zoom transform so all currently
  rendered content fits inside the viewport with some padding.
- `GenreTreeWheelRadial`, a fourth tree renderer: a full-circle wheel centered in its container
  where up to 4 root genres are developed (their full subtree rendered) at once, one per cardinal
  direction, instead of just one. Clicking any chip — developed or not — re-lays-out the whole
  ring so that root lands on the right and recalculates the other 3 cardinals; the 3 non-clicked
  developed trees render dimmed until hovered or focused. Shares the same props, callbacks, and
  pan/zoom/fit-to-frame controls as the other wheel variants.
- A name label attached to the top of a node's card or a wheel root chip while hovered — since
  the hover toolbar overlay now masks the card/chip's own label underneath, the label keeps the
  hovered node identifiable across `GenreTree` and all wheel variants.
- `GenreTreeWheelRadial`'s non-cardinal (filler) roots now render their full subtree as a dim,
  unclipped "shadow" preview instead of no tree at all, so the ring hints at every root's shape,
  not just the 4 developed ones, in that root's own color. Hovering a filler's preview raises its
  opacity to read as the current focus, and greys out the 4 cardinal trees. Backed by a new
  `depthSpacingScale` prop on `GenreTree` (default `1`, no behavior change for existing callers)
  that widens the gap between depth levels, used here to keep the shrunk previews' nested nodes
  legible.

### Changed

- Node width, height, and label font size now scale proportionally to each node's item count,
  relative to the min/max item count across the currently-rendered set, instead of a fixed size.
  Layout slot constants (the tree's per-node spacing) are rebased on the new maximum node size so
  large nodes no longer overlap their neighbors.
- That item-count-based sizing now scales logarithmically instead of linearly, so it stays legible
  across the wide item-count ranges real track counts span (tens to tens of thousands) — a linear
  scale would flatten nearly every node down near the minimum size and let only the largest few
  stand out.
- Depth-axis spacing (the gap between successive generations) reduced 20% for both `GenreTree`
  orientations, so trees read more compactly without changing sibling/breadth spacing.
- Replaced each node's small root-color accent dot with a subtle tint of that color across the
  whole node background, so a subtree's root color reads at a glance across the tree instead of
  needing a close look at each node's corner.
- Unselected root chips in `GenreTreeWheel`/`GenreTreeWheelRight`, and non-cardinal root chips in
  `GenreTreeWheelRadial`, now render the same solid root color as their selected/cardinal
  counterpart instead of staying plain white — so a root's color reads identically everywhere it
  appears, whether selected or not.
- **Breaking:** `WHEEL_DEFAULT_FRAME_HEIGHT` renamed to `DEFAULT_FRAME_HEIGHT` (600 → 750) and
  joined by a new `DEFAULT_FRAME_WIDTH` (1200) — the suggested size no longer names `GenreTreeWheel`
  specifically, since it's a sensible fixed-size ancestor for any `GenreTree`/`GenreTreeWheel`
  variant, not just the wheel.
- A node's action toolbar now overlays the card/chip itself on hover, masking its label with the
  card's own fill via a shared `--gtv-node-fill` CSS variable, instead of floating beside it —
  keeping the tree's layout footprint the same whether or not a toolbar is showing.
- The hover name label's font size now matches its card's/chip's own item-count-scaled size
  instead of a fixed size, and the card's/chip's top corners square off while the label is
  attached so the two read as one continuous rounded shape instead of a seam between two stacked
  rounded rectangles.
- The card's/chip's own top border also disappears while its hover label is attached, so the two
  merge into one shape with no line at the seam.
- A selected wheel chip's hover label now borders itself in the chip's own accent color instead
  of a fixed gray, so the label blends into the chip's solid fill the same way the chip's own
  border already does — previously the gray border stood out as a visible seam against the
  chip's saturated color.
- A selected wheel chip's hover toolbar icons are now white to match its label text, instead of
  staying the fixed gray used elsewhere — previously the gray icons had low contrast against the
  chip's solid accent fill.

### Fixed

- `GenreTreeWheel`, `GenreTreeWheelRight`, and `GenreTreeWheelRadial` now reserve the selected/
  cardinal root's tree-anchor clearance as the sum of that root's own local subtree half-extent and
  its cross-root chip display half-extent, via a new shared `calculateRootAnchorClearance` helper —
  previously each wheel variant computed this independently and used only one of the two half-extents,
  so the tree's branch links always converged on the root chip's own center instead of stopping at
  its edge, for every selection in every wheel variant.
- A node's item count (and everything sized from it — box dimensions, label font size, wheel
  chip size) now rolls up its descendants' counts instead of reporting only its own, so a node's
  effective count is always at least the sum of its children's. Previously a genre with items only
  on its leaves could render smaller than a sibling leaf, or a wheel root chip could read as empty
  despite a full subtree beneath it.
- `GenreTreeWheel` now grows its wheel radius to fit the largest possible chip when there are
  enough roots that a fixed radius would crowd their anchor points together — previously, with
  many roots and/or item counts large enough to push chips toward `MAX_NODE_WIDTH`, neighboring
  chips (and their labels) could overlap.
- "Fit to frame" (on `GenreTree`, `GenreTreeWheel`, `GenreTreeWheelRight`, and
  `GenreTreeWheelRadial`) now measures only the rendered cards/links instead of the whole SVG's
  declared bounds, which baked in space reserved for hover toolbars/menus — previously this left
  large, asymmetric gaps around the tree and an off-center result. The computed scale is also
  capped at 1 so fitting never zooms in past a tree's natural size, which could otherwise inflate
  that reserved toolbar/menu space past its padding and clip it against the viewport.
- `GenreTreeWheelRadial` chips now transition to their new angle along their own shortest path —
  previously a chip landing on a cardinal's raw `[0, 360)`-wrapped angle (e.g. back to 0deg at the
  top) always animated counterclockwise, even when the ring conceptually rotated clockwise, since
  the browser interpolates the literal `rotate()` value with no wraparound awareness.
- Wheel root chips (`GenreTreeWheel` and `GenreTreeWheelRadial`) now show the same play/upload/add
  sub-genre/rename/reparent/delete toolbar on hover that a node's SVG card would — previously the
  root's toolbar disappeared entirely once its card was replaced by a chip.
- A tree node's card no longer loses its elevation shadow while hovered. The hover brightness
  effect on the node's group was clipping the card rect's own `feDropShadow`, since a plain CSS
  `brightness()` filter on an ancestor computes a tight filter region from that ancestor's own
  geometry and rasterizes its subtree into it, cropping away a descendant's separately-declared
  wider filter region. Fixed by giving the hover effect its own SVG filter with the same generous
  region as the shadow's.
- A wheel root chip's shadow now visually matches a tree node card's own shadow instead of
  rendering noticeably tighter/harder. CSS `box-shadow`'s blur radius maps to half that value as
  the equivalent SVG Gaussian `stdDeviation`, so the chip's `2px` blur was only as soft as an
  `stdDeviation` of `1` — half as soft as the card's `feDropShadow`, which uses `stdDeviation: 2`.
  Fixed by doubling the chip's blur radius to `4px` to match.
- A wheel chip's hover name label no longer shows a visible seam against the chip below it.
  Rather than stacking the label as a second, separately-composited box next to the chip (which
  always leaves an anti-aliased boundary between the two layers, however closely they're
  aligned), the chip's own box now grows upward on hover to make room for the label — a single
  continuously-painted shape with one shadow and no boundary to seam. The chip's rendered height
  is driven by a CSS custom property so it stays an explicit, determinate value in both states
  (required for the growth to work, and for the label/accent-dot children's own sizing/position
  to resolve correctly against it); the accent dot's position is pinned to a fixed offset from
  the chip's bottom edge rather than a percentage from center, since only the top edge moves when
  the chip grows.
- Both a tree node card's shadow and a wheel chip's shadow now fall evenly on all sides instead of
  reading noticeably stronger along the bottom edge and barely visible along the top. Both had a
  1px downward offset (the card's `feDropShadow` `dy`, the chip's `box-shadow` y-offset) that was
  more visible now that a hovered chip is taller. Fixed by dropping the offset to 0 on both, kept
  in sync since the chip's shadow is designed to match the card's.
- A tree node's hover name label no longer shows a visible seam against the card below it.
  Applying the same `feDropShadow` filter to the card and the label separately wasn't enough —
  `feDropShadow` blurs each filtered element's own silhouette independently, so two adjoining
  shapes that each carry the same filter still each wrap their own real corner at the seam,
  producing a faint kink rather than one smooth edge. Fixed by moving the filter onto a shared
  wrapping `<g>` around both the card and the label, so the browser rasterizes their union
  silhouette once before blurring — the seam has no interior corner left to kink around. (The
  wheel chip's hover label was already immune to this — it's not a separate element, see the
  entry above.)
- A tree node's hover name label still showed a faint hairline seam against the card below it
  even after the shared-filter fix above. The label (an HTML `foreignObject`) and the card (an
  SVG `path`) are rasterized by two independent engines, so butting them exactly edge-to-edge
  leaves each side's own anti-aliasing sampling the boundary separately, however pixel-identical
  their position and fill color are. Fixed by extending the label's `foreignObject` 1px into the
  card's region — same fill color, so invisible — turning the touching boundary into an
  overlapping one with no seam left to sample.
- The overlap fix above only extended the label into the card on the bottom edge, leaving the
  same hairline seam still visible along the label's left and right edges where it also touches
  the card. Extended the 1px overlap to all three touching sides. Also reduced the shared
  `feDropShadow`'s `stdDeviation` from `2` to `1`, tightening the card/label union's shadow now
  that the union silhouette itself is 1px larger on every side than before.
- Mounting a tree node's hover name label changed the look of the card's own elevation shadow
  while hovered, since the label was appended into the same filtered `<g>` as the card (see the
  shared-filter entry above) and `feDropShadow` re-blurs whatever silhouette that `<g>` currently
  contains. Reverted: the label now mounts as a sibling of the card's filtered group instead of
  inside it, so the card's shadow renders identically whether or not it's hovered. The
  color-match + overlap fix above still hides the seam between the two, independent of the
  shadow.
- A tree node's card shadow still visibly changed on hover after the fix above, from two
  remaining causes unrelated to the label. First, `.gtv-node-rect`/`.gtv-node-border` squared
  off their top corners on hover (see the "square off"/"top border also disappears" entries
  above) so the card's `feDropShadow` re-blurred a different silhouette while hovered. Second,
  the `g.node:hover` brightness filter — even confined to its own generous filter region (see the
  "no longer loses its elevation shadow" entry above) — still rasterized and darkened the card's
  already-shadowed pixels along with everything else in the group, since it wraps the whole node
  rather than excluding the shadow. Fixed by removing both: the card and its border now stay
  fully rounded through hover instead of squaring off, and the hover brightness effect (SVG
  filter and CSS `brightness()` fallback alike, plus the now-unused `HOVER_BRIGHTNESS` constant)
  is removed entirely, so a card's shape and color are pixel-identical whether hovered or not.
- A card's elevation shadow was still reported as visibly changing on hover after all of the
  above fixes, despite the card's own rect path, border path, and shadow filter provably being
  unchanged before/after hover under both DOM-level and real-mouse-driven checks. Rather than
  continue chasing an unreproduced cause, the `ELEVATION` flag in `constants.ts` is temporarily
  set to `false`, disabling the card's `feDropShadow` filter entirely — cards render with no
  elevation shadow for now, on any renderer, hovered or not.
- A wheel root chip still showed a shadow after the `ELEVATION` flag above was disabled, since
  `.gtv-wheel-chip`'s `box-shadow` was a separate, always-on CSS rule rather than driven by that
  flag. Removed the chip's `box-shadow` so it matches the card's shadow-free state.
- The node toolbar's overlay exactly matched the card's own bounds, so it could visually crowd
  the card's border. Inset the toolbar's `foreignObject` 1px on every side (2px smaller in both
  width and height) so the card's border shows fully around it while the toolbar is shown.

## [0.5.0] - 2026-08-14

### Added

- Zoom and pan on `GenreTree` and `GenreTreeWheel`: ctrl+scroll or trackpad pinch zooms in/out
  anchored on the cursor, plain scroll pans, and click-and-drag over empty background pans.
  Visible zoom in/out buttons are included as a fallback for ctrl+scroll/pinch, which some
  trackpad/OS/browser combinations never translate into a `ctrlKey` wheel event at all.
- `WHEEL_DEFAULT_FRAME_HEIGHT`, an exported constant giving consumers a sensible default height
  for the fixed-height ancestor `GenreTreeWheel` requires.

### Changed

- Reworked `GenreTree` and `GenreTreeWheel` to share one pan/zoom viewport instead of
  independently scrolled/scaled DOM subtrees kept in sync by JS (mirrored `scrollLeft`, a
  `ResizeObserver`, and a shared `zoomScale`/`onZoomScaleChange` prop pair). Pan and zoom are now
  a single CSS `transform: translate(...) scale(...)` applied to one stage element, so
  `GenreTreeWheel`'s wheel of chips and its selected root's tree — anchored to the same point in
  that stage — move and scale together with no separate synchronization step. `GenreTree` owns
  this viewport itself by default; passing `interactive={false}` renders just the bare tree so an
  ancestor (like `GenreTreeWheel`'s stage) can supply the transform instead.
- `GenreTree` and `GenreTreeWheel` no longer auto-size to fit their content's height — both now
  require an ancestor with an explicit height (they fill it via `width: 100%; height: 100%`) and
  clip/pan/zoom within it, rather than growing the page to match the tree.

### Removed

- `zoomScale`/`onZoomScaleChange` props on `GenreTree` — zoom is now internal to the shared
  pan/zoom viewport and isn't meant to be driven externally.

## [0.4.0] - 2026-08-13

### Added

- `GenreTreeWheel`, a new component that distributes root genres evenly around a wheel hugging
  the bottom of its container. Clicking a root's chip rotates the wheel so that chip lands at
  the top-center and swaps in its subtree, growing upward from that anchor; only the selected
  root's subtree is ever mounted.
- `orientation` prop on `GenreTree` (`"horizontal" | "vertical"`, default `"horizontal"`) —
  `GenreTreeWheel` uses `"vertical"` internally, but the prop is available directly too.
- `groupNodesByRoot`, a pure helper that groups a flat node list by top-level ancestor.

### Fixed

- The per-node hover toolbar (and its overflow menu) now floats above the card, centered, in
  vertical-orientation trees instead of to its right — the sibling axis in that orientation
  reserves no toolbar headroom, so a right-side toolbar collided with neighboring cards.

## [0.3.0] - 2026-08-05

### Changed

- The toolbar hover actions (inline icon row with overflow kebab) are now the only actions
  affordance. Removed the dark flyout and kebab-menu variants along with the `actionsVariant`
  prop and `GenreTreeActionsVariant` type.

### Fixed

- Fixed the tree's connector line showing through the toolbar's icon row by giving `.gtv-toolbar`
  an opaque background.
- Fixed the toolbar disappearing while its "More actions" overflow menu was still open, when the
  mouse moved from the kebab button toward the menu.
- Fixed the toolbar disappearing when the mouse moved quickly from a node onto its toolbar,
  caused by a spurious mouseleave/mouseenter blip that scheduled a toolbar removal the
  subsequent re-entry didn't cancel.

## [0.2.0] - 2026-08-05

### Added

- Exposed `package.json` via the package's `exports` map so consumers (and the playground) can
  read the installed version at build time.

### Changed

- Redesigned the tree's visual style: rounded white cards with subtle borders and elevation,
  thin gray connectors, and a small per-tree accent dot in place of a fully colored node fill.
  All visual tokens are centralized in `constants.ts`.

## [0.1.0] - 2026-07-31

### Added

- Initial extraction of the D3-based tree visualization out of `grow-the-music-tree-frontend`
  into a standalone, presentational `<GenreTree>` React component: generic `GenreTreeNode` data
  shape, callback-driven actions (play/pause, add child, rename, delete, reparent, upload files),
  no app contexts or data-fetching baked in.
- Precompiled, scoped CSS (`dist/styles.css`) so consumers don't need a matching Tailwind setup.
