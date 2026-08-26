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
 * Splits one root group's nodes into its core and pop branches, per the root's direct children's
 * `side` field ("pop" for the optional branch; unset/"core" for the required one).
 *
 * A root must have at most one direct child not flagged `side: "pop"` — that child (if any) is
 * "the" core child. A root with only one direct child (no pop side) yields an empty `popNodes`. A
 * root with zero direct children yields both `coreNodes` (just the root) and `popNodes` empty.
 *
 * Fails fast: if a root has more than one direct child that isn't the pop child, there is no
 * single unambiguous core branch to render, so this throws rather than silently picking one and
 * dropping the rest. Callers should let this propagate (per this component's established
 * fail-fast convention for malformed `nodes` input, e.g. the "Mainstream Pop" root check in
 * `GenreTreeWheelRadialPopCoreBase.tsx`) rather than catching it to recover a partial render.
 */
export function splitRootGroupBySide(group: GenreTreeRootGroup): PopCoreSplit {
  const { root, nodes } = group;
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const directChildren = nodes.filter((node) => node.parentId === root.id);

  const popChild = directChildren.find((node) => node.side === "pop");
  const coreCandidates = directChildren.filter((node) => node.id !== popChild?.id);
  if (coreCandidates.length > 1) {
    throw new Error(
      `splitRootGroupBySide: root "${root.name}" (${root.id}) has ${coreCandidates.length} ` +
        `non-pop direct children, expected at most 1: ${coreCandidates
          .map((node) => `"${node.name}" (${node.id})`)
          .join(", ")}`,
    );
  }
  const coreChild = coreCandidates[0];

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
