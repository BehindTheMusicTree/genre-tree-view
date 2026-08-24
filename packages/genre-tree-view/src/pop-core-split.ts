import { GenreTreeRootGroup } from "./root-grouping";
import { GenreTreeNode } from "./types";

export interface PopCoreSplit {
  /** The root, its core (non-pop) child, and that child's descendants. */
  coreNodes: GenreTreeNode[];
  /** The pop child and its descendants, rooted at the pop child (root not included). Empty
   * when the root has no pop side (e.g. classical). */
  popNodes: GenreTreeNode[];
}

/**
 * Splits one root group's nodes into its core and pop branches, per the root's two direct
 * children's `side` field ("pop" for the optional branch; unset/"core" for the required one).
 * A root with only one child (no pop side) yields an empty `popNodes`.
 */
export function splitRootGroupBySide(group: GenreTreeRootGroup): PopCoreSplit {
  const { root, nodes } = group;
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const directChildren = nodes.filter((node) => node.parentId === root.id);

  const popChild = directChildren.find((node) => node.side === "pop");
  const coreChild = directChildren.find((node) => node.id !== popChild?.id);

  const collectSubtree = (startId: string | undefined): GenreTreeNode[] => {
    if (startId === undefined) return [];
    const childrenByParentId = new Map<string, GenreTreeNode[]>();
    for (const node of nodes) {
      if (node.parentId === null) continue;
      const siblings = childrenByParentId.get(node.parentId);
      if (siblings) siblings.push(node);
      else childrenByParentId.set(node.parentId, [node]);
    }

    const start = nodeById.get(startId);
    if (!start) return [];

    const subtree: GenreTreeNode[] = [];
    const stack = [start];
    while (stack.length > 0) {
      const current = stack.pop()!;
      subtree.push(current);
      stack.push(...(childrenByParentId.get(current.id) ?? []));
    }
    return subtree;
  };

  const coreNodes = [root, ...collectSubtree(coreChild?.id)];
  const popNodes = collectSubtree(popChild?.id);

  return { coreNodes, popNodes };
}
