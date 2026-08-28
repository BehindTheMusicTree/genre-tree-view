import * as d3 from "d3";

import { GenreTreeNode } from "./types";
import { MAX_NODE_WIDTH } from "./constants";
import { buildTreeHierarchyStructure } from "./NodeHelper";
import { getRadialDepthRadius } from "./pop-core-radial-layout";

type D3Node = d3.HierarchyNode<GenreTreeNode>;

// Margin (px) added past a core subtree's deepest node's own half-width, so its rendered card
// never sits flush against the wheel's outer edge — mirrors POP_SUBTREE_OUTER_MARGIN.
const CORE_SUBTREE_OUTER_MARGIN = 24;

/** Builds a root's core subtree hierarchy, rooted at the root's own first core child (root not
 * included) — mirrors buildPopHierarchy: that child's own parentId still points at the (excluded)
 * ring root, which d3.stratify would reject, so it's normalized to null here. */
export function buildCoreHierarchy(d3Lib: typeof import("d3"), coreNodes: GenreTreeNode[]): D3Node {
  const ids = new Set(coreNodes.map((node) => node.id));
  const normalized = coreNodes.map((node) =>
    node.parentId !== null && !ids.has(node.parentId) ? { ...node, parentId: null } : node,
  );
  return buildTreeHierarchyStructure(d3Lib, normalized);
}

/**
 * Lays a root's core (non-pop) subtree out in polar coordinates, fanning outward from
 * `coreRootCircleRadius` within a wedge centered on `wedgeCenterAngleDegrees` — the mirror image of
 * `computePopRadialLayout`'s inward wedge. `hierarchy` is rooted at the ring root's own core
 * child (root not included), so depth 0 (absolute depth 1) lands exactly on `coreRootCircleRadius`,
 * next to the root chip it branches from, and each deeper generation steps further outward by
 * `depthSpacing`, occupying a disjoint radius range from any inward pop wedge in the same quadrant.
 */
export function computeCoreRadialLayout(
  d3Lib: typeof import("d3"),
  hierarchy: D3Node,
  wedgeCenterAngleDegrees: number,
  wedgeSpanDegrees: number,
  coreRootCircleRadius: number,
  depthSpacing: number,
): D3Node {
  const wedgeSpanRad = (wedgeSpanDegrees * Math.PI) / 180;
  const wedgeCenterRad = (wedgeCenterAngleDegrees * Math.PI) / 180;

  const treeLayout = d3Lib
    .tree<GenreTreeNode>()
    .size([wedgeSpanRad, 1])
    .separation(() => 1);
  treeLayout(hierarchy);

  hierarchy.each((d) => {
    const angleRad = wedgeCenterRad - wedgeSpanRad / 2 + d.x!;
    const radius = getRadialDepthRadius(d.depth, coreRootCircleRadius, depthSpacing);
    d.x = radius * Math.sin(angleRad);
    d.y = -radius * Math.cos(angleRad);
  });

  return hierarchy;
}

/** The outer radius (px, past `coreRootCircleRadius`) a core subtree needs to render without
 * overflowing — driven by its deepest node's ring (depth = hierarchy.height, since the hierarchy is
 * rooted at absolute depth 1 already) plus that node's own half-width and a fixed outer margin.
 * Pass 0 for `coreRootCircleRadius` to get the extent as a delta past the ring roots' own circle
 * (used while that circle's own size is still being determined). */
export function calculateCoreSubtreeRadialExtent(
  hierarchy: D3Node,
  depthSpacing: number,
  coreRootCircleRadius = 0,
): number {
  return (
    getRadialDepthRadius(hierarchy.height, coreRootCircleRadius, depthSpacing) + MAX_NODE_WIDTH / 2 + CORE_SUBTREE_OUTER_MARGIN
  );
}
