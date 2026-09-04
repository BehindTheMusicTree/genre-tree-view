"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MdFitScreen, MdZoomIn, MdZoomOut } from "react-icons/md";
import * as d3 from "d3";

import { NodeToolbar } from "./NodeToolbar";
import { GenreTreeRootGroup, groupNodesByRoot } from "./root-grouping";
import { buildCoreHierarchy, calculateCoreSubtreeRadialExtent, computeCoreRadialLayout } from "./core-radial-layout";
import { getRadialPointOnCircle, POP_WEDGE_SPAN_DEGREES, renderPopSubtree } from "./pop-core-radial-layout";
import { splitRootGroupBySide } from "./pop-core-split";
import {
  buildSectorClipPathPolygon,
  calculateWheelRadiusForAngles,
  computeRadialLayout,
  computeSectorWidths,
  RadialSlot,
} from "./radial-wheel-geometry";
import { usePanZoom } from "./use-pan-zoom";
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
  WHEEL_RADIUS,
  WHEEL_ROTATION_EASING,
  WHEEL_ROTATION_TRANSITION_MS,
} from "./constants";

export interface WheelRadialCoreProps extends Omit<GenreTreeProps, "nodes" | "rootColor" | "orientation"> {
  nodes: GenreTreeNode[];
  /** Fired whenever the top (just-clicked) root changes — on mount with the default selection,
   * and on every chip click. */
  onRootSelect?: (rootId: string) => void;
  /** Optional label centered on the wheel's pivot point, e.g. a brand name. */
  centerLabel?: string;
}

// The wheel always lands the just-clicked root on the right (matches GenreTreeWheelRight's own
// landingAngle=90 convention) — see computeRadialLayout's doc comment for why.
const LANDING_ANGLE = 90;

// Unwraps computeRadialLayout's [0, 360)-wrapped angles into each root's own continuous
// (possibly >360 or negative) angle, nearest to its `previous` value — see the doc comment where
// this is used in WheelRadialCore for why plain wrapped angles cause a wrong-direction transition.
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
 * All root genres distributed around a full circle centered in its container, each one's angular
 * width proportional to its own subtree's node count (see `computeRadialLayout`), every one of
 * them fully developed (full subtree mounted) at once. Clicking any chip re-lays-out the whole
 * ring so that root lands on the right and recalculates every other root's angle from scratch.
 * Unlike `WheelCore`, there's no single wheel-wide rotation to animate — every root's angle is
 * recomputed fresh from `(rootWeights, topIndex, LANDING_ANGLE)` each render, then unwrapped
 * per chip (see `continuousAngleByRootId`) so each chip's own CSS transition always takes its own
 * shortest path instead of snapping through a 360deg/0deg wraparound.
 *
 * Each root's own subtree fans outward from the wheel's circle in polar coordinates (see
 * `computeCoreRadialLayout`), within an 80deg wedge centered on the root's angle — the same wedge
 * geometry and shared `<svg>` layer used by the pop/core wheel.
 */
export function WheelRadialCore({
  nodes,
  className,
  onRootSelect,
  centerLabel,
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
}: WheelRadialCoreProps) {
  const groups = useMemo(() => groupNodesByRoot(nodes), [nodes]);

  const [topRootId, setTopRootId] = useState<string | null>(groups[0]?.root.id ?? null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const panZoom = usePanZoom(viewportRef);
  const wheelCircleRef = useRef<HTMLDivElement>(null);
  const coreSvgRef = useRef<SVGSVGElement>(null);

  // Falls back to the first root without writing state back when the explicitly selected root
  // disappears from `nodes` — avoids a setState-in-effect cascading render for derived state.
  const effectiveTopRootId = groups.some((group) => group.root.id === topRootId)
    ? topRootId
    : (groups[0]?.root.id ?? null);
  const topIndex = Math.max(
    groups.findIndex((group) => group.root.id === effectiveTopRootId),
    0,
  );

  // Weighted by each root's own rendered core branch (splitRootGroupBySide), not group.nodes.length
  // — group.nodes also includes the root's pop branch (see coreHierarchyByRootId below), which this
  // component never renders, so weighting by it would inflate a root's slice past what it actually
  // draws whenever it has a large hidden pop branch.
  const rootWeights = useMemo(
    () => groups.map((group) => splitRootGroupBySide(group).coreNodes.length),
    [groups],
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
  // Recomputed by comparing against `layout` right in the render body (React's sanctioned
  // "adjusting state during render" pattern — see the React docs on storing info from previous
  // renders) rather than in an effect, so there's no extra committed frame with stale angles.
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

  // Node cards scale against the whole tree's item counts, not just their own subtree's — a
  // shallow root's few nodes can have a narrow itemCount spread that would otherwise get stretched
  // across the full size range and render wildly inconsistent card sizes next to deeper siblings.
  const wheelItemCountRange = useMemo(() => getItemCountRange(nodes), [nodes]);

  // Only roots that actually have children get a hierarchy built — a childless root has nothing
  // to fan outward. A root's pop-side branch (splitRootGroupBySide) is excluded here the same way
  // GenreTreeWheelRadialPopCoreBase excludes it, since this component has no separate pop
  // rendering path and mixing both branches' direct children into buildCoreHierarchy would leave
  // more than one node with no in-set parent — d3.stratify() rejects that as "multiple roots".
  const coreHierarchyByRootId = useMemo(() => {
    const map = new Map<string, { hierarchy: d3.HierarchyNode<GenreTreeNode>; angle: number }>();
    groups.forEach((group, index) => {
      const { coreNodes } = splitRootGroupBySide(group);
      const coreChildNodes = coreNodes.filter((node) => node.id !== group.root.id);
      if (coreChildNodes.length === 0) return;
      map.set(group.root.id, { hierarchy: buildCoreHierarchy(d3, coreChildNodes), angle: layout[index]?.angle ?? 0 });
    });
    return map;
  }, [groups, layout]);

  // Real angular sector each ring root owns, proportional to its own weight (rootWeights) out of
  // the total — same widths computeRadialLayout placed chips with, so a root's wedge below is
  // guaranteed to fit within its actual sector without spilling into a neighbor's, regardless of
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

  // Floor every ring root sits on, driven purely by chip clearance — the base every root's
  // core wedge measures outward from, before the deepest developed subtree's extent is folded in.
  const chipClearanceFloor = useMemo(
    () => calculateWheelRadiusForAngles(layout.map((slot) => slot.angle), MAX_NODE_WIDTH, WHEEL_RADIUS),
    [layout],
  );

  // How far past the ring roots' own circle the deepest developed root's subtree reaches —
  // computed as a delta (base radius 0) since the actual base (wheelRadius) isn't known yet;
  // folded into wheelRadius below, then re-applied at the real base for rendering.
  const maxCoreExtentDelta = useMemo(() => {
    let extent = 0;
    coreHierarchyByRootId.forEach(({ hierarchy }) => {
      extent = Math.max(extent, calculateCoreSubtreeRadialExtent(hierarchy, POP_TREE_DEPTH_RADIAL_SPACING, 0));
    });
    return extent;
  }, [coreHierarchyByRootId]);

  const wheelRadius = useMemo(
    () => Math.max(chipClearanceFloor, chipClearanceFloor + maxCoreExtentDelta),
    [chipClearanceFloor, maxCoreExtentDelta],
  );

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
    if (!coreSvgRef.current) return;

    const svg = d3.select(coreSvgRef.current);
    svg.selectAll("*").remove();
    const originGroup = svg.append("g").attr("transform", `translate(${wheelRadius}, ${wheelRadius})`);

    coreHierarchyByRootId.forEach(({ hierarchy, angle }, rootId) => {
      const laidOut = computeCoreRadialLayout(
        d3,
        hierarchy,
        angle,
        wedgeSpanForRoot(rootId),
        wheelRadius,
        POP_TREE_DEPTH_RADIAL_SPACING,
      );
      const rootLinkOrigin = getRadialPointOnCircle(angle, wheelRadius);
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
        { isCoreSector: true, radialReferenceRadius: wheelRadius, rootLinkOrigin },
      );
    });
  }, [
    coreHierarchyByRootId,
    wheelRadius,
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
    wheelItemCountRange,
  ]);

  // Starts the view fit to the wheel + rendered subtrees instead of at scale 1 / pan (0, 0) —
  // guarded so it only fires once anchored content has actually rendered, and never again
  // afterward so it doesn't fight the user's own pan/zoom on later selections.
  const hasInitialFitRef = useRef(false);
  useEffect(() => {
    if (hasInitialFitRef.current) return;
    const elements = [wheelCircleRef.current, coreSvgRef.current];
    if (!elements.some(Boolean)) return;
    hasInitialFitRef.current = true;
    panZoom.fitToFrame(elements);
  });

  const handleChipClick = (rootId: string) => {
    setTopRootId(rootId);
  };

  // One divider per boundary between two angularly-adjacent roots — each root's own continuous
  // (unwrapped) angle plus half its weight-proportional width (sectorSpanByRootId) lands exactly on
  // the boundary with its next neighbor, since computeRadialLayout tiled the roots' widths
  // contiguously around the circle in the first place.
  const dividerAngles = useMemo(() => {
    if (groups.length <= 1) return [];
    return groups.map((group) => {
      const angle = continuousAngleByRootId.get(group.root.id) ?? 0;
      const width = sectorSpanByRootId.get(group.root.id) ?? 0;
      return angle + width / 2;
    });
  }, [groups, continuousAngleByRootId, sectorSpanByRootId]);

  // One tinted sector fan per root, bounded by its own weight-proportional width rather than
  // bisected neighbor angles — see computeSectorWidths's doc comment for why bisection
  // under/over-shoots a root's true sector when its neighbors' weights differ a lot from its own.
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
          "--gtv-wheel-radius": `${wheelRadius}px`,
          "--gtv-wheel-rotation-transition-ms": `${WHEEL_ROTATION_TRANSITION_MS}ms`,
          "--gtv-wheel-rotation-easing": WHEEL_ROTATION_EASING,
        } as React.CSSProperties
      }
      onPointerDown={panZoom.handlePointerDown}
    >
      {/* height: 100% (not just width) so this is the containing block the radial stage's own
          top/left: 50% measure against — see the equivalent comment on GenreTreeWheelBase. */}
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

          {/* Sector wash sits in its own .gtv-wheel layer, rendered before the node svg below, so
              the wash paints under the developed nodes instead of dulling them — see the second
              .gtv-wheel layer (after the svg) for the dividers/chips, which stay above the nodes. */}
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
          </div>

          <svg ref={coreSvgRef} className="gtv-wheel-pop-layer" width={wheelRadius * 2} height={wheelRadius * 2} />

          {centerLabel && <div className="gtv-wheel-center-label">{centerLabel}</div>}

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
                          // Height comes from --gtv-wheel-chip-base-height (see .gtv-wheel-chip in
                          // styles.css), not an inline `height`/`minHeight` — an inline `height` always
                          // wins the cascade over the CSS class's `height: calc(...)` hover override
                          // (inline style beats any stylesheet rule), silently pinning the box and
                          // breaking the hover growth again, same failure mode as before.
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
                    {/* stopPropagation: keeps toolbar-button clicks from also landing on
                        panZoom's pointerdown-drag tracking on the container behind it.
                        --gtv-node-fill: same var .gtv-toolbar reads in the SVG tree, so the
                        overlay masks the chip's label with the chip's own fill instead of a
                        hardcoded color. Every chip has the same solid fill now (see
                        .gtv-wheel-chip in styles.css), so --gtv-toolbar-icon-color is white
                        unconditionally to stay legible against it. */}
                    <div
                      className="gtv-wheel-chip-toolbar"
                      style={
                        {
                          "--gtv-node-fill": chipColor,
                          "--gtv-toolbar-icon-color": "#ffffff",
                          "--gtv-toolbar-font-size": `${fontSize}px`,
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
          onClick={() => panZoom.fitToFrame([wheelCircleRef.current, coreSvgRef.current])}
          aria-label="Fit to frame"
        >
          <MdFitScreen className="gtv-icon" size={18} />
        </button>
      </div>
    </div>
  );
}
