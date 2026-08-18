"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MdFitScreen, MdZoomIn, MdZoomOut } from "react-icons/md";

import { GenreTree } from "./GenreTree";
import { groupNodesByRoot } from "./root-grouping";
import { calculateWheelRadius, computeRotationForSelection, getChipAngle } from "./wheel-geometry";
import { usePanZoom } from "./use-pan-zoom";
import { queryTreeContentElements } from "./zoom-pan";
import { GenreTreeNode, GenreTreeProps, TreeOrientation } from "./types";
import {
  calculateNodeDimensions,
  calculateNodeFontSize,
  getGenreTreeColor,
  getItemCountRange,
  MAX_NODE_HEIGHT,
  MAX_NODE_WIDTH,
  PER_TREE_ACCENT_DOT,
  tintSurface,
  WHEEL_RADIUS,
  WHEEL_ROTATION_EASING,
  WHEEL_ROTATION_TRANSITION_MS,
} from "./constants";

export interface WheelCoreProps extends Omit<GenreTreeProps, "nodes" | "rootColor" | "orientation"> {
  nodes: GenreTreeNode[];
  /** Fired whenever the selected root changes — on mount with the default selection, and on every chip click. */
  onRootSelect?: (rootId: string) => void;
  /** Optional label centered on the wheel's pivot point, e.g. a brand name. Stays upright and
   * fixed regardless of the wheel's rotation. */
  centerLabel?: string;
  /** Which edge of the container the wheel hugs. "bottom" (GenreTreeWheel) lands the selected
   * chip top-center and grows the subtree upward; "left" (GenreTreeWheelRight) lands it
   * right-center and grows the subtree rightward. */
  direction: "bottom" | "left";
}

/**
 * Shared implementation behind both `GenreTreeWheel` (`direction="bottom"`) and
 * `GenreTreeWheelRight` (`direction="left"`): all root genres distributed evenly around a wheel
 * hugging one edge of its container. Clicking a chip rotates the wheel so that root lands at the
 * anchor for that edge, and swaps in its subtree — rendered as a single non-interactive
 * `<GenreTree>` growing away from that anchor. Only the selected root's subtree is ever mounted.
 */
export function WheelCore({
  nodes,
  className,
  onRootSelect,
  centerLabel,
  direction,
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
}: WheelCoreProps) {
  const treeOrientation: TreeOrientation = direction === "left" ? "horizontal-anchored" : "vertical";
  // CSS `rotate()` + `translateY(-radius)` convention: local angle 0°=top, 90°=right, 180°=bottom,
  // 270°=left — measured against the disc's own unrotated box, since its CSS `top`/`left`/`right`
  // position (not its `rotate()` transform, which only spins rendered content around the box's
  // center) is what's pinned to the container's anchor point. The bottom-hugging wheel's box has
  // its top-center pinned there (local angle 0). The left-hugging wheel's box is pinned by its
  // *right* edge (`right: 0` in the `--left` CSS below), i.e. its right-center point — local
  // angle 90 — so the selection has to land at 90, not at the "left" angle (270) the disc bulges
  // toward.
  const landingAngle = direction === "left" ? 90 : 0;
  const chipHalfExtentVar = direction === "left" ? "--gtv-wheel-chip-half-width" : "--gtv-wheel-chip-half-height";

  const groups = useMemo(() => groupNodesByRoot(nodes), [nodes]);

  // The largest a chip can ever render is MAX_NODE_WIDTH (the root with the highest itemCount in
  // range always sits at the top of the scale — see calculateNodeDimensions), so that's the
  // width every neighboring pair of chips needs clearance for, regardless of which root actually
  // ends up at that size. WHEEL_RADIUS is a floor: the wheel never shrinks below its default, only
  // grows to fit more/larger chips.
  const wheelRadius = useMemo(
    () => calculateWheelRadius(groups.length, MAX_NODE_WIDTH, WHEEL_RADIUS),
    [groups.length],
  );
  const wheelViewportHeight = wheelRadius * 2 + MAX_NODE_HEIGHT / 2;

  // A root's own itemCount can under-report its subtree — chip size (and the range it's scaled
  // against) reflects the full subtree total instead, mirroring the tree's own rollup in
  // buildTreeHierarchyStructure. `group.nodes` already holds the root plus every descendant.
  const aggregatedRootItemCountById = useMemo(
    () =>
      new Map(
        groups.map((group) => [group.root.id, group.nodes.reduce((sum, node) => sum + node.itemCount, 0)]),
      ),
    [groups],
  );
  const [selectedRootId, setSelectedRootId] = useState<string | null>(groups[0]?.root.id ?? null);
  // The default selection (chip index 0) must start already rotated to the anchor, not just at
  // 0deg — 0 only happens to be correct for direction="bottom", where landingAngle (0) coincides
  // with chip 0's own raw angle (getChipAngle(0, n) is always 0). For direction="left"
  // (landingAngle 270) those differ, so the initial rotation has to be computed the same way a
  // click's rotation is.
  const [rotationDeg, setRotationDeg] = useState(() =>
    groups.length > 0 ? computeRotationForSelection(0, getChipAngle(0, groups.length), landingAngle) : 0,
  );
  const viewportRef = useRef<HTMLDivElement>(null);
  // One shared pan/zoom transform, applied to the stage below that anchors both the tree and the
  // wheel to the same point — so panning/zooming moves them together with no JS sync required.
  const panZoom = usePanZoom(viewportRef);
  // Fit-to-frame targets: the circle (not .gtv-wheel, which rotates and would inflate its own
  // axis-aligned bounding box) and the tree anchor (only mounted once a root is selected).
  const wheelCircleRef = useRef<HTMLDivElement>(null);
  const treeAnchorRef = useRef<HTMLDivElement>(null);

  // Falls back to the first root without writing state back when the explicitly selected root
  // disappears from `nodes` — avoids a setState-in-effect cascading render for derived state.
  const effectiveRootId = groups.some((group) => group.root.id === selectedRootId)
    ? selectedRootId
    : groups[0]?.root.id ?? null;

  // Read via a ref rather than depending on `onRootSelect` directly — consumers commonly pass an
  // inline callback, which would otherwise re-fire this effect (and any state it sets) every render.
  const onRootSelectRef = useRef(onRootSelect);
  useEffect(() => {
    onRootSelectRef.current = onRootSelect;
  });

  useEffect(() => {
    if (effectiveRootId) onRootSelectRef.current?.(effectiveRootId);
  }, [effectiveRootId]);

  const selectedGroup = groups.find((group) => group.root.id === effectiveRootId) ?? null;

  // Root chip size is proportional to itemCount relative to the other roots on the wheel, not
  // an absolute scale — the root with the fewest items always renders at MIN size and the one
  // with the most always at MAX, regardless of the actual counts involved.
  const rootItemCountRange = useMemo(
    () =>
      getItemCountRange(groups.map((group) => ({ itemCount: aggregatedRootItemCountById.get(group.root.id)! }))),
    [groups, aggregatedRootItemCountById],
  );

  // The selected chip is centered on its wheel anchor point (translate(-50%, -50%)) so it stays
  // centered on the circle like every other chip, but the tree's root lands with its near edge
  // exactly at that same anchor point (see .gtv-wheel-tree-anchor). Left alone, that mismatch makes
  // the chip overlap the tree's near edge — offsetting the anchor by the chip's own half-extent
  // along the growth axis clears it, so the root->depth1 gap reads the same as any other
  // consecutive-depth gap.
  const rootChipHalfExtent = selectedGroup
    ? (direction === "left"
        ? calculateNodeDimensions(aggregatedRootItemCountById.get(selectedGroup.root.id)!, rootItemCountRange).WIDTH
        : calculateNodeDimensions(aggregatedRootItemCountById.get(selectedGroup.root.id)!, rootItemCountRange)
            .HEIGHT) / 2
    : 0;

  const handleChipClick = (rootId: string, angle: number) => {
    setSelectedRootId(rootId);
    setRotationDeg((current) => computeRotationForSelection(current, angle, landingAngle));
  };

  return (
    <div
      ref={viewportRef}
      className={["gtv-wheel-container", direction === "left" && "gtv-wheel-container--left", className]
        .filter(Boolean)
        .join(" ")}
      style={
        {
          "--gtv-wheel-radius": `${wheelRadius}px`,
          "--gtv-wheel-viewport-height": `${wheelViewportHeight}px`,
          "--gtv-wheel-rotation-transition-ms": `${WHEEL_ROTATION_TRANSITION_MS}ms`,
          "--gtv-wheel-rotation-easing": WHEEL_ROTATION_EASING,
        } as React.CSSProperties
      }
      onPointerDown={panZoom.handlePointerDown}
    >
      {/* height: 100% (not just width) so this is the containing block .gtv-wheel-stage's own
          `bottom: var(--gtv-wheel-viewport-height)` measures against — otherwise, with only an
          absolutely-positioned child, this wrapper's height collapses to 0 and the stage's anchor
          point would land at the container's top instead of its bottom. The transform is purely
          visual and doesn't affect this box-model sizing. */}
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
        <div className="gtv-wheel-stage" style={{ [chipHalfExtentVar]: `${rootChipHalfExtent}px` } as React.CSSProperties}>
          {selectedGroup && (
            <div className="gtv-wheel-tree-anchor" ref={treeAnchorRef}>
              <GenreTree
                key={selectedGroup.root.id}
                nodes={selectedGroup.nodes}
                orientation={treeOrientation}
                hideRoot
                interactive={false}
                rootColor={getGenreTreeColor(selectedGroup.root.id)}
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
          )}

          <div className="gtv-wheel-circle" ref={wheelCircleRef} />

          {centerLabel && <div className="gtv-wheel-center-label">{centerLabel}</div>}

          <div className="gtv-wheel" style={{ "--gtv-wheel-rotation": `${rotationDeg}deg` } as React.CSSProperties}>
            {groups.map((group, index) => {
              const angle = getChipAngle(index, groups.length);
              const selected = group.root.id === effectiveRootId;
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
                  <button
                    type="button"
                    className={["gtv-wheel-chip", selected && "gtv-wheel-chip--selected"].filter(Boolean).join(" ")}
                    style={
                      {
                        width: dimensions.WIDTH,
                        height: dimensions.HEIGHT,
                        "--gtv-chip-color": chipColor,
                        // Unselected roots have no mounted subtree here — the ring chip is their
                        // only surface, so give it the same root-color wash tree nodes get (see
                        // tintSurface) instead of leaving it plain white.
                        ...(!selected && { background: tintSurface(chipColor) }),
                      } as React.CSSProperties
                    }
                    onClick={() => handleChipClick(group.root.id, angle)}
                  >
                    {PER_TREE_ACCENT_DOT && <span className="gtv-wheel-chip-dot" />}
                    <span className="gtv-node-label gtv-node-label--root" style={{ fontSize }}>
                      {group.root.name}
                    </span>
                  </button>
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
            panZoom.fitToFrame([wheelCircleRef.current, ...queryTreeContentElements(treeAnchorRef.current)])
          }
          aria-label="Fit to frame"
        >
          <MdFitScreen className="gtv-icon" size={18} />
        </button>
      </div>
    </div>
  );
}
