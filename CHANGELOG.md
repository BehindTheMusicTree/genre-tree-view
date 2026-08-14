# Changelog

All notable changes to `@behindthemusictree/genre-tree-view` are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- `centerLabel` prop on `GenreTreeWheel` — an optional label (e.g. a brand name) centered on
  the wheel's pivot point, staying upright and fixed regardless of the wheel's rotation.

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
