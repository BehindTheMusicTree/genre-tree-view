# Changelog

All notable changes to `@behindthemusictree/genre-tree-view` are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
