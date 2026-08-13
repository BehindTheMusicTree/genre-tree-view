import { GenreTreeNode } from "./types";

export interface GenreTreeRootGroup {
  root: GenreTreeNode;
  nodes: GenreTreeNode[];
}

/**
 * Groups a flat node list by top-level ancestor (a node with `parentId === null`), walking each
 * node's `parentId` chain up to find which root it belongs to. A node whose chain terminates on a
 * `parentId` absent from `nodes` (dangling reference) belongs to no group.
 */
export function groupNodesByRoot(nodes: GenreTreeNode[]): GenreTreeRootGroup[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const rootIdCache = new Map<string, string | null>();

  const rootIdOf = (nodeId: string): string | null => {
    if (rootIdCache.has(nodeId)) return rootIdCache.get(nodeId)!;
    const node = nodeById.get(nodeId);
    const rootId = !node ? null : node.parentId === null ? node.id : rootIdOf(node.parentId);
    rootIdCache.set(nodeId, rootId);
    return rootId;
  };

  const nodesByRootId = new Map<string, GenreTreeNode[]>();
  for (const node of nodes) {
    const rootId = rootIdOf(node.id);
    if (rootId === null) continue;
    const group = nodesByRootId.get(rootId);
    if (group) group.push(node);
    else nodesByRootId.set(rootId, [node]);
  }

  return nodes
    .filter((node) => node.parentId === null)
    .map((root) => ({ root, nodes: nodesByRootId.get(root.id)! }));
}
