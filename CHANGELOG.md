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

### Fixed

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
