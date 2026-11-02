# Project guidance

`@behindthemusictree/genre-tree-view` is a reusable, presentational React and D3
hierarchy visualization library. Consumers own data fetching, mutations and
popups; the library exposes callback props for those actions. `app-kit-ui`
consumes it for Grow and Hear.

The pnpm workspace contains the published library in `packages/genre-tree-view`
and a Vite playground in `apps/playground`. The playground's
`wheel-radial-pop-core` example uses a canonical genre-tree fixture synchronized
by the pipelines infrastructure.

Read `ARCHITECTURE.md` for renderers, layout modules and the public API. Read
`CONTRIBUTING.md` for branching, validation and releases. Branch from `develop`
and target it for feature work; do not commit directly to `main` or `develop`.
Releases are published directly to npm by `publish.yml` (trusted publishing).

From the repository root, `pnpm dev` starts the playground and a library watch
build; `pnpm build`, `pnpm typecheck` and `pnpm lint` cover the workspace.
`pnpm test` runs library and playground tests; `pnpm coverage` checks the library
coverage thresholds described in `CONTRIBUTING.md`. CI runs build, typecheck, lint
and coverage. See the package scripts and contributing guide for scoped commands.

When reviewing changes, read `.github/skills/code-review/SKILL.md` for
repository-specific correctness checks. When changing a shared layout or tree
helper, verify each renderer that consumes it; the outline has its own rendering
path. Keep architecture documentation current when behavior or exports change.

Graphify can help navigate the code when installed and `graphify-out/` exists;
do not assume it is available in every agent environment.
