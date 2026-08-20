"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MdFitScreen, MdZoomIn, MdZoomOut } from "react-icons/md";
import * as d3 from "d3";

import { GenreTree } from "./GenreTree";
import { calculateLocalRootDimensions } from "./NodeHelper";
import { NodeToolbar } from "./NodeToolbar";
import { GenreTreeRootGroup, groupNodesByRoot } from "./root-grouping";
import { calculateWheelRadiusForAngles, computeRadialLayout, RadialSlot } from "./radial-wheel-geometry";
import { usePanZoom } from "./use-pan-zoom";
import { queryTreeContentElements } from "./zoom-pan";
import { GenreTreeNode, GenreTreeProps, TreeOrientation } from "./types";
import {
  calculateNodeDimensions,
  calculateNodeFontSize,
  getGenreTreeColor,
  getItemCountRange,
  MAX_NODE_WIDTH,
  PER_TREE_ACCENT_DOT,
  tintSurface,
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

type CardinalDirection = "top" | "right" | "bottom" | "left";

const CARDINAL_DIRECTION_BY_ANGLE: Record<number, CardinalDirection> = {
  0: "top",
  90: "right",
  180: "bottom",
  270: "left",
};

// Each cardinal grows its subtree straight away from the wheel's center, never at an angle, so
// labels always stay horizontal (see the plan's confirmed design decision #7).
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
 * All root genres distributed evenly around a full circle centered in its container, with up to 4
 * of them — one per cardinal direction — developed (full subtree mounted) at once. Clicking any
 * chip, developed or not, re-lays-out the whole ring so that root lands on the right and
 * recalculates the other 3 cardinals from scratch; the 3 non-clicked developed trees render
 * dimmed, brightening on hover/focus. Unlike `WheelCore`, there's no single wheel-wide rotation
 * to animate — every root's angle is recomputed fresh from `(groups.length, topIndex,
 * LANDING_ANGLE)` each render, then unwrapped per chip (see `continuousAngleByRootId`) so each
 * chip's own CSS transition always takes its own shortest path instead of snapping through a
 * 360deg/0deg wraparound.
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
  onUploadFiles,
}: WheelRadialCoreProps) {
  const groups = useMemo(() => groupNodesByRoot(nodes), [nodes]);

  const [topRootId, setTopRootId] = useState<string | null>(groups[0]?.root.id ?? null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const panZoom = usePanZoom(viewportRef);
  const wheelCircleRef = useRef<HTMLDivElement>(null);
  const anchorRefs = useRef<Partial<Record<CardinalDirection, HTMLDivElement | null>>>({});

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

  const wheelRadius = useMemo(
    () => calculateWheelRadiusForAngles(layout.map((slot) => slot.angle), MAX_NODE_WIDTH, WHEEL_RADIUS),
    [layout],
  );

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

  // Read via a ref rather than depending on `onRootSelect` directly — consumers commonly pass an
  // inline callback, which would otherwise re-fire this effect (and any state it sets) every render.
  const onRootSelectRef = useRef(onRootSelect);
  useEffect(() => {
    onRootSelectRef.current = onRootSelect;
  });

  useEffect(() => {
    if (effectiveTopRootId) onRootSelectRef.current?.(effectiveTopRootId);
  }, [effectiveTopRootId]);

  const cardinalByDirection = useMemo(() => {
    const map: Partial<Record<CardinalDirection, GenreTreeRootGroup>> = {};
    layout.forEach((slot, index) => {
      if (slot.isCardinal) {
        map[CARDINAL_DIRECTION_BY_ANGLE[slot.angle]] = groups[index];
      }
    });
    return map;
  }, [layout, groups]);

  const handleChipClick = (rootId: string) => {
    setTopRootId(rootId);
  };

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
          {(["top", "right", "bottom", "left"] as const).map((direction) => {
            const group = cardinalByDirection[direction];
            if (!group) return null;

            // The anchor's clearance from the wheel's center must match the hidden root's own
            // rendered half-width/half-height inside its mounted <GenreTree> — tree-renderer
            // sizes that root off an item-count range local to just this one subtree, not the
            // cross-root `rootItemCountRange` the visible ring chip below is deliberately scaled
            // against, so it's computed separately here via the same rollup+range pipeline.
            const localRootDimensions = calculateLocalRootDimensions(d3, group.nodes);
            const chipHalfExtent =
              (direction === "top" || direction === "bottom" ? localRootDimensions.HEIGHT : localRootDimensions.WIDTH) / 2;
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
                style={{ [CARDINAL_OFFSET_PROP[direction]]: wheelRadius + chipHalfExtent } as React.CSSProperties}
              >
                <GenreTree
                  key={group.root.id}
                  nodes={group.nodes}
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
                  onUploadFiles={onUploadFiles}
                />
              </div>
            );
          })}

          <div className="gtv-wheel-circle" ref={wheelCircleRef} />

          {centerLabel && <div className="gtv-wheel-center-label">{centerLabel}</div>}

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
                          // Height comes from --gtv-wheel-chip-base-height (see .gtv-wheel-chip in
                          // styles.css), not an inline `height`/`minHeight` — an inline `height` always
                          // wins the cascade over the CSS class's `height: calc(...)` hover override
                          // (inline style beats any stylesheet rule), silently pinning the box and
                          // breaking the hover growth again, same failure mode as before.
                          "--gtv-wheel-chip-base-height": `${dimensions.HEIGHT}px`,
                          "--gtv-chip-color": chipColor,
                          "--gtv-hover-label-height": `${dimensions.HEIGHT}px`,
                          // Non-cardinal roots aren't developed as a full subtree, so the ring chip
                          // is their only surface — give it the same root-color wash tree nodes get
                          // (see tintSurface) instead of leaving it plain white. Cardinal chips keep
                          // the solid fill from .gtv-wheel-chip--selected below.
                          ...(!selected && { background: tintSurface(chipColor) }),
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
                        hardcoded color. --gtv-toolbar-icon-color matches the chip's own label
                        color so the icons stay legible against a selected chip's solid fill. */}
                    <div
                      className="gtv-wheel-chip-toolbar"
                      style={
                        {
                          "--gtv-node-fill": selected ? chipColor : tintSurface(chipColor),
                          "--gtv-toolbar-icon-color": selected ? "#ffffff" : "#52525b",
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
                        onUploadFiles={onUploadFiles}
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
          onClick={() =>
            panZoom.fitToFrame([
              wheelCircleRef.current,
              ...Object.values(anchorRefs.current).flatMap((el) => queryTreeContentElements(el)),
            ])
          }
          aria-label="Fit to frame"
        >
          <MdFitScreen className="gtv-icon" size={18} />
        </button>
      </div>
    </div>
  );
}
