"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MdBlurCircular, MdFitScreen, MdZoomIn, MdZoomOut } from "react-icons/md";
import * as d3 from "d3";

import { GenreTree } from "./GenreTree";
import { buildTreeHierarchyStructure, calculateRootAnchorClearance } from "./NodeHelper";
import { NodeToolbar } from "./NodeToolbar";
import { GenreTreeRootGroup, groupNodesByRoot } from "./root-grouping";
import { splitRootGroupBySide } from "./pop-core-split";
import {
  buildPopHierarchy,
  calculateMainstreamPopOuterCircleRadius,
  calculatePopSubtreeRadialExtent,
  computeCenterRadialLayout,
  computePopRadialLayout,
  renderPopSubtree,
} from "./pop-core-radial-layout";
import { calculateWheelRadiusForAngles, computeRadialLayout, RadialSlot } from "./radial-wheel-geometry";
import { usePanZoom } from "./use-pan-zoom";
import { queryTreeContentElements } from "./zoom-pan";
import { GenreTreeNode, GenreTreeProps, TreeOrientation } from "./types";
import {
  calculateNodeDimensions,
  calculateNodeFontSize,
  getGenreTreeColor,
  getItemCountRange,
  MAINSTREAM_POP_OUTER_CIRCLE_GAP,
  MAINSTREAM_POP_ROOT_CIRCLE_GAP,
  MAX_NODE_WIDTH,
  PER_TREE_ACCENT_DOT,
  POP_TREE_DEPTH_RADIAL_SPACING,
  WHEEL_MINI_TREE_DEPTH_SPACING_SCALE,
  WHEEL_MINI_TREE_SCALE,
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

type CardinalDirection = "top" | "right" | "bottom" | "left";

const CARDINAL_DIRECTION_BY_ANGLE: Record<number, CardinalDirection> = {
  0: "top",
  90: "right",
  180: "bottom",
  270: "left",
};

const CARDINAL_ANGLE_BY_DIRECTION: Record<CardinalDirection, number> = {
  top: 0,
  right: 90,
  bottom: 180,
  left: 270,
};

// Each cardinal grows its core subtree straight away from the wheel's center, never at an angle,
// so labels always stay horizontal (see the plan's confirmed design decision #7).
const CARDINAL_ORIENTATION: Record<CardinalDirection, TreeOrientation> = {
  top: "vertical",
  right: "horizontal-anchored",
  bottom: "vertical-flipped",
  left: "horizontal-anchored-flipped",
};

// Which side of each anchor's box the selected root's own chip half-extent clearance is applied
// to (see .gtv-wheel-radial-tree-anchor--* in styles.css) — the side the box is pushed further
// away from the wheel's center along.
const CARDINAL_OFFSET_PROP: Record<CardinalDirection, "top" | "right" | "bottom" | "left"> = {
  top: "bottom",
  right: "left",
  bottom: "top",
  left: "right",
};

/**
 * Same ring/cardinal-anchor mechanics as `WheelRadialCore`, with two differences: each developed
 * cardinal's outward subtree renders only its *core* (non-pop) branch (`side !== "pop"`), and — if
 * that root also has a pop branch — that pop subtree renders as a full interactive tree fanned out
 * *inside* the wheel's own circle, in the cardinal's own quadrant, instead of being hidden. The
 * circle grows past its normal chip-clearance floor as needed to fit the largest developed pop
 * subtree (see `calculatePopSubtreeRadialExtent`).
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

  const centerSubtreeHierarchy = useMemo(
    () => (centerSubtreeNodes.length > 1 ? buildTreeHierarchyStructure(d3, centerSubtreeNodes) : null),
    [centerSubtreeNodes],
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
  const anchorRefs = useRef<Partial<Record<CardinalDirection, HTMLDivElement | null>>>({});
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

  const layout = useMemo(
    () => computeRadialLayout(groups.length, topIndex, LANDING_ANGLE),
    [groups.length, topIndex],
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
  const centerNodeColor = useMemo(() => getGenreTreeColor(centerNode.id), [centerNode]);
  // Collapsed, the center chip reads as a circular pivot rather than a rectangular card like the
  // ring chips — a perfect circle needs equal width/height, so pick the larger of the two.
  const centerChipDiameter = Math.max(centerNodeDimensions.WIDTH, centerNodeDimensions.HEIGHT);
  const mainstreamPopRootCircleRadius = useMemo(
    () => Math.max(centerNodeDimensions.WIDTH, centerNodeDimensions.HEIGHT) / 2 + MAINSTREAM_POP_ROOT_CIRCLE_GAP,
    [centerNodeDimensions],
  );

  const cardinalByDirection = useMemo(() => {
    const map: Partial<Record<CardinalDirection, GenreTreeRootGroup>> = {};
    layout.forEach((slot, index) => {
      if (slot.isCardinal) {
        map[CARDINAL_DIRECTION_BY_ANGLE[slot.angle]] = groups[index];
      }
    });
    return map;
  }, [layout, groups]);

  // Only developed cardinals whose root actually has a pop branch get a hierarchy built — the
  // common case (e.g. classical) has none, so this stays empty most of the time.
  const popHierarchyByDirection = useMemo(() => {
    const map = new Map<CardinalDirection, { hierarchy: d3.HierarchyNode<GenreTreeNode>; rootId: string }>();
    (Object.keys(cardinalByDirection) as CardinalDirection[]).forEach((direction) => {
      const group = cardinalByDirection[direction];
      if (!group) return;
      const popNodes = splitByRootId.get(group.root.id)?.popNodes ?? [];
      if (popNodes.length === 0) return;
      map.set(direction, { hierarchy: buildPopHierarchy(d3, popNodes), rootId: group.root.id });
    });
    return map;
  }, [cardinalByDirection, splitByRootId]);

  // Boundary the center Mainstream Pop node's subtree currently occupies — ring roots' own pop
  // wedges get pushed outward past this so they never overlap it (see computePopRadialLayout's
  // innerRadiusFloor param). Collapsed, only the center chip itself occupies that space; expanded,
  // its subtree's own "third circle" (plus clearance gap) does.
  const middleCircleFloor = useMemo(
    () =>
      isPopExpanded && centerSubtreeHierarchy
        ? calculateMainstreamPopOuterCircleRadius(
            centerSubtreeHierarchy,
            mainstreamPopRootCircleRadius,
            POP_TREE_DEPTH_RADIAL_SPACING,
          ) + MAINSTREAM_POP_OUTER_CIRCLE_GAP
        : mainstreamPopRootCircleRadius,
    [isPopExpanded, centerSubtreeHierarchy, mainstreamPopRootCircleRadius],
  );

  // Outermost radius any developed cardinal's own pop wedge actually reaches — used both to grow
  // the wheel and to draw a dedicated boundary marking just the pop region (which can sit well
  // inside the wheel's own edge, e.g. when the center subtree or chip clearance dominates instead).
  const maxPopExtent = useMemo(() => {
    let extent = 0;
    popHierarchyByDirection.forEach(({ hierarchy }) => {
      extent = Math.max(extent, calculatePopSubtreeRadialExtent(hierarchy, middleCircleFloor));
    });
    return extent;
  }, [popHierarchyByDirection, middleCircleFloor]);

  const coreRootCircleRadius = useMemo(() => {
    const chipClearanceFloor = calculateWheelRadiusForAngles(
      layout.map((slot) => slot.angle),
      MAX_NODE_WIDTH,
      WHEEL_POP_CORE_RADIUS,
    );
    const mainstreamPopOuterCircleRadius =
      isPopExpanded && centerSubtreeHierarchy ? middleCircleFloor : 0;
    return Math.max(chipClearanceFloor, maxPopExtent, mainstreamPopOuterCircleRadius);
  }, [layout, maxPopExtent, isPopExpanded, centerSubtreeHierarchy, middleCircleFloor]);

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
      .attr("transform", `translate(${coreRootCircleRadius}, ${coreRootCircleRadius})`);

    popHierarchyByDirection.forEach(({ hierarchy, rootId }, direction) => {
      const laidOut = computePopRadialLayout(
        d3,
        hierarchy,
        CARDINAL_ANGLE_BY_DIRECTION[direction],
        middleCircleFloor,
      );
      const reparentForbiddenIds = reparentingNodeId
        ? (laidOut
            .descendants()
            .find((d) => d.data.id === reparentingNodeId)
            ?.descendants()
            .map((d) => d.data.id) ?? [])
        : [];

      const sectorGroup = originGroup
        .append("g")
        .attr("class", `gtv-wheel-pop-sector gtv-wheel-pop-sector--${direction}`);

      renderPopSubtree(d3, sectorGroup, laidOut, getGenreTreeColor(rootId), reparentingNodeId, reparentForbiddenIds, {
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
      });
    });

    if (isPopExpanded && centerSubtreeHierarchy) {
      const laidOutCenter = computeCenterRadialLayout(
        d3,
        centerSubtreeHierarchy,
        mainstreamPopRootCircleRadius,
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
        true,
      );
    }
  }, [
    popHierarchyByDirection,
    coreRootCircleRadius,
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
    mainstreamPopRootCircleRadius,
    middleCircleFloor,
    centerNodeColor,
  ]);

  // Starts the view fit to the wheel + rendered pop sectors instead of at scale 1 / pan (0, 0) —
  // guarded so it only fires once popSvgRef has actually rendered content, and never again
  // afterward so it doesn't fight the user's own pan/zoom on later selections/expansions.
  const hasInitialFitRef = useRef(false);
  useEffect(() => {
    if (hasInitialFitRef.current) return;
    const elements = [
      wheelCircleRef.current,
      ...Object.values(anchorRefs.current).flatMap((el) => queryTreeContentElements(el)),
      popSvgRef.current,
    ];
    if (!elements.some(Boolean)) return;
    hasInitialFitRef.current = true;
    panZoom.fitToFrame(elements);
  });

  const handleChipClick = (rootId: string) => {
    setTopRootId(rootId);
  };

  return (
    <div
      ref={viewportRef}
      className={["gtv-wheel-container", "gtv-wheel-container--radial", className].filter(Boolean).join(" ")}
      style={
        {
          "--gtv-wheel-radius": `${coreRootCircleRadius}px`,
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
          {(["top", "right", "bottom", "left"] as const).map((direction) => {
            const group = cardinalByDirection[direction];
            if (!group) return null;

            const coreNodes = splitByRootId.get(group.root.id)?.coreNodes ?? group.nodes;

            // See calculateRootAnchorClearance's doc comment (and GenreTreeWheelBase for the
            // equivalent bottom/left-hugging wheel computation) for why the anchor's clearance
            // from the wheel's center needs both the hidden root's own local half-extent and the
            // visible ring chip's cross-root display half-extent, not just one or the other.
            const chipHalfExtent = calculateRootAnchorClearance(
              d3,
              group.nodes,
              aggregatedRootItemCountById.get(group.root.id)!,
              rootItemCountRange,
              direction === "top" || direction === "bottom" ? "HEIGHT" : "WIDTH",
            );
            const secondary = direction !== "right";

            return (
              <div
                key={direction}
                ref={(el) => {
                  anchorRefs.current[direction] = el;
                }}
                className={[
                  "gtv-wheel-radial-tree-anchor",
                  `gtv-wheel-radial-tree-anchor--${direction}`,
                  secondary && "gtv-wheel-radial-tree-anchor--secondary",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={
                  { [CARDINAL_OFFSET_PROP[direction]]: coreRootCircleRadius + chipHalfExtent } as React.CSSProperties
                }
              >
                <GenreTree
                  key={group.root.id}
                  nodes={coreNodes}
                  orientation={CARDINAL_ORIENTATION[direction]}
                  hideRoot
                  interactive={false}
                  rootColor={getGenreTreeColor(group.root.id)}
                  playingNodeId={playingNodeId}
                  playState={playState}
                  reparentingNodeId={reparentingNodeId}
                  onPlayPause={onPlayPause}
                  onAddChild={onAddChild}
                  onRenameRequest={onRenameRequest}
                  onDeleteRequest={onDeleteRequest}
                  onReparentRequest={onReparentRequest}
                  onReparent={onReparent}
                  additionalActions={additionalActions}
                />
              </div>
            );
          })}

          <div className="gtv-wheel-circle" ref={wheelCircleRef} />

          {maxPopExtent > 0 && (
            <div
              className="gtv-wheel-pop-outer-circle"
              style={{ "--gtv-wheel-pop-outer-radius": `${maxPopExtent}px` } as React.CSSProperties}
            />
          )}

          <svg
            ref={popSvgRef}
            className="gtv-wheel-pop-layer"
            width={coreRootCircleRadius * 2}
            height={coreRootCircleRadius * 2}
          />

          <div className="gtv-wheel-center-node">
            <div className="gtv-wheel-chip-anchor">
              <div
                className={["gtv-wheel-chip", !isPopExpanded && "gtv-wheel-chip--circle"].filter(Boolean).join(" ")}
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
                    "--gtv-toolbar-icon-color": "#ffffff",
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
            {groups.map((group, index) => {
              const slot = layout[index];
              const angle = continuousAngleByRootId.get(group.root.id) ?? slot?.angle ?? 0;
              const selected = slot?.isCardinal ?? false;
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
                      className={["gtv-wheel-chip", selected && "gtv-wheel-chip--selected"].filter(Boolean).join(" ")}
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
                  {!selected && (
                    <div
                      className="gtv-wheel-radial-mini-tree"
                      style={{ "--gtv-mini-tree-scale": WHEEL_MINI_TREE_SCALE } as React.CSSProperties}
                    >
                      <GenreTree
                        key={group.root.id}
                        nodes={group.nodes}
                        orientation="vertical"
                        hideRoot
                        interactive={false}
                        rootColor={chipColor}
                        depthSpacingScale={WHEEL_MINI_TREE_DEPTH_SPACING_SCALE}
                      />
                    </div>
                  )}
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
              panZoom.fitToFrame([
                wheelCircleRef.current,
                ...Object.values(anchorRefs.current).flatMap((el) => queryTreeContentElements(el)),
                popSvgRef.current,
              ])
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
