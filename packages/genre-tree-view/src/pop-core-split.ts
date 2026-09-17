import { GenreTreeRootGroup } from "./root-grouping";
import { GenreTreeNode } from "./types";

export interface PopCoreBranch {
  /** The direct child this branch is rooted at. */
  child: GenreTreeNode;
  /** The child and its descendants. */
  nodes: GenreTreeNode[];
}

export interface PopCoreSplit {
  /** The root plus every core (non-pop) branch's nodes, flattened. */
  coreNodes: GenreTreeNode[];
  /** Every pop branch's nodes, flattened (root not included). Empty when the root has no pop
   * side (e.g. classical). */
  popNodes: GenreTreeNode[];
  /** One entry per direct core (non-pop) child, each paired with its own subtree. Order matches
   * the child's position among the root's direct children. Empty when the root has no core
   * children. */
  coreBranches: PopCoreBranch[];
  /** One entry per direct pop child, mirroring `coreBranches`. Empty when the root has no pop
   * children. */
  popBranches: PopCoreBranch[];
}

/**
 * Splits one root group's nodes into its core and pop branches, per the root's direct children's
 * `side` field ("pop" for the optional branch; unset/"core" for the required one).
 *
 * A root may have any number of core (non-pop) direct children and any number of pop direct
 * children — each becomes its own branch in `coreBranches`/`popBranches`. A root with no pop
 * children yields an empty `popBranches`/`popNodes`. A root with zero direct children yields
 * both `coreBranches` and `popBranches` empty (`coreNodes` is just the root).
 */
export function splitRootGroupBySide(group: GenreTreeRootGroup): PopCoreSplit {
  const { root, nodes } = group;
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const directChildren = nodes.filter((node) => node.parentId === root.id);

  const popChildren = directChildren.filter((node) => node.side === "pop");
  const coreChildren = directChildren.filter((node) => node.side !== "pop");

  const collectSubtree = (startId: string): GenreTreeNode[] => {
    const childrenByParentId = new Map<string, GenreTreeNode[]>();
    for (const node of nodes) {
      if (node.parentId === null) continue;
      const siblings = childrenByParentId.get(node.parentId);
      if (siblings) siblings.push(node);
      else childrenByParentId.set(node.parentId, [node]);
    }

    const start = nodeById.get(startId)!;

    const subtree: GenreTreeNode[] = [];
    const stack = [start];
    while (stack.length > 0) {
      const current = stack.pop()!;
      subtree.push(current);
      stack.push(...(childrenByParentId.get(current.id) ?? []));
    }
    return subtree;
  };

  const coreBranches = coreChildren.map((child) => ({ child, nodes: collectSubtree(child.id) }));
  const popBranches = popChildren.map((child) => ({ child, nodes: collectSubtree(child.id) }));

  const coreNodes = [root, ...coreBranches.flatMap((branch) => branch.nodes)];
  const popNodes = popBranches.flatMap((branch) => branch.nodes);

  return { coreNodes, popNodes, coreBranches, popBranches };
}
