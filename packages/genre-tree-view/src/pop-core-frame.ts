import { CENTER_NODE_NAME } from "./constants";
import { GenreTreeNode } from "./types";

export interface PopCoreFrame {
  /** The node rendered at the wheel's center. */
  center: GenreTreeNode;
  /** True when the center renders as the white pop disc with its own subtree inside; false when
   * it's shown as a label only (its children are the ring roots instead). */
  centerHasPopDisc: boolean;
  /** The center plus, when it has a pop disc, its whole subtree. */
  centerNodes: GenreTreeNode[];
  /** Every node rendered on the ring, each ring root's `parentId` rewritten to null (as is the
   * center's, so each subtree stratifies on its own). */
  ringNodes: GenreTreeNode[];
}

function collectSubtree(root: GenreTreeNode, childrenByParentId: Map<string, GenreTreeNode[]>) {
  const subtree: GenreTreeNode[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop()!;
    subtree.push(current);
    stack.push(...(childrenByParentId.get(current.id) ?? []));
  }
  return subtree;
}

/**
 * Whether `id` can be the pop-core wheel's focus: a known node with children and at most one pop
 * child (`resolvePopCoreFrame` can't center more than one pop disc).
 */
export function isZoomableNode(nodes: readonly GenreTreeNode[], id: string): boolean {
  if (!nodes.some((node) => node.id === id)) return false;
  const children = nodes.filter((node) => node.parentId === id);
  return children.length > 0 && children.filter((child) => child.side === "pop").length <= 1;
}

/**
 * Picks what the pop-core wheel renders. Without a focus, the "Mainstream Pop" root is the center
 * and every other root is a ring root. With a focus, the focus node's single pop-side child (if
 * any) becomes the center pop disc, otherwise the focus node itself is the center (label only);
 * every other direct child of the focus node becomes a ring root.
 */
export function resolvePopCoreFrame(nodes: GenreTreeNode[], focusNodeId: string | null): PopCoreFrame {
  const childrenByParentId = new Map<string, GenreTreeNode[]>();
  nodes.forEach((node) => {
    if (node.parentId === null) return;
    const siblings = childrenByParentId.get(node.parentId);
    if (siblings) siblings.push(node);
    else childrenByParentId.set(node.parentId, [node]);
  });

  if (focusNodeId === null) {
    const center = nodes.find((node) => node.parentId === null && node.name === CENTER_NODE_NAME);
    if (!center) {
      throw new Error(`GenreTreeWheelRadialPopCore requires a root node named "${CENTER_NODE_NAME}"`);
    }
    const centerNodes = collectSubtree(center, childrenByParentId);
    const centerIds = new Set(centerNodes.map((node) => node.id));
    return {
      center,
      centerHasPopDisc: true,
      centerNodes,
      ringNodes: nodes.filter((node) => !centerIds.has(node.id)),
    };
  }

  const focus = nodes.find((node) => node.id === focusNodeId);
  if (!focus) throw new Error(`Unknown pop-core focus node "${focusNodeId}"`);
  const children = childrenByParentId.get(focus.id) ?? [];
  const popChildren = children.filter((child) => child.side === "pop");
  if (popChildren.length > 1) {
    throw new Error(`Pop-core focus node "${focus.id}" has more than one pop child`);
  }
  const asRoot = (root: GenreTreeNode) =>
    collectSubtree(root, childrenByParentId).map((node) => (node === root ? { ...node, parentId: null } : node));
  const [popChild] = popChildren;
  const ringNodes = children.filter((child) => child !== popChild).flatMap(asRoot);
  if (!popChild) {
    const center = { ...focus, parentId: null };
    return { center, centerHasPopDisc: false, centerNodes: [center], ringNodes };
  }
  const centerNodes = asRoot(popChild);
  return { center: centerNodes[0], centerHasPopDisc: true, centerNodes, ringNodes };
}
