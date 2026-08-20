# Changelog

All notable changes to `@behindthemusictree/genre-tree-view` are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
  unclipped grayscale "shadow" preview instead of no tree at all, so the ring hints at every
  root's shape, not just the 4 developed ones. Hovering a filler's preview brightens it to full
  color and greys out the 4 cardinal trees so it reads as the current focus. Backed by a new
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
  `GenreTreeWheelRadial`, now carry the same subtle root-color background tint as tree nodes
  instead of staying plain white — previously only the selected/cardinal chips read as tied to a
  root color.
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

- `GenreTreeWheel` and `GenreTreeWheelRight` now reserve the selected root's tree-anchor clearance
  from that root's own local subtree size instead of the cross-root chip scale — previously, for
  any selected root that wasn't the wheel's single largest, this under-reserved space and drew the
  tree's branch links into the root chip instead of stopping at its edge.
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
