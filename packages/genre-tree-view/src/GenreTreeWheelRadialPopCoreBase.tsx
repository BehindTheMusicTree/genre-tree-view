"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MdBlurCircular, MdFitScreen, MdZoomIn, MdZoomOut } from "react-icons/md";
import * as d3 from "d3";

import { buildTreeHierarchyStructure } from "./NodeHelper";
import { NodeToolbar } from "./NodeToolbar";
import { GenreTreeRootGroup, groupNodesByRoot } from "./root-grouping";
import { splitRootGroupBySide } from "./pop-core-split";
import { buildCoreHierarchy, calculateCoreSubtreeRadialExtent, computeCoreRadialLayout } from "./core-radial-layout";
import {
  buildPopHierarchy,
  calculateMainstreamPopOuterCircleRadius,
  calculatePopSubtreeRadialExtent,
  computeCenterRadialLayout,
  computePopRadialLayout,
  getRadialPointOnCircle,
  POP_WEDGE_SPAN_DEGREES,
  renderPopSubtree,
} from "./pop-core-radial-layout";
import {
  buildSectorClipPathPolygon,
  calculateWheelRadiusForAngles,
  computeRadialLayout,
  computeSectorWidths,
  RadialSlot,
} from "./radial-wheel-geometry";
import { usePanZoom } from "./use-pan-zoom";
import { queryTreeContentElements } from "./zoom-pan";
import { GenreTreeNode, GenreTreeProps } from "./types";
import {
  calculateNodeDimensions,
  calculateNodeFontSize,
  getGenreTreeColor,
  getItemCountRange,
  hexToRgba,
  MAX_NODE_WIDTH,
  PER_TREE_ACCENT_DOT,
  POP_TREE_DEPTH_RADIAL_SPACING,
  ROOT_SECTOR_FILL_OPACITY,
  WHEEL_POP_CORE_RADIUS,
  WHEEL_ROTATION_EASING,
  WHEEL_ROTATION_TRANSITION_MS,
} from "./constants";

export interface WheelRadialPopCoreProps extends Omit<GenreTreeProps, "nodes" | "rootColor" | "orientation"> {
  nodes: GenreTreeNode[];
  /** Fired whenever the top (just-clicked) root changes — on mount with the default selection,
   * and on every chip click. */
  onRootSelect?: (rootId: string) => void;
}

// The wheel's pivot point renders this specific root (by name) as a full interactive node
// instead of a plain label, and it's excluded from the ring's own chips — see the center node
// lookup in WheelRadialPopCoreCore for the fail-fast validation this name is tied to.
const CENTER_NODE_NAME = "Mainstream Pop";

// The wheel always lands the just-clicked root on the right (matches WheelRadialCore's own
// landingAngle=90 convention) — see computeRadialLayout's doc comment for why.
const LANDING_ANGLE = 90;

// Unwraps computeRadialLayout's [0, 360)-wrapped angles into each root's own continuous
// (possibly >360 or negative) angle, nearest to its `previous` value — see WheelRadialCore's own
// copy of this function for why plain wrapped angles cause a wrong-direction transition.
function computeContinuousAngles(
  groups: GenreTreeRootGroup[],
  layout: RadialSlot[],
  previous: Map<string, number>,
): Map<string, number> {
  const angles = new Map<string, number>();
  groups.forEach((group, index) => {
    const rawAngle = layout[index]?.angle ?? 0;
    const previousAngle = previous.get(group.root.id);
    const laps = previousAngle === undefined ? 0 : Math.round((previousAngle - rawAngle) / 360);
    angles.set(group.root.id, rawAngle + 360 * laps);
  });
  return angles;
}

/**
 * Same ring mechanics as `WheelRadialCore`, with two differences: every root's outward subtree
 * renders only its *core* (non-pop) branch (`side !== "pop"`), and — if that root also has a pop
 * branch — that pop subtree renders as a full interactive tree fanned out *inside* the wheel's own
 * circle, in the root's own sector, instead of being hidden. The circle grows past its normal
 * chip-clearance floor as needed to fit the largest pop subtree (see
 * `calculatePopSubtreeRadialExtent`).
 */
export function WheelRadialPopCoreCore({
  nodes,
  className,
  onRootSelect,
  playingNodeId = null,
  playState,
  reparentingNodeId = null,
  onPlayPause,
  onAddChild,
  onRenameRequest,
  onDeleteRequest,
  onReparentRequest,
  onReparent,
  additionalActions,
}: WheelRadialPopCoreProps) {
  const centerNode = nodes.find((node) => node.parentId === null && node.name === CENTER_NODE_NAME);
  if (!centerNode) {
    throw new Error(`GenreTreeWheelRadialPopCore requires a root node named "${CENTER_NODE_NAME}"`);
  }

  // The center node's own subtree (if any) renders inside the wheel's circle (see
  // centerSubtreeHierarchy below) rather than as a ring root, so it — and all its descendants —
  // must be excluded from ringNodes, not just the center node itself.
  const centerSubtreeNodes = useMemo(() => {
    const childrenByParentId = new Map<string, GenreTreeNode[]>();
    for (const node of nodes) {
      if (node.parentId === null) continue;
      const siblings = childrenByParentId.get(node.parentId);
      if (siblings) siblings.push(node);
      else childrenByParentId.set(node.parentId, [node]);
    }
    const subtree: GenreTreeNode[] = [];
    const stack = [centerNode];
    while (stack.length > 0) {
      const current = stack.pop()!;
      subtree.push(current);
      stack.push(...(childrenByParentId.get(current.id) ?? []));
    }
    return subtree;
  }, [nodes, centerNode]);

  const centerSubtreeNodeIds = useMemo(
    () => new Set(centerSubtreeNodes.map((node) => node.id)),
    [centerSubtreeNodes],
  );

  // computeCenterRadialLayout spreads each depth-1 child's wedge proportional to its own subtree
  // size (d3.tree's default separation) — feeding it the center node's pop-side children too would
  // let their descendant counts inflate their core siblings' neighboring wedges, so they're
  // excluded here the same way splitRootGroupBySide excludes a ring root's pop branch from its core
  // one. Unlike the ring roots, the center node's own pop branch (if any) has no dedicated wedge
  // rendering path today, so excluding it here also drops it from view entirely.
  const centerCoreSubtreeNodes = useMemo(() => {
    const childrenByParentId = new Map<string, GenreTreeNode[]>();
    for (const node of centerSubtreeNodes) {
      if (node.parentId === null) continue;
      const siblings = childrenByParentId.get(node.parentId);
      if (siblings) siblings.push(node);
      else childrenByParentId.set(node.parentId, [node]);
    }
    const coreChildren = (childrenByParentId.get(centerNode.id) ?? []).filter((child) => child.side !== "pop");
    const subtree: GenreTreeNode[] = [centerNode];
    const stack = [...coreChildren];
    while (stack.length > 0) {
      const current = stack.pop()!;
      subtree.push(current);
      stack.push(...(childrenByParentId.get(current.id) ?? []));
    }
    return subtree;
  }, [centerSubtreeNodes, centerNode]);

  const centerSubtreeHierarchy = useMemo(
    () => (centerCoreSubtreeNodes.length > 1 ? buildTreeHierarchyStructure(d3, centerCoreSubtreeNodes) : null),
    [centerCoreSubtreeNodes],
  );

  const ringNodes = useMemo(
    () => nodes.filter((node) => !centerSubtreeNodeIds.has(node.id)),
    [nodes, centerSubtreeNodeIds],
  );
  const groups = useMemo(() => groupNodesByRoot(ringNodes), [ringNodes]);

  const splitByRootId = useMemo(
    () => new Map(groups.map((group) => [group.root.id, splitRootGroupBySide(group)])),
    [groups],
  );

  const [topRootId, setTopRootId] = useState<string | null>(groups[0]?.root.id ?? null);
  // Whether the center "Mainstream Pop" node's own subtree (if it has one) is currently shown — collapsed by
  // default, toggled by clicking the center chip itself (see the button below).
  const [isPopExpanded, setIsPopExpanded] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const panZoom = usePanZoom(viewportRef);
  const wheelCircleRef = useRef<HTMLDivElement>(null);
  const popSvgRef = useRef<SVGSVGElement>(null);

  // Falls back to the first root without writing state back when the explicitly selected root
  // disappears from `nodes` — avoids a setState-in-effect cascading render for derived state.
  const effectiveTopRootId = groups.some((group) => group.root.id === topRootId)
    ? topRootId
    : (groups[0]?.root.id ?? null);
  const topIndex = Math.max(
    groups.findIndex((group) => group.root.id === effectiveTopRootId),
    0,
  );

  const rootWeights = useMemo(() => groups.map((group) => group.nodes.length), [groups]);

  const layout = useMemo(
    () => computeRadialLayout(rootWeights, topIndex, LANDING_ANGLE),
    [rootWeights, topIndex],
  );

  // computeRadialLayout always returns angles wrapped to [0, 360) — re-rendering with a fresh
  // wrapped value on every selection change means a chip landing back near 0deg (top) has to
  // transition from e.g. 270deg down through 90/0, i.e. always counterclockwise, regardless of
  // which way the ring conceptually just turned. Track each chip's own last displayed (unwrapped)
  // angle and add/subtract full turns so its CSS transition always takes its own shortest path.
  const [angleMemo, setAngleMemo] = useState(() => ({
    layout,
    angles: computeContinuousAngles(groups, layout, new Map()),
  }));
  if (angleMemo.layout !== layout) {
    setAngleMemo({ layout, angles: computeContinuousAngles(groups, layout, angleMemo.angles) });
  }
  const continuousAngleByRootId = angleMemo.angles;

  // A root's own itemCount can under-report its subtree — chip size (and the range it's scaled
  // against) reflects the full subtree total instead, mirroring the tree's own rollup.
  const aggregatedRootItemCountById = useMemo(
    () =>
      new Map(
        groups.map((group) => [group.root.id, group.nodes.reduce((sum, node) => sum + node.itemCount, 0)]),
      ),
    [groups],
  );

  const rootItemCountRange = useMemo(
    () =>
      getItemCountRange(groups.map((group) => ({ itemCount: aggregatedRootItemCountById.get(group.root.id)! }))),
    [groups, aggregatedRootItemCountById],
  );

  // Pop-subtree node cards scale against the whole tree's item counts, not just their own subtree's
  // — a pop chain's few nodes can have a narrow itemCount spread that would otherwise get stretched
  // across the full size range and render wildly inconsistent card sizes next to core siblings.
  const wheelItemCountRange = useMemo(() => getItemCountRange(nodes), [nodes]);

  // Center root node ("Mainstream Pop") renders at 2x the chip size normal itemCount scaling would give it,
  // so it reads as the wheel's focal point rather than blending in with the ring chips.
  const CENTER_NODE_SCALE = 2;
  const centerNodeDimensions = useMemo(() => {
    const base = calculateNodeDimensions(centerNode.itemCount, rootItemCountRange);
    return { WIDTH: base.WIDTH * CENTER_NODE_SCALE, HEIGHT: base.HEIGHT * CENTER_NODE_SCALE };
  }, [centerNode, rootItemCountRange]);
  const centerNodeFontSize = useMemo(
    () => calculateNodeFontSize(centerNode.itemCount, rootItemCountRange) * CENTER_NODE_SCALE,
    [centerNode, rootItemCountRange],
  );
  const centerNodeColor = "#ffffff";
  // Collapsed, the center chip reads as a circular pivot rather than a rectangular card like the
  // ring chips — a perfect circle needs equal width/height, so pick the larger of the two.
  const centerChipDiameter = Math.max(centerNodeDimensions.WIDTH, centerNodeDimensions.HEIGHT);

  // Only roots that actually have a pop branch get a hierarchy built — the common case (e.g.
  // classical) has none, so this stays empty most of the time.
  const popHierarchyByRootId = useMemo(() => {
    const map = new Map<string, { hierarchy: d3.HierarchyNode<GenreTreeNode>; angle: number }>();
    groups.forEach((group, index) => {
      const popNodes = splitByRootId.get(group.root.id)?.popNodes ?? [];
      if (popNodes.length === 0) return;
      map.set(group.root.id, { hierarchy: buildPopHierarchy(d3, popNodes), angle: layout[index]?.angle ?? 0 });
    });
    return map;
  }, [groups, layout, splitByRootId]);

  // Only roots that actually have a core (non-pop) child get a hierarchy built — a root with zero
  // children (splitRootGroupBySide's coreNodes = [root] only) has nothing to fan outward.
  const coreHierarchyByRootId = useMemo(() => {
    const map = new Map<string, { hierarchy: d3.HierarchyNode<GenreTreeNode>; angle: number }>();
    groups.forEach((group, index) => {
      const coreNodes = splitByRootId.get(group.root.id)?.coreNodes ?? [];
      // coreNodes always includes the root itself (splitRootGroupBySide) — drop it, mirroring
      // popNodes, since the root already renders as its own wheel chip.
      const coreChildNodes = coreNodes.slice(1);
      if (coreChildNodes.length === 0) return;
      map.set(group.root.id, { hierarchy: buildCoreHierarchy(d3, coreChildNodes), angle: layout[index]?.angle ?? 0 });
    });
    return map;
  }, [groups, layout, splitByRootId]);

  // Real angular sector each ring root owns, proportional to its own weight (rootWeights) out of
  // the total — same widths computeRadialLayout placed chips with, so a root's pop/core wedge below
  // is guaranteed to fit within its actual sector without spilling into a neighbor's, regardless of
  // how uneven neighboring roots' weights are (see computeSectorWidths's doc comment).
  const sectorSpanByRootId = useMemo(() => {
    const map = new Map<string, number>();
    if (groups.length <= 1) return map;
    const widths = computeSectorWidths(rootWeights);
    groups.forEach((group, index) => {
      map.set(group.root.id, widths[index]);
    });
    return map;
  }, [groups, rootWeights]);

  const wedgeSpanForRoot = useCallback(
    (rootId: string) => Math.min(POP_WEDGE_SPAN_DEGREES, sectorSpanByRootId.get(rootId) ?? POP_WEDGE_SPAN_DEGREES),
    [sectorSpanByRootId],
  );

  // Floor every ring root sits on, driven purely by chip clearance — the base every radial depth
  // (ring roots, their pop branches, and the center subtree) measures outward from, before pop/
  // center subtree extents are folded in below.
  const chipClearanceFloor = useMemo(
    () => calculateWheelRadiusForAngles(layout.map((slot) => slot.angle), MAX_NODE_WIDTH, WHEEL_POP_CORE_RADIUS),
    [layout],
  );

  // How far past the ring roots' own circle the tallest developed root's pop wedge reaches —
  // computed as a delta (base radius 0) since the actual base (coreRootCircleRadius) isn't known
  // yet; folded into coreRootCircleRadius below, then re-applied at the real base for rendering.
  const maxPopExtentDelta = useMemo(() => {
    let extent = 0;
    popHierarchyByRootId.forEach(({ hierarchy }) => {
      extent = Math.max(extent, calculatePopSubtreeRadialExtent(hierarchy, 0));
    });
    return extent;
  }, [popHierarchyByRootId]);

  // Same idea as maxPopExtentDelta, for the center Mainstream Pop node's own subtree.
  const centerSubtreeExtentDelta = useMemo(
    () =>
      isPopExpanded && centerSubtreeHierarchy
        ? calculateMainstreamPopOuterCircleRadius(centerSubtreeHierarchy, 0, POP_TREE_DEPTH_RADIAL_SPACING)
        : 0,
    [isPopExpanded, centerSubtreeHierarchy],
  );

  // The mainstream circle's current radius from the wheel's true center — the collapsed center
  // chip's own disc, or (once expanded) how far its own subtree reaches. The deepest pop node
  // must clear this, not just some fixed distance past the ring roots' own circle.
  const mainstreamCircleRadius = useMemo(
    () => (isPopExpanded && centerSubtreeHierarchy ? centerSubtreeExtentDelta : centerChipDiameter / 2),
    [isPopExpanded, centerSubtreeHierarchy, centerSubtreeExtentDelta, centerChipDiameter],
  );

  // How far past the ring roots' own circle the deepest developed root's core branch reaches —
  // same idea as maxPopExtentDelta. Core branches render outward from coreRootCircleRadius
  // regardless of its value, so this doesn't belong in coreRootCircleRadius itself (that would
  // needlessly drag the visual outer circle and ring root chips outward with it) — it only feeds
  // svgCanvasRadius below, so the deepest core branch has enough SVG canvas to render into
  // without being clipped.
  const maxCoreExtentDelta = useMemo(() => {
    let extent = 0;
    coreHierarchyByRootId.forEach(({ hierarchy }) => {
      extent = Math.max(extent, calculateCoreSubtreeRadialExtent(hierarchy, POP_TREE_DEPTH_RADIAL_SPACING, 0));
    });
    return extent;
  }, [coreHierarchyByRootId]);

  // Pins coreRootCircleRadius so the deepest node of the deepest developed pop branch (which
  // climbs inward from coreRootCircleRadius by a fixed depthSpacing per depth step — see
  // computePopRadialLayout) has its card clear the mainstream circle by the usual half-width +
  // outer margin, rather than leaving that gap to whatever coreRootCircleRadius happens to be for
  // other reasons. Zero (dropped from the Math.max below) when no root has a pop branch at all.
  const popReachRequiredRadius = useMemo(
    () => (maxPopExtentDelta > 0 ? mainstreamCircleRadius + maxPopExtentDelta : 0),
    [mainstreamCircleRadius, maxPopExtentDelta],
  );

  // The visual outer circle's radius (--gtv-wheel-radius) and, equally, where every ring root's
  // own chip sits — NOT the SVG canvas size (see svgCanvasRadius below). Deliberately excludes
  // maxCoreExtentDelta: a deep core branch needs canvas room to render into, but it shouldn't
  // drag ring root chips (and the pop branches anchored to them) outward with it.
  const coreRootCircleRadius = useMemo(
    () =>
      Math.max(chipClearanceFloor, chipClearanceFloor + centerSubtreeExtentDelta, popReachRequiredRadius),
    [chipClearanceFloor, centerSubtreeExtentDelta, popReachRequiredRadius],
  );

  // The SVG canvas's actual radius. Core branches render outward from the real coreRootCircleRadius
  // (see computeCoreRadialLayout's call below), so the canvas must extend maxCoreExtentDelta past
  // that actual base — not past chipClearanceFloor, which can be smaller than coreRootCircleRadius
  // whenever pop reach or the expanded center subtree is what's sizing it — or the deepest core
  // node gets clipped. Purely a rendering-surface concern: never feeds back into coreRootCircleRadius,
  // so it doesn't affect the visual outer circle or ring root chip placement.
  const svgCanvasRadius = useMemo(
    () => coreRootCircleRadius + maxCoreExtentDelta,
    [coreRootCircleRadius, maxCoreExtentDelta],
  );

  // Boundary the center Mainstream Pop node's subtree currently occupies, drawn as a cosmetic
  // marker — the subtree itself renders inside this circle (see computeCenterRadialLayout below),
  // while every root's pop wedges fan outward from it toward coreRootCircleRadius.
  const middleCircleFloor = mainstreamCircleRadius;

  // Read via a ref rather than depending on `onRootSelect` directly — consumers commonly pass an
  // inline callback, which would otherwise re-fire this effect (and any state it sets) every render.
  const onRootSelectRef = useRef(onRootSelect);
  useEffect(() => {
    onRootSelectRef.current = onRootSelect;
  });

  useEffect(() => {
    if (effectiveTopRootId) onRootSelectRef.current?.(effectiveTopRootId);
  }, [effectiveTopRootId]);

  useEffect(() => {
    if (!popSvgRef.current) return;

    const svg = d3.select(popSvgRef.current);
    svg.selectAll("*").remove();
    const originGroup = svg
      .append("g")
      .attr("transform", `translate(${svgCanvasRadius}, ${svgCanvasRadius})`);

    popHierarchyByRootId.forEach(({ hierarchy, angle }, rootId) => {
      const laidOut = computePopRadialLayout(
        d3,
        hierarchy,
        angle,
        coreRootCircleRadius,
        wedgeSpanForRoot(rootId),
      );
      const rootLinkOrigin = getRadialPointOnCircle(angle, coreRootCircleRadius);
      const reparentForbiddenIds = reparentingNodeId
        ? (laidOut
            .descendants()
            .find((d) => d.data.id === reparentingNodeId)
            ?.descendants()
            .map((d) => d.data.id) ?? [])
        : [];

      const sectorGroup = originGroup
        .append("g")
        .attr("class", "gtv-wheel-pop-sector")
        .attr("data-gtv-root-id", rootId);

      renderPopSubtree(
        d3,
        sectorGroup,
        laidOut,
        getGenreTreeColor(rootId),
        reparentingNodeId,
        reparentForbiddenIds,
        {
          onPlayPause,
          onAddChild,
          onRenameRequest,
          onDeleteRequest,
          onReparentRequest,
          onReparentTargetSelect: (newParentId) => {
            if (reparentingNodeId) void onReparent?.(reparentingNodeId, newParentId);
          },
          additionalActions,
          playingNodeId,
          playState,
        },
        wheelItemCountRange,
        undefined,
        undefined,
        coreRootCircleRadius,
        rootLinkOrigin,
      );
    });

    coreHierarchyByRootId.forEach(({ hierarchy, angle }, rootId) => {
      const laidOut = computeCoreRadialLayout(
        d3,
        hierarchy,
        angle,
        wedgeSpanForRoot(rootId),
        coreRootCircleRadius,
        POP_TREE_DEPTH_RADIAL_SPACING,
      );
      const rootLinkOrigin = getRadialPointOnCircle(angle, coreRootCircleRadius);
      const reparentForbiddenIds = reparentingNodeId
        ? (laidOut
            .descendants()
            .find((d) => d.data.id === reparentingNodeId)
            ?.descendants()
            .map((d) => d.data.id) ?? [])
        : [];

      const sectorGroup = originGroup
        .append("g")
        .attr("class", "gtv-wheel-core-sector")
        .attr("data-gtv-root-id", rootId);

      renderPopSubtree(
        d3,
        sectorGroup,
        laidOut,
        getGenreTreeColor(rootId),
        reparentingNodeId,
        reparentForbiddenIds,
        {
          onPlayPause,
          onAddChild,
          onRenameRequest,
          onDeleteRequest,
          onReparentRequest,
          onReparentTargetSelect: (newParentId) => {
            if (reparentingNodeId) void onReparent?.(reparentingNodeId, newParentId);
          },
          additionalActions,
          playingNodeId,
          playState,
        },
        wheelItemCountRange,
        false,
        true,
        coreRootCircleRadius,
        rootLinkOrigin,
      );
    });

    if (isPopExpanded && centerSubtreeHierarchy) {
      const laidOutCenter = computeCenterRadialLayout(
        d3,
        centerSubtreeHierarchy,
        0,
        POP_TREE_DEPTH_RADIAL_SPACING,
      );
      const reparentForbiddenIds = reparentingNodeId
        ? (laidOutCenter
            .descendants()
            .find((d) => d.data.id === reparentingNodeId)
            ?.descendants()
            .map((d) => d.data.id) ?? [])
        : [];

      const centerSectorGroup = originGroup.append("g").attr("class", "gtv-wheel-center-sector");

      renderPopSubtree(
        d3,
        centerSectorGroup,
        laidOutCenter,
        centerNodeColor,
        reparentingNodeId,
        reparentForbiddenIds,
        {
          onPlayPause,
          onAddChild,
          onRenameRequest,
          onDeleteRequest,
          onReparentRequest,
          onReparentTargetSelect: (newParentId) => {
            if (reparentingNodeId) void onReparent?.(reparentingNodeId, newParentId);
          },
          additionalActions,
          playingNodeId,
          playState,
        },
        wheelItemCountRange,
        true,
        undefined,
        coreRootCircleRadius,
      );
    }
  }, [
    popHierarchyByRootId,
    coreHierarchyByRootId,
    coreRootCircleRadius,
    svgCanvasRadius,
    mainstreamCircleRadius,
    wedgeSpanForRoot,
    reparentingNodeId,
    playingNodeId,
    playState,
    onPlayPause,
    onAddChild,
    onRenameRequest,
    onDeleteRequest,
    onReparentRequest,
    onReparent,
    additionalActions,
    isPopExpanded,
    centerSubtreeHierarchy,
    centerNodeColor,
    wheelItemCountRange,
  ]);

  // Starts the view fit to the wheel + rendered pop sectors instead of at scale 1 / pan (0, 0) —
  // guarded so it only fires once popSvgRef has actually rendered content, and never again
  // afterward so it doesn't fight the user's own pan/zoom on later selections/expansions.
  const hasInitialFitRef = useRef(false);
  useEffect(() => {
    if (hasInitialFitRef.current) return;
    const elements = [wheelCircleRef.current, ...queryTreeContentElements(popSvgRef.current)];
    if (!elements.some(Boolean)) return;
    hasInitialFitRef.current = true;
    panZoom.fitToFrame(elements);
  });

  const handleChipClick = (rootId: string) => {
    setTopRootId(rootId);
  };

  // One divider per boundary between two angularly-adjacent ring roots — see WheelRadialCore's own
  // copy of this computation for why each root's own continuous angle plus half its
  // weight-proportional width (sectorSpanByRootId) lands exactly on the boundary with its next
  // neighbor.
  const dividerAngles = useMemo(() => {
    if (groups.length <= 1) return [];
    return groups.map((group) => {
      const angle = continuousAngleByRootId.get(group.root.id) ?? 0;
      const width = sectorSpanByRootId.get(group.root.id) ?? 0;
      return angle + width / 2;
    });
  }, [groups, continuousAngleByRootId, sectorSpanByRootId]);

  // One tinted sector fan per root, bounded by its own weight-proportional width — see
  // WheelRadialCore's own copy of this computation, and computeSectorWidths's doc comment.
  const sectorFills = useMemo(() => {
    if (groups.length <= 1) return [];
    return groups.map((group) => {
      const angle = continuousAngleByRootId.get(group.root.id) ?? 0;
      const width = sectorSpanByRootId.get(group.root.id) ?? 0;
      return {
        rootId: group.root.id,
        start: angle - width / 2,
        clipPath: buildSectorClipPathPolygon(width),
        color: hexToRgba(getGenreTreeColor(group.root.id), ROOT_SECTOR_FILL_OPACITY),
      };
    });
  }, [groups, continuousAngleByRootId, sectorSpanByRootId]);

  return (
    <div
      ref={viewportRef}
      className={["gtv-wheel-container", "gtv-wheel-container--radial", className].filter(Boolean).join(" ")}
      style={
        {
          "--gtv-wheel-radius": `${coreRootCircleRadius}px`,
          "--gtv-wheel-svg-radius": `${svgCanvasRadius}px`,
          "--gtv-wheel-rotation-transition-ms": `${WHEEL_ROTATION_TRANSITION_MS}ms`,
          "--gtv-wheel-rotation-easing": WHEEL_ROTATION_EASING,
        } as React.CSSProperties
      }
      onPointerDown={panZoom.handlePointerDown}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          transform: panZoom.transform,
          transformOrigin: "0 0",
        }}
      >
        <div className="gtv-wheel-stage">
          <div className="gtv-wheel-circle" ref={wheelCircleRef} />

          {isPopExpanded && centerSubtreeHierarchy && (
            <div
              className="gtv-wheel-middle-circle"
              style={{ "--gtv-wheel-middle-radius": `${middleCircleFloor}px` } as React.CSSProperties}
            />
          )}

          {/* Sector wash + inner tint sit in their own .gtv-wheel layer, rendered before the node
              svg below, so they paint under the developed nodes instead of dulling them — see the
              second .gtv-wheel layer (after the svg) for the dividers/chips, which stay above the
              nodes. */}
          <div className="gtv-wheel">
            {sectorFills.map((sector) => (
              <div
                key={`sector-${sector.rootId}`}
                className="gtv-wheel-sector"
                style={
                  {
                    "--gtv-sector-angle": `${sector.start}deg`,
                    "--gtv-sector-color": sector.color,
                    clipPath: sector.clipPath,
                  } as React.CSSProperties
                }
              />
            ))}

            <div className="gtv-wheel-inner-tint" />
          </div>

          <svg
            ref={popSvgRef}
            className="gtv-wheel-pop-layer"
            width={svgCanvasRadius * 2}
            height={svgCanvasRadius * 2}
          />

          <div className="gtv-wheel-center-node">
            <div className="gtv-wheel-chip-anchor">
              <div
                className={["gtv-wheel-chip", "gtv-wheel-chip--center", !isPopExpanded && "gtv-wheel-chip--circle"]
                  .filter(Boolean)
                  .join(" ")}
                style={
                  isPopExpanded
                    ? ({
                        width: centerNodeDimensions.WIDTH,
                        "--gtv-wheel-chip-base-height": `${centerNodeDimensions.HEIGHT}px`,
                        "--gtv-chip-color": centerNodeColor,
                        "--gtv-hover-label-height": `${centerNodeDimensions.HEIGHT}px`,
                      } as React.CSSProperties)
                    : ({
                        width: centerChipDiameter,
                        "--gtv-wheel-chip-base-height": `${centerChipDiameter}px`,
                        "--gtv-chip-color": centerNodeColor,
                      } as React.CSSProperties)
                }
              >
                {PER_TREE_ACCENT_DOT && <span className="gtv-wheel-chip-dot" />}
                <span className="gtv-node-label gtv-node-label--root" style={{ fontSize: centerNodeFontSize }}>
                  {centerNode.name}
                </span>
                <span className="gtv-wheel-chip-hover-name" style={{ fontSize: centerNodeFontSize }}>
                  {centerNode.name}
                </span>
              </div>
              <div
                className={[
                  "gtv-wheel-chip-toolbar",
                  !isPopExpanded && "gtv-wheel-chip-toolbar--circle",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={
                  {
                    "--gtv-node-fill": centerNodeColor,
                  } as React.CSSProperties
                }
                onPointerDown={(event) => event.stopPropagation()}
              >
                <NodeToolbar
                  node={centerNode}
                  itemCount={centerNode.itemCount}
                  playingNodeId={playingNodeId}
                  playState={playState}
                  onPlayPause={onPlayPause}
                  onAddChild={onAddChild}
                  onRenameRequest={onRenameRequest}
                  onDeleteRequest={onDeleteRequest}
                  onReparentRequest={onReparentRequest}
                  additionalActions={additionalActions}
                />
              </div>
            </div>
          </div>

          <div className="gtv-wheel">
            {dividerAngles.map((angle, index) => (
              <div
                key={`divider-${groups[index].root.id}`}
                className="gtv-wheel-divider"
                style={{ "--gtv-divider-angle": `${angle}deg` } as React.CSSProperties}
              />
            ))}

            {groups.map((group, index) => {
              const slot = layout[index];
              const angle = continuousAngleByRootId.get(group.root.id) ?? slot?.angle ?? 0;
              const chipColor = getGenreTreeColor(group.root.id);
              const aggregatedItemCount = aggregatedRootItemCountById.get(group.root.id)!;
              const dimensions = calculateNodeDimensions(aggregatedItemCount, rootItemCountRange);
              const fontSize = calculateNodeFontSize(aggregatedItemCount, rootItemCountRange);
              return (
                <div
                  key={group.root.id}
                  className="gtv-wheel-slot"
                  style={{ "--gtv-chip-angle": `${angle}deg` } as React.CSSProperties}
                >
                  <div className="gtv-wheel-chip-anchor">
                    <button
                      type="button"
                      className="gtv-wheel-chip gtv-wheel-chip--selected"
                      style={
                        {
                          width: dimensions.WIDTH,
                          "--gtv-wheel-chip-base-height": `${dimensions.HEIGHT}px`,
                          "--gtv-chip-color": chipColor,
                          "--gtv-hover-label-height": `${dimensions.HEIGHT}px`,
                        } as React.CSSProperties
                      }
                      onClick={() => handleChipClick(group.root.id)}
                    >
                      {PER_TREE_ACCENT_DOT && <span className="gtv-wheel-chip-dot" />}
                      <span className="gtv-node-label gtv-node-label--root" style={{ fontSize }}>
                        {group.root.name}
                      </span>
                      <span className="gtv-wheel-chip-hover-name" style={{ fontSize }}>
                        {group.root.name}
                      </span>
                    </button>
                    <div
                      className="gtv-wheel-chip-toolbar"
                      style={
                        {
                          "--gtv-node-fill": chipColor,
                          "--gtv-toolbar-icon-color": "#ffffff",
                        } as React.CSSProperties
                      }
                      onPointerDown={(event) => event.stopPropagation()}
                    >
                      <NodeToolbar
                        node={group.root}
                        itemCount={aggregatedItemCount}
                        playingNodeId={playingNodeId}
                        playState={playState}
                        onPlayPause={onPlayPause}
                        onAddChild={onAddChild}
                        onRenameRequest={onRenameRequest}
                        onDeleteRequest={onDeleteRequest}
                        onReparentRequest={onReparentRequest}
                        additionalActions={additionalActions}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="gtv-wheel-floating-controls">
        {centerSubtreeHierarchy && (
          <div className="gtv-zoom-controls">
            <button
              type="button"
              className={["gtv-zoom-btn", isPopExpanded && "gtv-zoom-btn--selected"].filter(Boolean).join(" ")}
              onClick={() => setIsPopExpanded((expanded) => !expanded)}
              aria-label={isPopExpanded ? "Hide Mainstream Pop sub-genres" : "Show Mainstream Pop sub-genres"}
              aria-pressed={isPopExpanded}
            >
              <MdBlurCircular className="gtv-icon" size={18} />
            </button>
          </div>
        )}

        <div className="gtv-zoom-controls">
          <button
            type="button"
            className={["gtv-zoom-btn", !panZoom.canZoomIn && "gtv-zoom-btn--disabled"].filter(Boolean).join(" ")}
            disabled={!panZoom.canZoomIn}
            onClick={panZoom.zoomIn}
            aria-label="Zoom in"
          >
            <MdZoomIn className="gtv-icon" size={18} />
          </button>
          <button
            type="button"
            className={["gtv-zoom-btn", !panZoom.canZoomOut && "gtv-zoom-btn--disabled"].filter(Boolean).join(" ")}
            disabled={!panZoom.canZoomOut}
            onClick={panZoom.zoomOut}
            aria-label="Zoom out"
          >
            <MdZoomOut className="gtv-icon" size={18} />
          </button>
          <button
            type="button"
            className="gtv-zoom-btn"
            onClick={() =>
              panZoom.fitToFrame([wheelCircleRef.current, ...queryTreeContentElements(popSvgRef.current)])
            }
            aria-label="Fit to frame"
          >
            <MdFitScreen className="gtv-icon" size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
