"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MdZoomIn, MdZoomOut } from "react-icons/md";

import { GenreTree } from "./GenreTree";
import { groupNodesByRoot } from "./root-grouping";
import { computeRotationForSelection, getChipAngle } from "./wheel-geometry";
import { usePanZoom } from "./use-pan-zoom";
import { GenreTreeNode, GenreTreeProps } from "./types";
import {
  calculateNodeDimensions,
  getGenreTreeColor,
  PER_TREE_ACCENT_DOT,
  WHEEL_RADIUS,
  WHEEL_ROTATION_EASING,
  WHEEL_ROTATION_TRANSITION_MS,
  WHEEL_VIEWPORT_HEIGHT,
} from "./constants";

export interface GenreTreeWheelProps extends Omit<GenreTreeProps, "nodes" | "rootColor" | "orientation"> {
  nodes: GenreTreeNode[];
  /** Fired whenever the selected root changes — on mount with the default selection, and on every chip click. */
  onRootSelect?: (rootId: string) => void;
  /** Optional label centered on the wheel's pivot point, e.g. a brand name. Stays upright and
   * fixed regardless of the wheel's rotation. */
  centerLabel?: string;
}

/**
 * All root genres distributed evenly around a wheel hugging the bottom of its container.
 * Clicking a chip rotates the wheel so that root lands at the top-center, and swaps in its
 * subtree — rendered as a single vertical `<GenreTree>` growing upward from that anchor.
 * Only the selected root's subtree is ever mounted.
 */
export function GenreTreeWheel({
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
}: GenreTreeWheelProps) {
  const groups = useMemo(() => groupNodesByRoot(nodes), [nodes]);
  const [selectedRootId, setSelectedRootId] = useState<string | null>(groups[0]?.root.id ?? null);
  const [rotationDeg, setRotationDeg] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  // One shared pan/zoom transform, applied to the stage below that anchors both the tree and the
  // wheel to the same point — so panning/zooming moves them together with no JS sync required.
  const panZoom = usePanZoom(viewportRef);

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

  // The selected chip is centered on its wheel anchor point (translate(-50%, -50%)) so it stays
  // centered on the circle like every other chip, but the tree's root lands with its bottom edge
  // exactly at that same anchor point (see .gtv-wheel-tree-anchor). Left alone, that mismatch makes
  // the chip's top half overlap the tree's bottom edge — offsetting the anchor down by the chip's
  // own half-height clears it, so the root->depth1 gap reads the same as any other consecutive-depth gap.
  const rootChipHalfHeight = selectedGroup ? calculateNodeDimensions(selectedGroup.root.itemCount).HEIGHT / 2 : 0;

  const handleChipClick = (rootId: string, angle: number) => {
    setSelectedRootId(rootId);
    setRotationDeg((current) => computeRotationForSelection(current, angle));
  };

  return (
    <div
      ref={viewportRef}
      className={["gtv-wheel-container", className].filter(Boolean).join(" ")}
      style={
        {
          "--gtv-wheel-radius": `${WHEEL_RADIUS}px`,
          "--gtv-wheel-viewport-height": `${WHEEL_VIEWPORT_HEIGHT}px`,
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
        <div
          className="gtv-wheel-stage"
          style={{ "--gtv-wheel-chip-half-height": `${rootChipHalfHeight}px` } as React.CSSProperties}
        >
          {selectedGroup && (
            <div className="gtv-wheel-tree-anchor">
              <GenreTree
                key={selectedGroup.root.id}
                nodes={selectedGroup.nodes}
                orientation="vertical"
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

          <div className="gtv-wheel-circle" />

          {centerLabel && <div className="gtv-wheel-center-label">{centerLabel}</div>}

          <div className="gtv-wheel" style={{ "--gtv-wheel-rotation": `${rotationDeg}deg` } as React.CSSProperties}>
            {groups.map((group, index) => {
              const angle = getChipAngle(index, groups.length);
              const selected = group.root.id === effectiveRootId;
              const dimensions = calculateNodeDimensions(group.root.itemCount);
              const itemCountText = group.root.itemCount > 0 ? ` (${group.root.itemCount})` : "";
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
                        "--gtv-chip-color": getGenreTreeColor(group.root.id),
                      } as React.CSSProperties
                    }
                    onClick={() => handleChipClick(group.root.id, angle)}
                  >
                    {PER_TREE_ACCENT_DOT && <span className="gtv-wheel-chip-dot" />}
                    <span className="gtv-node-label gtv-node-label--root">
                      {group.root.name}
                      {itemCountText}
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
      </div>
    </div>
  );
}
