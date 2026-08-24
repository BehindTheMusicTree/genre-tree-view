# genre-tree-view

[![npm version](https://img.shields.io/github/package-json/v/BehindTheMusicTree/genre-tree-view?filename=packages%2Fgenre-tree-view%2Fpackage.json&label=version)](https://github.com/BehindTheMusicTree/genre-tree-view/pkgs/npm/genre-tree-view)

`@behindthemusictree/genre-tree-view` — a reusable, presentational D3-based tree visualization
component for React. Extracted from `grow-the-music-tree-frontend` so any BehindTheMusicTree app
can render an interactive genre/hierarchy tree without depending on that app's contexts, data
hooks, or domain types.

## Package

See [`packages/genre-tree-view`](packages/genre-tree-view). Published to GitHub Packages as
`@behindthemusictree/genre-tree-view` (ISC license).

```tsx
import { GenreTree, type GenreTreeNode } from "@behindthemusictree/genre-tree-view";
import "@behindthemusictree/genre-tree-view/styles.css";

const nodes: GenreTreeNode[] = [
  { id: "root", parentId: null, name: "Rock", itemCount: 0, actionable: false },
  { id: "punk", parentId: "root", name: "Punk", itemCount: 5 },
];

<GenreTree nodes={nodes} onPlayPause={(id) => play(id)} />;
```

The component is purely presentational: it takes a flat `GenreTreeNode[]` and callback props
(`onPlayPause`, `onAddChild`, `onRenameRequest`, `onDeleteRequest`, `onReparentRequest`,
`onReparent`, plus `additionalActions` for any extra per-node actions). All data fetching,
mutations, and popups/dialogs are the consumer's responsibility.

### Components

Four components are exported, all built on the same tree-building/layout pipeline:

- **`GenreTree`** — one connected hierarchy as an interactive, pannable/zoomable D3/SVG tree.
- **`GenreTreeWheel`** — distributes all root genres around a wheel hugging the bottom of its
  container; clicking a chip swaps in that root's subtree growing upward from the top-center.
- **`GenreTreeWheelRight`** — same idea, hugging the left edge; clicking a chip swaps in that
  root's subtree growing rightward from the right-center.
- **`GenreTreeWheelRadial`** — all root genres around a full circle, with up to 4 roots developed
  as full subtrees simultaneously (one per cardinal direction); clicking a chip re-lays-out the
  ring so that root lands on the right.

```tsx
import { GenreTreeWheel, type GenreTreeNode } from "@behindthemusictree/genre-tree-view";
import "@behindthemusictree/genre-tree-view/styles.css";

<GenreTreeWheel nodes={nodes} onRootSelect={(rootId) => console.log(rootId)} />;
```

## Development

```bash
pnpm install
pnpm dev     # builds the package in watch mode + runs apps/playground
```

`apps/playground` is a small Vite app for manually exercising the component against mock data —
not published.

## Contributing

Branching model, PR flow, and coverage requirements are documented in
[`CONTRIBUTING.md`](CONTRIBUTING.md). See [`ARCHITECTURE.md`](ARCHITECTURE.md) for how the
package is put together.

## Release

```bash
pnpm release -- patch   # or minor / major
```

Run from a `release/x.y.z` branch — see [`CONTRIBUTING.md`](CONTRIBUTING.md) for the full release
flow.
