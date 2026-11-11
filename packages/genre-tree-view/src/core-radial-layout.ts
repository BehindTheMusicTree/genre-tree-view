import * as d3 from "d3";

import { GenreTreeNode } from "./types";
import { MAX_NODE_WIDTH, NODE_LAYOUT_SLOT_RADIUS } from "./constants";
import { buildTreeHierarchyStructure } from "./NodeHelper";
import { coreRadiusOfDepth, getRadialDepthRadius, isUndergroundRoot, layoutWedge } from "./pop-core-radial-layout";

type D3Node = d3.HierarchyNode<GenreTreeNode>;

// Margin (px) added past a core subtree's deepest node's own half-width, so its rendered card
// never sits flush against the wheel's outer edge — mirrors POP_SUBTREE_OUTER_MARGIN.
const CORE_SUBTREE_OUTER_MARGIN = 24;

/** Builds a root's core subtree hierarchy, rooted at the root's own first core child (root not
 * included) — mirrors buildPopHierarchy: that child's own parentId still points at the (excluded)
 * ring root, which d3.stratify would reject, so it's normalized to null here for structure-building
 * only; each resulting hierarchy node's `.data` is then restored to its original (un-normalized)
 * node so the real parentId still reaches renderers/click handlers/the info panel. */
export function buildCoreHierarchy(d3Lib: typeof import("d3"), coreNodes: GenreTreeNode[]): D3Node {
  const ids = new Set(coreNodes.map((node) => node.id));
  const byId = new Map(coreNodes.map((node) => [node.id, node]));
  const normalized = coreNodes.map((node) =>
    node.parentId !== null && !ids.has(node.parentId) ? { ...node, parentId: null } : node,
  );
  const hierarchy = buildTreeHierarchyStructure(d3Lib, normalized);
  hierarchy.each((d) => {
    d.data = byId.get(d.data.id) ?? d.data;
  });
  return hierarchy;
}

/**
 * Lays a root's core (non-pop) subtree out in polar coordinates, fanning outward from
 * `coreRootCircleRadius` within a wedge centered on `wedgeCenterAngleDegrees` — the mirror image of
 * `computePopRadialLayout`'s inward wedge. `hierarchy` is rooted at the ring root's own core
 * child (root not included), so depth 0 (absolute depth 1) lands one `depthSpacing` step past
 * `coreRootCircleRadius`, clear of the root chip's own boundary circle rather than straddling it,
 * and each deeper generation steps further outward by `depthSpacing`, occupying a disjoint radius
 * range from any inward pop wedge in the same quadrant.
 */
export function computeCoreRadialLayout(
  d3Lib: typeof import("d3"),
  hierarchy: D3Node,
  wedgeCenterAngleDegrees: number,
  wedgeSpanDegrees: number,
  coreRootCircleRadius: number,
  depthSpacing: number,
  dotRadius: number = NODE_LAYOUT_SLOT_RADIUS,
): D3Node {
  return layoutWedge(
    d3Lib,
    hierarchy,
    wedgeCenterAngleDegrees,
    wedgeSpanDegrees,
    coreRadiusOfDepth(coreRootCircleRadius, depthSpacing),
    "between-children",
    dotRadius,
  );
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
    getRadialDepthRadius(hierarchy.height + 1, coreRootCircleRadius, depthSpacing) +
    MAX_NODE_WIDTH / 2 +
    CORE_SUBTREE_OUTER_MARGIN
  );
}

/** A laid-out node's angle (degrees, CSS `rotate()` convention), unwrapped around `aroundDegrees`. */
export function nodeAngleDegrees(d: D3Node, aroundDegrees: number): number {
  const deg = (Math.atan2(d.x!, -d.y!) * 180) / Math.PI;
  return aroundDegrees + ((((deg - aroundDegrees + 540) % 360) + 360) % 360) - 180;
}

/** How far (degrees) a ring root's chip moves off its sector's center so it sits at its core
 * subtree's own top node, which `layoutWedge` puts on an underground-zone boundary
 * (`sceneBoundaryAnchor`). 0 when the subtree has no underground scene or when that top node is
 * itself underground. */
export function computeRootChipOffsetDegrees(
  laidOut: D3Node,
  wedgeCenterAngleDegrees: number,
  wedgeSpanDegrees: number,
): number {
  if (laidOut.data.scene === "underground") return 0;
  if (computeUndergroundSceneSpans(laidOut, wedgeCenterAngleDegrees, wedgeSpanDegrees).length === 0) return 0;
  return nodeAngleDegrees(laidOut, wedgeCenterAngleDegrees) - wedgeCenterAngleDegrees;
}

/** Angular span (degrees, CSS `rotate()` convention, unwrapped around `wedgeCenterAngleDegrees`) of
 * each top-most underground-scene subtree in a laid-out core wedge. A span reaches the midpoint
 * with the neighboring sibling subtree's own angular range, or the wedge edge when it has no
 * neighbor on that side, so adjacent scenes tile the wedge without a gap. */
export function computeUndergroundSceneSpans(
  laidOut: D3Node,
  wedgeCenterAngleDegrees: number,
  wedgeSpanDegrees: number,
): { id: string; startDeg: number; endDeg: number }[] {
  const angleOf = (d: D3Node) => nodeAngleDegrees(d, wedgeCenterAngleDegrees);
  const subtreeRange = (d: D3Node) => {
    const angles = d.descendants().map(angleOf);
    return { min: Math.min(...angles), max: Math.max(...angles) };
  };
  return laidOut
    .descendants()
    .filter(isUndergroundRoot)
    .map((ug) => {
      const mine = subtreeRange(ug);
      const siblings = ug.parent?.children ?? [];
      const at = siblings.indexOf(ug);
      const prev = at > 0 ? siblings[at - 1] : undefined;
      const next = at >= 0 ? siblings[at + 1] : undefined;
      return {
        id: ug.data.id,
        startDeg: prev
          ? (subtreeRange(prev).max + mine.min) / 2
          : wedgeCenterAngleDegrees - wedgeSpanDegrees / 2,
        endDeg: next
          ? (mine.max + subtreeRange(next).min) / 2
          : wedgeCenterAngleDegrees + wedgeSpanDegrees / 2,
      };
    });
}
