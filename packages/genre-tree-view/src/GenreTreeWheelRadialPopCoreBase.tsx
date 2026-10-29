"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";

import { createDeferredClick } from "./defer-click";
import { buildTreeHierarchyStructure } from "./NodeHelper";
import { GenreTreeRootGroup, groupNodesByRoot } from "./root-grouping";
import { useTreeIndex } from "./use-tree-index";
import { splitRootGroupBySide } from "./pop-core-split";
import {
  buildCoreHierarchy,
  calculateCoreSubtreeRadialExtent,
  computeCoreRadialLayout,
} from "./core-radial-layout";
import {
  buildPopHierarchy,
  calculateMainstreamPopOuterCircleRadius,
  calculatePopSubtreeRadialExtent,
  computeCenterRadialLayout,
  computePopRadialLayout,
  coreRadiusOfDepth,
  getRadialPointOnCircle,
  hideCollidingLabels,
  LABEL_CHAR_WIDTH_RATIO,
  renderRootLabels,
  measureWedge,
  popRadiusOfDepth,
  POP_SUBTREE_OUTER_MARGIN,
  POP_WEDGE_SPAN_DEGREES,
  renderPopSubtree,
  type RootLabelDatum,
} from "./pop-core-radial-layout";
import {
  buildSectorClipPathPolygon,
  computeRadialLayout,
  computeSectorWidths,
  findSectorAtAngle,
  pickEmptyLabelSpot,
  RadialSlot,
  solveRingRadius,
  subdivideWedge,
} from "./radial-wheel-geometry";
import { FloatingControls } from "./FloatingControls";
import { usePanZoom } from "./use-pan-zoom";
import { queryTreeContentElements } from "./zoom-pan";
import { useNodeInfoPanel } from "./use-node-info-panel";
import { useFocusHistory } from "./use-focus-history";
import { WheelBreadcrumb } from "./WheelBreadcrumb";
import { resolveInfoPanelObscuredArea } from "./info-panel-geometry";
import { InfoPanel, InfoPanelChild } from "./InfoPanel";
import { OverlayPanel } from "./OverlayPanel";
import { isZoomableNode, resolvePopCoreFrame } from "./pop-core-frame";
import { GenreTreeNode, GenreTreeProps } from "./types";
import {
  ACCENT_COLOR,
  calculateNodeDotRadius,
  calculateSelectedNodeBorderWidth,
  CENTER_NODE_NAME,
  getGenreNodeColor,
  getGenreNodeStyle,
  getItemCountRange,
  hexToRgba,
  INFO_PANEL_WIDTH,
  isMainstreamPopLineage,
  NODE_DOT_MAX_RADIUS,
  POP_TREE_DEPTH_RADIAL_SPACING,
  ROOT_SECTOR_FILL_OPACITY,
  LABEL_RELAYOUT_DEBOUNCE_MS,
  REGION_LABEL_MAX_PX,
  REGION_LABEL_MIN_PX,
  REGION_LABEL_TARGET_PX,
  WHEEL_POP_CORE_RADIUS,
  WHEEL_ROTATION_EASING,
  WHEEL_ROTATION_TRANSITION_MS,
  ZOOM_FOCUS_SCALE,
  shadeSurface,
  UNDERGROUND_DARKEN_RATIO,
} from "./constants";

/** Why `onFocusChange` fired: the info panel's "Zoom in" button or a node double-click, the parent ("back") /
 * root-view buttons and breadcrumb, a `selectedNodeId` outside the current zoom (e.g. a search result), or a
 * `focusNodeId` that isn't zoomable (see `isZoomableNode`). */
export type FocusChangeReason = "zoom-in" | /** @deprecated no longer emitted */ "previous" | "back" | "root" | "search" | "rejected";

/** Focus is controlled-only: pass both props or neither, since the wheel never moves its own focus. */
export type PopCoreFocusProps =
  | { focusNodeId?: undefined; onFocusChange?: undefined }
  | {
      /** Renders this node's subtree as its own wheel instead of the whole tree (null) — its single
       * pop child (if any) becomes the center disc, its other children the ring roots. An id that
       * isn't zoomable (see `isZoomableNode`) renders the whole tree and fires
       * `onFocusChange(null, "rejected")` once. */
      focusNodeId: string | null;
      /** Fired with the node to focus and why: any zoomable node from its info panel's "Zoom in"
       * or a double-click on it or its label (`"zoom-in"`), the focus node's parent (`"back"`), null for the whole tree (`"root"`),
       * the selection's top-level root — or null when that root is Mainstream Pop or the selection
       * is itself a root — when `selectedNodeId` lies outside the zoom (`"search"`), and null when
       * `focusNodeId` isn't zoomable (`"rejected"`). Omit both props to hide the zoom-in and back
       * controls and never refocus on an outside selection. */
      onFocusChange: (id: string | null, reason: FocusChangeReason) => void;
    };

export type WheelRadialPopCoreProps = Omit<GenreTreeProps, "nodes" | "rootColor" | "orientation"> & {
  nodes: GenreTreeNode[];
  /** Fired whenever the top (just-clicked) root changes — on mount with the default selection,
   * and on every chip click. */
  onRootSelect?: (rootId: string) => void;
  /** When false, clicking a chip still fires `onRootSelect`, but the ring stays at its current
   * rotation instead of bringing the clicked root to the landing angle. Defaults to true. */
  allowWheelRotation?: boolean;
} & PopCoreFocusProps;

// The wheel always lands the just-clicked root on the right (matches WheelRadialCore's own
// landingAngle=90 convention) — see computeRadialLayout's doc comment for why.
const LANDING_ANGLE = 90;

// Clearance (px) between neighbouring ring root chips along the ring.
const CHIP_GAP = 16;

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

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
    const laps =
      previousAngle === undefined
        ? 0
        : Math.round((previousAngle - rawAngle) / 360);
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
  onNodeClick,
  onNodeHover,
  additionalActions,
  showToolbar = true,
  renderInfoPanelBody,
  onSelectedNodeChange,
  hideInfoPanelClose = false,
  hideInfoPanelTitle = false,
  itemCountLabel,
  readOnly,
  renderDangerZone,
  expanded,
  onExpandedChange,
  collapsed,
  hideExpandButton,
  overlayPanel,
  wheelZoom,
  defaultViewport,
  onViewportChange,
  controlsOrientation = "vertical",
  floatingControlsLeading,
  allowWheelRotation = true,
  selectedNodeId,
  focusNodeId: requestedFocusNodeId = null,
  onFocusChange,
}: WheelRadialPopCoreProps) {
  const index = useTreeIndex(nodes);
  // A focus the zoom buttons couldn't have produced (stale URL, deleted node, ...) renders the
  // unfocused wheel and asks the consumer to reset it, instead of letting resolvePopCoreFrame throw.
  const focusNodeId = useMemo(
    () => (requestedFocusNodeId !== null && isZoomableNode(nodes, requestedFocusNodeId) ? requestedFocusNodeId : null),
    [nodes, requestedFocusNodeId],
  );
  const isFocusRejected = requestedFocusNodeId !== null && focusNodeId === null;
  useEffect(() => {
    if (isFocusRejected) onFocusChange?.(null, "rejected");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- report each rejected id once, not on every new callback identity
  }, [isFocusRejected, requestedFocusNodeId]);
  const { center: layoutCenterNode, centerHasPopDisc, centerNodes: centerSubtreeNodes, ringNodes } = useMemo(
    () => resolvePopCoreFrame(nodes, focusNodeId),
    [nodes, focusNodeId],
  );
  // The frame rewrites a focused view's center/ring roots to parentId: null for layout only —
  // anything handed to the consumer or the info panel gets the original node instead.
  const centerNode = index.byId.get(layoutCenterNode.id)!;
  // A parent with several pop children can't be a focus, so Root view is the only way up from there.

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
    if (!centerHasPopDisc) return [layoutCenterNode];
    const { childrenByParentId } = index;
    const coreChildren = (childrenByParentId.get(layoutCenterNode.id) ?? []).filter(
      (child) => child.side !== "pop",
    );
    const subtree: GenreTreeNode[] = [layoutCenterNode];
    const stack = [...coreChildren];
    while (stack.length > 0) {
      const current = stack.pop()!;
      subtree.push(current);
      stack.push(...(childrenByParentId.get(current.id) ?? []));
    }
    return subtree;
  }, [index, layoutCenterNode, centerHasPopDisc]);

  const centerSubtreeHierarchy = useMemo(
    () =>
      centerCoreSubtreeNodes.length > 1
        ? buildTreeHierarchyStructure(d3, centerCoreSubtreeNodes)
        : null,
    [centerCoreSubtreeNodes],
  );
  // The center "Mainstream Pop" node's own subtree is always shown when it has one; without one the
  // center chip stays a plain disc.
  const isPopExpanded = centerSubtreeHierarchy != null;

  const groups = useMemo(() => groupNodesByRoot(ringNodes), [ringNodes]);

  const splitByRootId = useMemo(
    () =>
      new Map(
        groups.map((group) => [group.root.id, splitRootGroupBySide(group)]),
      ),
    [groups],
  );
  const ringRootById = useMemo(
    () => new Map(groups.flatMap((group) => group.nodes.map((node) => [node.id, group.root]))),
    [groups],
  );
  // Every chip, dot and InfoPanel header takes this, so a genre looks the same in every zoom frame.
  const getNodeVisualStyle = useCallback(
    (node: GenreTreeNode) => getGenreNodeStyle(index, node.id),
    [index],
  );

  const [topRootId, setTopRootId] = useState<string | null>(
    groups[0]?.root.id ?? null,
  );
  // Tracks which root the ring is actually rotated to show at the landing angle — kept separate
  // from topRootId so a click can still fire onRootSelect (via topRootId) without moving the ring
  // when allowWheelRotation is false. Only updated on click when allowWheelRotation is true, so it
  // can lag behind topRootId until the next click after rotation is re-enabled.
  const [rotationTopRootId, setRotationTopRootId] = useState<string | null>(
    groups[0]?.root.id ?? null,
  );
  const [renderedFocusNodeId, setRenderedFocusNodeId] = useState(focusNodeId);
  if (renderedFocusNodeId !== focusNodeId) {
    setRenderedFocusNodeId(focusNodeId);
    setTopRootId(groups[0]?.root.id ?? null);
    setRotationTopRootId(groups[0]?.root.id ?? null);
  }
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const panZoom = usePanZoom(viewportRef, wheelZoom, stageRef, { defaultViewport, onViewportChange });
  // Shared across every mounted sector (ring roots' pop/core branches, and the center subtree) —
  // exactly one hook instance for the whole component instance, so only one panel is ever open at
  // a time regardless of which sector's node was clicked.
  const { panel: openPanel, showNodeInfo, closeNodeInfo } = useNodeInfoPanel({ selectedNodeId, onSelectedNodeChange });
  // Derived per frame, not closed by an effect: a focus change can leave the open (or selected)
  // node outside the drawn subtree, and nothing orders such an effect against the selection one.
  // The focus node itself counts: when it has a pop child that child is the drawn center, so the
  // node zoomed into from its panel isn't drawn but its panel should stay open.
  const isInFrame = (id: string) => id === focusNodeId || centerSubtreeNodeIds.has(id) || ringRootById.has(id);
  const panel = openPanel && isInFrame(openPanel.node.id) ? openPanel : null;
  const { previous: previousSelectedId, markPreviousRequested } = useFocusHistory(
    panel?.node.id ?? null,
    isInFrame,
  );
  const selectNodeFromPanel = (id: string) => {
    const targetNode = index.byId.get(id)!;
    const element = viewportRef.current!.querySelector(`#group-${CSS.escape(id)}`);
    panZoom.centerOnElement(
      element,
      ZOOM_FOCUS_SCALE,
      resolveInfoPanelObscuredArea(element, viewportRef.current, INFO_PANEL_WIDTH),
    );
    showNodeInfo(targetNode, element ?? viewportRef.current, viewportRef.current);
  };
  // Read via a ref inside the D3 render effect below rather than depending on `panZoom` directly —
  // its identity changes every render, which would otherwise re-run (and re-mount the whole D3
  // tree) on every pan/zoom, exactly what that effect's own dependency list is designed to avoid.
  const centerOnElementRef = useRef(panZoom.centerOnElement);
  useEffect(() => {
    centerOnElementRef.current = panZoom.centerOnElement;
  });
  const showNodeInfoRef = useRef(showNodeInfo);
  useEffect(() => {
    showNodeInfoRef.current = showNodeInfo;
  });
  // Double-click mirrors the info panel's "Zoom in" button.
  const chipClickRef = useRef(createDeferredClick());
  useEffect(() => {
    const deferred = chipClickRef.current;
    return deferred.cancel;
  }, []);
  const focusOnNode = (id: string) => {
    chipClickRef.current.cancel();
    if (!onFocusChange || reparentingNodeId || id === focusNodeId || !isZoomableNode(nodes, id)) return;
    closeNodeInfo();
    onFocusChange(id, "zoom-in");
  };
  const focusOnNodeRef = useRef(focusOnNode);
  useEffect(() => {
    focusOnNodeRef.current = focusOnNode;
  });
  // Read via a ref so a consumer's fresh closure each render doesn't re-mount the D3 tree.
  const onNodeHoverRef = useRef(onNodeHover);
  useEffect(() => {
    onNodeHoverRef.current = onNodeHover;
  });
  const { zoomScale } = panZoom;
  const zoomScaleRef = useRef(zoomScale);
  useEffect(() => {
    zoomScaleRef.current = zoomScale;
  });
  const wheelCircleRef = useRef<HTMLDivElement>(null);
  const popSvgRef = useRef<SVGSVGElement>(null);
  const centerChipRef = useRef<HTMLButtonElement>(null);
  const regionLabelRef = useRef<HTMLDivElement>(null);
  // Stage-space (pre pan/zoom) position and font size of the current root's name, so it pans and
  // scales with the tree between re-placements.
  const [regionLabel, setRegionLabel] = useState<{
    rootId: string;
    x: number;
    y: number;
    fontSize: number;
  } | null>(null);

  // Falls back to the first root without writing state back when the explicitly selected root
  // disappears from `nodes` — avoids a setState-in-effect cascading render for derived state.
  const effectiveTopRootId = groups.some((group) => group.root.id === topRootId)
    ? topRootId
    : (groups[0]?.root.id ?? null);
  const effectiveRotationTopRootId = groups.some(
    (group) => group.root.id === rotationTopRootId,
  )
    ? rotationTopRootId
    : (groups[0]?.root.id ?? null);
  const topIndex = Math.max(
    groups.findIndex((group) => group.root.id === effectiveRotationTopRootId),
    0,
  );

  const rootItemCountById = useMemo(
    () => new Map(groups.map((group) => [group.root.id, group.root.itemCount])),
    [groups],
  );

  // Pop-subtree node cards scale against the whole tree's item counts, not just their own subtree's
  // — a pop chain's few nodes can have a narrow itemCount spread that would otherwise get stretched
  // across the full size range and render wildly inconsistent card sizes next to core siblings.
  // Root counts included so root circles and node dots share one track-count scale.
  const wheelItemCountRange = useMemo(
    () =>
      getItemCountRange([
        ...nodes,
        ...[...rootItemCountById.values()].map((itemCount) => ({ itemCount })),
      ]),
    [nodes, rootItemCountById],
  );

  const isCenterMainstream = isMainstreamPopLineage(index, centerNode.id);
  const centerNodeColor = isCenterMainstream ? "#ffffff" : getGenreNodeStyle(index, centerNode.id).fill;
  const centerChipDiameter = 2 * calculateNodeDotRadius(centerNode.itemCount, wheelItemCountRange);

  const branchHierarchiesByRootId = useMemo(
    () =>
      new Map(
        groups.map((group) => {
          const split = splitByRootId.get(group.root.id);
          return [
            group.root.id,
            {
              pop: (split?.popBranches ?? []).map((branch) => buildPopHierarchy(d3, branch.nodes)),
              core: (split?.coreBranches ?? []).map((branch) => buildCoreHierarchy(d3, branch.nodes)),
            },
          ];
        }),
      ),
    [groups, splitByRootId],
  );

  // How far past the ring roots' own circle the tallest developed root's pop wedge reaches —
  // computed as a delta (base radius 0) since the actual base (coreRootCircleRadius) isn't known
  // yet; folded into coreRootCircleRadius below, then re-applied at the real base for rendering.
  const maxPopExtentDelta = useMemo(() => {
    let extent = 0;
    branchHierarchiesByRootId.forEach(({ pop }) => {
      pop.forEach((hierarchy) => {
        extent = Math.max(extent, calculatePopSubtreeRadialExtent(hierarchy, 0));
      });
    });
    return extent;
  }, [branchHierarchiesByRootId]);

  // The mainstream circle's radius from the wheel's true center — how far the center node's own
  // subtree reaches, or the center chip's own disc when it has none. The deepest pop node must
  // clear this, not just some fixed distance past the ring roots' own circle.
  const mainstreamCircleRadius = useMemo(
    () =>
      centerSubtreeHierarchy
        ? calculateMainstreamPopOuterCircleRadius(
            centerSubtreeHierarchy,
            0,
            POP_TREE_DEPTH_RADIAL_SPACING,
          )
        : centerChipDiameter / 2,
    [centerSubtreeHierarchy, centerChipDiameter],
  );

  // How far past the ring roots' own circle the deepest developed root's core branch reaches —
  // same idea as maxPopExtentDelta. Core branches render outward from coreRootCircleRadius
  // regardless of its value, so this doesn't belong in coreRootCircleRadius itself (that would
  // needlessly drag the visual outer circle and ring root chips outward with it) — it only feeds
  // svgCanvasRadius below, so the deepest core branch has enough SVG canvas to render into
  // without being clipped.
  const maxCoreExtentDelta = useMemo(() => {
    let extent = 0;
    branchHierarchiesByRootId.forEach(({ core }) => {
      core.forEach((hierarchy) => {
        extent = Math.max(
          extent,
          calculateCoreSubtreeRadialExtent(hierarchy, POP_TREE_DEPTH_RADIAL_SPACING, 0),
        );
      });
    });
    return extent;
  }, [branchHierarchiesByRootId]);

  // Pins coreRootCircleRadius so the deepest node of the deepest developed pop branch (which
  // climbs inward from coreRootCircleRadius by a fixed depthSpacing per depth step — see
  // computePopRadialLayout) has its card clear the mainstream circle by the usual half-width +
  // outer margin, rather than leaving that gap to whatever coreRootCircleRadius happens to be for
  // other reasons. Zero (dropped from the Math.max below) when no root has a pop branch at all.
  const popReachRequiredRadius = useMemo(
    () =>
      maxPopExtentDelta > 0 ? mainstreamCircleRadius + maxPopExtentDelta : 0,
    [mainstreamCircleRadius, maxPopExtentDelta],
  );

  // Angles (rad) each root's pop branches, core branches and chip need at ring radius `radius`.
  const measureBranchNeedsAt = useCallback(
    (radius: number) =>
      new Map(
        groups.map((group) => {
          const { pop, core } = branchHierarchiesByRootId.get(group.root.id)!;
          const chipWidth =
            2 * calculateNodeDotRadius(rootItemCountById.get(group.root.id)!, wheelItemCountRange);
          return [
            group.root.id,
            {
              pop: pop.map((hierarchy) =>
                measureWedge(
                  d3,
                  hierarchy,
                  popRadiusOfDepth(radius, POP_TREE_DEPTH_RADIAL_SPACING),
                  wheelItemCountRange,
                ),
              ),
              core: core.map((hierarchy) =>
                measureWedge(
                  d3,
                  hierarchy,
                  coreRadiusOfDepth(radius, POP_TREE_DEPTH_RADIAL_SPACING),
                  wheelItemCountRange,
                ),
              ),
              chip: 2 * Math.asin(Math.min(1, (chipWidth / 2 + CHIP_GAP) / radius)),
            },
          ];
        }),
      ),
    [groups, branchHierarchiesByRootId, rootItemCountById, wheelItemCountRange],
  );

  // The visual outer circle's radius (--gtv-wheel-radius) and, equally, where every ring root's
  // own chip sits — NOT the SVG canvas size (see svgCanvasRadius below). The smallest radius at
  // which every root's measured need fits the full circle, floored so ring root chips clear the
  // mainstream circle and the deepest pop branch clears it too. Deliberately excludes
  // maxCoreExtentDelta: a deep core branch needs canvas room, not a bigger ring.
  const coreRootCircleRadius = useMemo(
    () =>
      solveRingRadius(
        (radius) =>
          [...measureBranchNeedsAt(radius).values()].reduce(
            (total, needs) => total + Math.max(sum(needs.pop), sum(needs.core), needs.chip),
            0,
          ),
        Math.max(
          WHEEL_POP_CORE_RADIUS,
          mainstreamCircleRadius + NODE_DOT_MAX_RADIUS + POP_SUBTREE_OUTER_MARGIN,
          popReachRequiredRadius,
        ),
      ),
    [measureBranchNeedsAt, mainstreamCircleRadius, popReachRequiredRadius],
  );

  const branchNeedsByRootId = useMemo(
    () => measureBranchNeedsAt(coreRootCircleRadius),
    [measureBranchNeedsAt, coreRootCircleRadius],
  );

  // Each root's sector is the angle it measurably needs at the solved ring radius — the widest of
  // its pop wedge, its core wedge (disjoint radius bands) and its own chip — so slack is shared in
  // proportion to real need rather than node count.
  const rootWeights = useMemo(
    () =>
      groups.map((group) => {
        const needs = branchNeedsByRootId.get(group.root.id)!;
        return Math.max(sum(needs.pop), sum(needs.core), needs.chip);
      }),
    [groups, branchNeedsByRootId],
  );

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
    setAngleMemo({
      layout,
      angles: computeContinuousAngles(groups, layout, angleMemo.angles),
    });
  }
  const continuousAngleByRootId = angleMemo.angles;

  // Real angular sector each ring root owns, proportional to its own weight (rootWeights) out of
  // the total — same widths computeRadialLayout placed chips with, so a root's pop/core wedge below
  // is guaranteed to fit within its actual sector without spilling into a neighbor's.
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
    (rootId: string) => sectorSpanByRootId.get(rootId) ?? POP_WEDGE_SPAN_DEGREES,
    [sectorSpanByRootId],
  );

  // Each root's own single angle on the ring — unlike a branch's sub-wedge angle (which fans that
  // branch's subtree out at its own position within the root's wedge), a link from the root down
  // to any of its branches must originate from the root's own unique chip position.
  const rootAngleByRootId = useMemo(() => {
    const map = new Map<string, number>();
    groups.forEach((group, index) => {
      map.set(group.root.id, layout[index]?.angle ?? 0);
    });
    return map;
  }, [groups, layout]);

  // A root's wedge is subdivided across its own pop (resp. core) branches by each branch's
  // measured need — mirrors how ring roots themselves share the full circle.
  const placeBranches = useCallback(
    (side: "pop" | "core") => {
      const map = new Map<
        string,
        { hierarchy: d3.HierarchyNode<GenreTreeNode>; angle: number; span: number }[]
      >();
      groups.forEach((group) => {
        const hierarchies = branchHierarchiesByRootId.get(group.root.id)![side];
        if (hierarchies.length === 0) return;
        const slices = subdivideWedge(
          rootAngleByRootId.get(group.root.id)!,
          wedgeSpanForRoot(group.root.id),
          branchNeedsByRootId.get(group.root.id)![side],
        );
        map.set(
          group.root.id,
          hierarchies.map((hierarchy, branchIndex) => ({
            hierarchy,
            angle: slices[branchIndex]!.centerDeg,
            span: slices[branchIndex]!.spanDeg,
          })),
        );
      });
      return map;
    },
    [groups, branchHierarchiesByRootId, branchNeedsByRootId, rootAngleByRootId, wedgeSpanForRoot],
  );
  const popHierarchyByRootId = useMemo(() => placeBranches("pop"), [placeBranches]);
  const coreHierarchyByRootId = useMemo(() => placeBranches("core"), [placeBranches]);

  // The SVG canvas's actual radius. Core branches render outward from the real coreRootCircleRadius
  // (see computeCoreRadialLayout's call below), so the canvas must extend maxCoreExtentDelta past
  // that actual base — not past the ring-radius floor, which can be smaller than coreRootCircleRadius
  // whenever pop reach or the center subtree is what's sizing it — or the deepest core
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

    popHierarchyByRootId.forEach((branches, rootId) => {
      const rootLinkOrigin = getRadialPointOnCircle(
        rootAngleByRootId.get(rootId) ?? 0,
        coreRootCircleRadius,
      );

      const sectorGroup = originGroup
        .append("g")
        .attr("class", "gtv-wheel-pop-sector")
        .attr("data-gtv-root-id", rootId);

      branches.forEach(({ hierarchy, angle, span }, branchIndex) => {
        const laidOut = computePopRadialLayout(
          d3,
          hierarchy,
          angle,
          coreRootCircleRadius,
          span,
          POP_TREE_DEPTH_RADIAL_SPACING,
          wheelItemCountRange,
        );
        const reparentForbiddenIds = reparentingNodeId
          ? (laidOut
              .descendants()
              .find((d) => d.data.id === reparentingNodeId)
              ?.descendants()
              .map((d) => d.data.id) ?? [])
          : [];

        const branchGroup = sectorGroup
          .append("g")
          .attr("class", "gtv-wheel-pop-branch")
          .attr("data-gtv-branch-index", branchIndex);

        renderPopSubtree(
          d3,
          branchGroup,
          laidOut,
          getGenreNodeColor(index, rootId),
          reparentingNodeId,
          reparentForbiddenIds,
          {
            onPlayPause,
            onAddChild,
            onRenameRequest,
            onDeleteRequest,
            onReparentRequest,
            onReparentTargetSelect: (newParentId) => {
              if (reparentingNodeId)
                void onReparent?.(reparentingNodeId, newParentId);
            },
            onNodeClick: (data, event, clickedElement) => {
              centerOnElementRef.current(
                clickedElement,
                ZOOM_FOCUS_SCALE,
                resolveInfoPanelObscuredArea(clickedElement, viewportRef.current, INFO_PANEL_WIDTH),
              );
              showNodeInfoRef.current(
                data,
                clickedElement,
                viewportRef.current,
              );
              onNodeClick?.(data, event);
            },
            onNodeDoubleClick: (data) => focusOnNodeRef.current(data.id),
            onNodeHover: (data) => onNodeHoverRef.current?.(data),
            additionalActions,
            playingNodeId,
            playState,
          },
          wheelItemCountRange,
          {
            rootLinkOrigin,
            selectedNodeId: panel?.node.id ?? null,
            nodeFillOf: (node) => getGenreNodeStyle(index, node.id).fill,
          },
        );
      });
    });

    coreHierarchyByRootId.forEach((branches, rootId) => {
      const rootLinkOrigin = getRadialPointOnCircle(
        rootAngleByRootId.get(rootId) ?? 0,
        coreRootCircleRadius,
      );

      const sectorGroup = originGroup
        .append("g")
        .attr("class", "gtv-wheel-core-sector")
        .attr("data-gtv-root-id", rootId);

      branches.forEach(({ hierarchy, angle, span }, branchIndex) => {
        const undergroundIds = new Set(
          hierarchy
            .descendants()
            .filter((d) => d.ancestors().some((a) => a.data.scene === "underground"))
            .map((d) => d.data.id),
        );
        const laidOut = computeCoreRadialLayout(
          d3,
          hierarchy,
          angle,
          span,
          coreRootCircleRadius,
          POP_TREE_DEPTH_RADIAL_SPACING,
          wheelItemCountRange,
        );
        const reparentForbiddenIds = reparentingNodeId
          ? (laidOut
              .descendants()
              .find((d) => d.data.id === reparentingNodeId)
              ?.descendants()
              .map((d) => d.data.id) ?? [])
          : [];

        const branchGroup = sectorGroup
          .append("g")
          .attr("class", "gtv-wheel-core-branch")
          .attr("data-gtv-branch-index", branchIndex);

        renderPopSubtree(
          d3,
          branchGroup,
          laidOut,
          getGenreNodeColor(index, rootId),
          reparentingNodeId,
          reparentForbiddenIds,
          {
            onPlayPause,
            onAddChild,
            onRenameRequest,
            onDeleteRequest,
            onReparentRequest,
            onReparentTargetSelect: (newParentId) => {
              if (reparentingNodeId)
                void onReparent?.(reparentingNodeId, newParentId);
            },
            onNodeClick: (data, event, clickedElement) => {
              centerOnElementRef.current(
                clickedElement,
                ZOOM_FOCUS_SCALE,
                resolveInfoPanelObscuredArea(clickedElement, viewportRef.current, INFO_PANEL_WIDTH),
              );
              showNodeInfoRef.current(
                data,
                clickedElement,
                viewportRef.current,
              );
              onNodeClick?.(data, event);
            },
            onNodeDoubleClick: (data) => focusOnNodeRef.current(data.id),
            onNodeHover: (data) => onNodeHoverRef.current?.(data),
            additionalActions,
            playingNodeId,
            playState,
          },
          wheelItemCountRange,
          {
            isCoreSector: true,
            rootLinkOrigin,
            selectedNodeId: panel?.node.id ?? null,
            nodeFillOf: (node) => {
              const fill = getGenreNodeStyle(index, node.id).fill;
              return undergroundIds.has(node.id) ? shadeSurface(fill, UNDERGROUND_DARKEN_RATIO) : fill;
            },
          },
        );
      });
    });

    if (centerSubtreeHierarchy) {
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

      const centerSectorGroup = originGroup
        .append("g")
        .attr("class", "gtv-wheel-center-sector");

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
            if (reparentingNodeId)
              void onReparent?.(reparentingNodeId, newParentId);
          },
          onNodeClick: (data, event, clickedElement) => {
            centerOnElementRef.current(
              clickedElement,
              ZOOM_FOCUS_SCALE,
              resolveInfoPanelObscuredArea(clickedElement, viewportRef.current, INFO_PANEL_WIDTH),
            );
            showNodeInfoRef.current(
              data,
              clickedElement,
              viewportRef.current,
            );
            onNodeClick?.(data, event);
          },
          onNodeDoubleClick: (data) => focusOnNodeRef.current(data.id),
          onNodeHover: (data) => onNodeHoverRef.current?.(data),
          additionalActions,
          playingNodeId,
          playState,
        },
        wheelItemCountRange,
        {
          skipRootNode: true,
          isMainstreamSector: isCenterMainstream,
          selectedNodeId: panel?.node.id ?? null,
          nodeFillOf: (node) => getGenreNodeStyle(index, node.id).fill,
        },
      );
    }

    // Each branch draws its own links, so a later branch's links would paint over earlier ones' labels.
    const linksLayer = originGroup.insert("g", ":first-child").attr("class", "gtv-wheel-links").node()!;
    originGroup.selectAll<SVGPathElement, unknown>("path.gtv-link").each(function () {
      linksLayer.appendChild(this);
    });

    renderRootLabels(originGroup, [
      {
        id: centerNode.id,
        name: centerNode.name,
        x: 0,
        y: 0,
        radius: centerChipDiameter / 2,
        itemCount: centerNode.itemCount,
        alwaysShown: true,
      },
      ...groups.map((group) => {
        const itemCount = rootItemCountById.get(group.root.id)!;
        const { x, y } = getRadialPointOnCircle(rootAngleByRootId.get(group.root.id) ?? 0, coreRootCircleRadius);
        return {
          id: group.root.id,
          name: group.root.name,
          x,
          y,
          radius: calculateNodeDotRadius(itemCount, wheelItemCountRange),
          itemCount,
        };
      }),
    ]);
    hideCollidingLabels(d3, originGroup, wheelItemCountRange, zoomScaleRef.current);
    // A root's name usually spills past its chip, so the label itself forwards clicks to the chip.
    originGroup
      .selectAll<SVGGElement, RootLabelDatum>("g.gtv-root-label")
      .select("text")
      .style("pointer-events", "all")
      .style("cursor", "pointer")
      .on("click", (_event, d) => {
        const chip =
          d.id === centerNode.id
            ? centerChipRef.current
            : viewportRef.current?.querySelector<HTMLButtonElement>(`#group-${CSS.escape(d.id)}`);
        chip?.click();
      })
      .on("dblclick", (_event, d) => focusOnNodeRef.current(d.id));
  }, [
    centerNode,
    centerHasPopDisc,
    centerChipDiameter,
    groups,
    rootItemCountById,
    index,
    popHierarchyByRootId,
    coreHierarchyByRootId,
    coreRootCircleRadius,
    svgCanvasRadius,
    mainstreamCircleRadius,
    rootAngleByRootId,
    reparentingNodeId,
    playingNodeId,
    playState,
    onPlayPause,
    onAddChild,
    onRenameRequest,
    onDeleteRequest,
    onReparentRequest,
    onReparent,
    onNodeClick,
    additionalActions,
    centerSubtreeHierarchy,
    centerNodeColor,
    isCenterMainstream,
    wheelItemCountRange,
    panel?.node.id,
  ]);

  // Re-places dot labels once a zoom gesture settles, so the set of named nodes follows the zoom
  // like place names on a map — kept out of the render effect above, which must not re-mount on zoom.
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (popSvgRef.current) hideCollidingLabels(d3, d3.select(popSvgRef.current), wheelItemCountRange, zoomScale);
    }, LABEL_RELAYOUT_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [zoomScale, wheelItemCountRange]);

  // Google Maps-style region label: once pan/zoom settles with the viewport center inside a ring
  // root's sector whose own chip is off-screen, names that root in an empty spot. Kept in place
  // until it leaves the viewport, its root changes, or zoom drifts its on-screen size out of range.
  const { panX, panY } = panZoom;
  useEffect(() => {
    const timeout = setTimeout(() => {
      const viewport = viewportRef.current;
      const wheel = wheelCircleRef.current;
      if (!viewport || !wheel) return;
      const vp = viewport.getBoundingClientRect();
      const wheelRect = wheel.getBoundingClientRect();
      const wheelX = wheelRect.left + wheelRect.width / 2;
      const wheelY = wheelRect.top + wheelRect.height / 2;
      const sectors = groups.map((group) => ({
        id: group.root.id,
        center: continuousAngleByRootId.get(group.root.id) ?? 0,
        span: sectorSpanByRootId.get(group.root.id) ?? 360,
      }));
      const rootIdAt = (x: number, y: number) =>
        Math.hypot(x - wheelX, y - wheelY) <= mainstreamCircleRadius * zoomScale
          ? null
          : findSectorAtAngle((Math.atan2(x - wheelX, wheelY - y) * 180) / Math.PI, sectors);
      const isOnScreen = (r: DOMRect) =>
        r.right > vp.left && r.left < vp.right && r.bottom > vp.top && r.top < vp.bottom;

      const rootId = rootIdAt(vp.left + vp.width / 2, vp.top + vp.height / 2);
      const chip = rootId && viewport.querySelector(`#group-${CSS.escape(rootId)}`);
      if (!rootId || !chip || isOnScreen(chip.getBoundingClientRect())) {
        setRegionLabel(null);
        return;
      }

      const shown = regionLabelRef.current?.getBoundingClientRect();
      const shownPx = (regionLabel?.fontSize ?? 0) * zoomScale;
      if (
        regionLabel?.rootId === rootId &&
        shown &&
        shown.left >= vp.left &&
        shown.right <= vp.right &&
        shown.top >= vp.top &&
        shown.bottom <= vp.bottom &&
        shownPx >= REGION_LABEL_MIN_PX &&
        shownPx <= REGION_LABEL_MAX_PX
      )
        return;

      const name = index.byId.get(rootId)?.name ?? "";
      const obstacles = Array.from(
        viewport.querySelectorAll(
          ".gtv-node-dot, .gtv-node-label:not(.gtv-node-label--hidden), .gtv-root-label, .gtv-wheel-chip, .gtv-wheel-floating-controls, .gtv-info-panel",
        ),
      )
        .map((element) => element.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0)
        .map((r) => ({ x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }));
      const inset = REGION_LABEL_TARGET_PX / 2;
      const spot = pickEmptyLabelSpot(
        { x0: vp.left + inset, y0: vp.top + inset, x1: vp.right - inset, y1: vp.bottom - inset },
        name.length * REGION_LABEL_TARGET_PX * LABEL_CHAR_WIDTH_RATIO,
        REGION_LABEL_TARGET_PX,
        obstacles,
        (x, y) => rootIdAt(x, y) === rootId,
      );
      setRegionLabel(
        spot && {
          rootId,
          x: (spot.x - vp.left - panX) / zoomScale,
          y: (spot.y - vp.top - panY) / zoomScale,
          fontSize: REGION_LABEL_TARGET_PX / zoomScale,
        },
      );
    }, LABEL_RELAYOUT_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [
    panX,
    panY,
    zoomScale,
    groups,
    continuousAngleByRootId,
    sectorSpanByRootId,
    mainstreamCircleRadius,
    index,
    regionLabel,
  ]);

  // Starts the view fit to the wheel + rendered pop sectors instead of at scale 1 / pan (0, 0) —
  // guarded so it only fires once popSvgRef has actually rendered content, and never again
  // afterward so it doesn't fight the user's own pan/zoom on later selections/expansions.
  const hasInitialFitRef = useRef(false);
  useEffect(() => {
    hasInitialFitRef.current = false;
  }, [focusNodeId]);
  useEffect(() => {
    if (hasInitialFitRef.current) return;
    const elements = [
      wheelCircleRef.current,
      ...queryTreeContentElements(popSvgRef.current),
    ];
    if (!elements.some(Boolean)) return;
    hasInitialFitRef.current = true;
    panZoom.fitToFrame(elements, { silent: true });
  });

  const handleChipClick = (rootId: string) => {
    setTopRootId(rootId);
    if (allowWheelRotation) setRotationTopRootId(rootId);
  };

  // Mirrors the onNodeClick/onSelectNode handling below: once the node's sector is mounted, center the viewport on the
  // externally-selected node and open its info panel exactly as a direct click would.
  useEffect(() => {
    if (!selectedNodeId || openPanel?.node.id === selectedNodeId) return;
    const targetNode = index.byId.get(selectedNodeId);
    if (
      targetNode &&
      onFocusChange &&
      !centerSubtreeNodeIds.has(selectedNodeId) &&
      !ringRootById.has(selectedNodeId)
    ) {
      // Outside the current zoom (e.g. a search result): refocus on its top-level root, whose frame
      // holds its whole subtree (the whole tree for Mainstream Pop's lineage or a root itself);
      // this effect re-runs once the new frame is drawn.
      const [root] = index.ancestorsOf(selectedNodeId);
      onFocusChange(root && root.name !== CENTER_NODE_NAME && isZoomableNode(nodes, root.id) ? root.id : null, "search");
      return;
    }
    const element = viewportRef.current?.querySelector(
      `#group-${CSS.escape(selectedNodeId)}`,
    );
    if (!targetNode || !element) return;
    panZoom.centerOnElement(
      element,
      ZOOM_FOCUS_SCALE,
      resolveInfoPanelObscuredArea(element, viewportRef.current, INFO_PANEL_WIDTH),
    );
    showNodeInfo(targetNode, element, viewportRef.current, { notify: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- panZoom re-created on pan/zoom; guarded by the openPanel?.node.id check above
  }, [selectedNodeId, index, openPanel, showNodeInfo, centerSubtreeNodeIds, ringRootById]);

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
        color: hexToRgba(
          getGenreNodeColor(index, group.root.id),
          ROOT_SECTOR_FILL_OPACITY,
        ),
      };
    });
  }, [groups, continuousAngleByRootId, sectorSpanByRootId]);

  return (
    <div
      ref={viewportRef}
      className={[
        "gtv-wheel-container",
        "gtv-wheel-container--radial",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={
        {
          "--gtv-wheel-radius": `${coreRootCircleRadius}px`,
          "--gtv-wheel-svg-radius": `${svgCanvasRadius}px`,
          "--gtv-wheel-rotation-transition-ms": `${WHEEL_ROTATION_TRANSITION_MS}ms`,
          "--gtv-wheel-rotation-easing": WHEEL_ROTATION_EASING,
          touchAction: panZoom.touchAction,
        } as React.CSSProperties
      }
      onPointerDown={panZoom.handlePointerDown}
    >
      <div
        ref={stageRef}
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

          {isPopExpanded && (
            <div
              className="gtv-wheel-middle-circle"
              style={
                {
                  "--gtv-wheel-middle-radius": `${middleCircleFloor}px`,
                } as React.CSSProperties
              }
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

            {isPopExpanded && (
              <div
                className="gtv-wheel-middle-tint"
                style={
                  {
                    "--gtv-wheel-middle-radius": `${middleCircleFloor}px`,
                  } as React.CSSProperties
                }
              />
            )}
          </div>

          <svg
            ref={popSvgRef}
            className="gtv-wheel-pop-layer"
            width={svgCanvasRadius * 2}
            height={svgCanvasRadius * 2}
          />

          <div className="gtv-wheel-center-node">
            <div className="gtv-wheel-chip-anchor">
              <button
                ref={centerChipRef}
                type="button"
                className={[
                  "gtv-wheel-chip",
                  centerHasPopDisc && "gtv-wheel-chip--center",
                  "gtv-wheel-chip--circle",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={
                  {
                    width: centerChipDiameter,
                    "--gtv-wheel-chip-base-height": `${centerChipDiameter}px`,
                    "--gtv-chip-color": centerNodeColor,
                    ...(panel?.node.id === centerNode.id && {
                      borderColor: ACCENT_COLOR,
                      borderWidth: calculateSelectedNodeBorderWidth(centerChipDiameter / 2),
                    }),
                  } as React.CSSProperties
                }
                onClick={(event) => {
                  const chip = event.currentTarget;
                  const nativeEvent = event.nativeEvent;
                  chipClickRef.current.schedule(() => {
                    panZoom.centerOnElement(
                      chip,
                      ZOOM_FOCUS_SCALE,
                      resolveInfoPanelObscuredArea(chip, viewportRef.current, INFO_PANEL_WIDTH),
                    );
                    if (!reparentingNodeId) {
                      showNodeInfo(centerNode, chip, viewportRef.current);
                      onNodeClick?.(centerNode, nativeEvent);
                    }
                  });
                }}
                onDoubleClick={() => focusOnNode(centerNode.id)}
                aria-label={centerNode.name}
              />
            </div>
          </div>

          <div className="gtv-wheel">
            {dividerAngles.map((angle, index) => (
              <div
                key={`divider-${groups[index].root.id}`}
                className="gtv-wheel-divider"
                style={
                  {
                    "--gtv-divider-angle": `${angle}deg`,
                  } as React.CSSProperties
                }
              />
            ))}

            {groups.map((group, groupIndex) => {
              const slot = layout[groupIndex];
              const root = index.byId.get(group.root.id)!;
              const angle =
                continuousAngleByRootId.get(group.root.id) ?? slot?.angle ?? 0;
              const chipColor = getGenreNodeStyle(index, group.root.id).fill;
              const rootItemCount = rootItemCountById.get(
                group.root.id,
              )!;
              const diameter = 2 * calculateNodeDotRadius(rootItemCount, wheelItemCountRange);
              return (
                <div
                  key={group.root.id}
                  className="gtv-wheel-slot"
                  style={
                    { "--gtv-chip-angle": `${angle}deg` } as React.CSSProperties
                  }
                >
                  <div className="gtv-wheel-chip-anchor">
                    <button
                      type="button"
                      id={`group-${group.root.id}`}
                      className="gtv-wheel-chip gtv-wheel-chip--selected gtv-wheel-chip--circle"
                      style={
                        {
                          width: diameter,
                          "--gtv-wheel-chip-base-height": `${diameter}px`,
                          "--gtv-chip-color": chipColor,
                          ...(panel?.node.id === group.root.id && {
                            borderColor: ACCENT_COLOR,
                            borderWidth: calculateSelectedNodeBorderWidth(diameter / 2),
                          }),
                        } as React.CSSProperties
                      }
                      aria-label={group.root.name}
                      onPointerEnter={() => onNodeHover?.(root)}
                      onClick={(event) => {
                        const chip = event.currentTarget;
                        const nativeEvent = event.nativeEvent;
                        chipClickRef.current.schedule(() => {
                          panZoom.centerOnElement(
                            chip,
                            ZOOM_FOCUS_SCALE,
                            resolveInfoPanelObscuredArea(chip, viewportRef.current, INFO_PANEL_WIDTH),
                          );
                          handleChipClick(group.root.id);
                          if (!reparentingNodeId) {
                            showNodeInfo(root, chip, viewportRef.current);
                            onNodeClick?.(root, nativeEvent);
                          }
                        });
                      }}
                      onDoubleClick={() => focusOnNode(group.root.id)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {regionLabel && index.byId.has(regionLabel.rootId) && (
          <div
            ref={regionLabelRef}
            className="gtv-wheel-region-label"
            aria-hidden="true"
            style={
              {
                "--gtv-region-label-x": `${regionLabel.x}px`,
                "--gtv-region-label-y": `${regionLabel.y}px`,
                "--gtv-region-label-size": `${regionLabel.fontSize}px`,
                "--gtv-region-label-color": getGenreNodeColor(index, regionLabel.rootId),
              } as React.CSSProperties
            }
          >
            {index.byId.get(regionLabel.rootId)!.name}
          </div>
        )}
      </div>

      {panel && (
        <InfoPanel
          node={panel.node}
          {...getNodeVisualStyle(panel.node)}
          parentNode={(() => {
            const parent = index.byId.get(index.byId.get(panel.node.id)?.parentId ?? "");
            return parent
              ? { node: parent, ...getNodeVisualStyle(parent) }
              : null;
          })()}
          childNodes={(index.childrenByParentId.get(panel.node.id) ?? []).map(
            (n) => ({ node: n, ...getNodeVisualStyle(n) }),
          )}
          ancestorNodes={index.ancestorsOf(panel.node.id).map(
            (n): InfoPanelChild => ({ node: n, ...getNodeVisualStyle(n) }),
          )}
          side={panel.side}
          onClose={closeNodeInfo}
          onSelectNode={selectNodeFromPanel}
          onPrevious={
            typeof previousSelectedId === "string"
              ? () => {
                  markPreviousRequested(previousSelectedId);
                  selectNodeFromPanel(previousSelectedId);
                }
              : undefined
          }
          previousLabel={typeof previousSelectedId === "string" ? index.byId.get(previousSelectedId)?.name : undefined}
          hideClose={hideInfoPanelClose}
          hideTitle={hideInfoPanelTitle}
          itemCountLabel={itemCountLabel}
          readOnly={readOnly}
          renderDangerZone={renderDangerZone}
          expanded={expanded}
          onExpandedChange={onExpandedChange}
          collapsed={collapsed}
          hideExpandButton={hideExpandButton}
          actions={
            showToolbar && !reparentingNodeId
              ? {
                  playingNodeId,
                  playState,
                  onPlayPause,
                  onAddChild,
                  onRenameRequest,
                  onDeleteRequest,
                  onReparentRequest,
                  additionalActions,
                }
              : undefined
          }
          renderInfoPanelBody={renderInfoPanelBody}
          onZoomIn={
            onFocusChange && panel.node.id !== focusNodeId && isZoomableNode(nodes, panel.node.id)
              ? () => onFocusChange(panel.node.id, "zoom-in")
              : undefined
          }
        />
      )}
      {overlayPanel && <OverlayPanel {...overlayPanel} />}

      {onFocusChange && focusNodeId !== null && (
        <WheelBreadcrumb
          key={focusNodeId}
          ancestors={index.ancestorsOf(focusNodeId).filter((ancestor) => isZoomableNode(nodes, ancestor.id))}
          currentName={index.byId.get(focusNodeId)?.name}
          onHome={() => {
            closeNodeInfo();
            onFocusChange(null, "root");
          }}
          onAncestor={(id) => {
            closeNodeInfo();
            onFocusChange(id, "back");
          }}
        />
      )}

      <FloatingControls
        panZoom={panZoom}
        orientation={controlsOrientation}
        leading={floatingControlsLeading}
        onFit={() => panZoom.fitToFrame([
                wheelCircleRef.current,
                ...queryTreeContentElements(popSvgRef.current),
              ])}
      />
    </div>
  );
}
