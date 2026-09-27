import { GenreTreeNode } from "./types";

export interface TreeIndex {
  byId: ReadonlyMap<string, GenreTreeNode>;
  /** Direct children per parent id, in `nodes` order. */
  childrenByParentId: ReadonlyMap<string, readonly GenreTreeNode[]>;
  /** Each node's top-level ancestor id (a node with `parentId === null`), or `null` when its
   * `parentId` chain terminates on an id absent from `nodes` (dangling reference). */
  rootIdById: ReadonlyMap<string, string | null>;
  /** `id`'s ancestors, root-first, excluding `id` itself — stops at a dangling `parentId`. Empty
   * for a root or an unknown id. */
  ancestorsOf: (id: string) => GenreTreeNode[];
}

/** One O(n) pass over `nodes` building every lookup the renderers need, so per-node queries
 * (root id, children, ancestors, by-id) stay O(1)/O(depth) instead of rescanning `nodes`. */
export function buildTreeIndex(nodes: readonly GenreTreeNode[]): TreeIndex {
  const byId = new Map(nodes.map((node) => [node.id, node]));

  const childrenByParentId = new Map<string, GenreTreeNode[]>();
  for (const node of nodes) {
    if (node.parentId === null) continue;
    const siblings = childrenByParentId.get(node.parentId);
    if (siblings) siblings.push(node);
    else childrenByParentId.set(node.parentId, [node]);
  }

  const rootIdById = new Map<string, string | null>();
  const rootIdOf = (id: string): string | null => {
    if (rootIdById.has(id)) return rootIdById.get(id)!;
    const node = byId.get(id);
    if (!node) return null;
    const rootId = node.parentId === null ? node.id : rootIdOf(node.parentId);
    rootIdById.set(id, rootId);
    return rootId;
  };
  for (const node of nodes) rootIdOf(node.id);

  const ancestorsOf = (id: string): GenreTreeNode[] => {
    const ancestors: GenreTreeNode[] = [];
    let parentId = byId.get(id)?.parentId ?? null;
    while (parentId !== null) {
      const parent = byId.get(parentId);
      if (!parent) break;
      ancestors.push(parent);
      parentId = parent.parentId;
    }
    return ancestors.reverse();
  };

  return { byId, childrenByParentId, rootIdById, ancestorsOf };
}
