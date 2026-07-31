# genre-tree-view

`@behindthemusictree/genre-tree-view` — a reusable, presentational D3-based tree visualization
component for React. Extracted from `grow-the-music-tree-frontend` so any BehindTheMusicTree app
can render an interactive genre/hierarchy tree without depending on that app's contexts, data
hooks, or domain types.

## Package

See [`packages/genre-tree-view`](packages/genre-tree-view). Published to GitHub Packages as
`@behindthemusictree/genre-tree-view`.

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
`onReparent`, `onUploadFiles`). All data fetching, mutations, and popups/dialogs are the
consumer's responsibility.

## Development

```bash
pnpm install
pnpm dev     # builds the package in watch mode + runs apps/playground
```

`apps/playground` is a small Vite app for manually exercising the component against mock data —
not published.

## Release

```bash
pnpm release -- patch   # or minor / major
```

Bumps the package version, updates `CHANGELOG.md`, tags, and pushes — which triggers
`.github/workflows/publish.yml` to build and publish to GitHub Packages.
