"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { GenreTree } from "./GenreTree";
import { groupNodesByRoot } from "./root-grouping";
import { computeRotationForSelection, getChipAngle } from "./wheel-geometry";
import { GenreTreeNode, GenreTreeProps } from "./types";
import {
  calculateNodeDimensions,
  getGenreTreeColor,
  PER_TREE_ACCENT_DOT,
  WHEEL_RADIUS,
  WHEEL_ROTATION_EASING,
  WHEEL_ROTATION_TRANSITION_MS,
  WHEEL_VISIBLE_ARC_HEIGHT,
} from "./constants";

export interface GenreTreeWheelProps extends Omit<GenreTreeProps, "nodes" | "rootColor" | "orientation"> {
  nodes: GenreTreeNode[];
  /** Fired whenever the selected root changes — on mount with the default selection, and on every chip click. */
  onRootSelect?: (rootId: string) => void;
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
  // centered on the circle like every other chip, but every real tree node's rect is top-anchored
  // at its own d.y instead. Left alone, that mismatch makes the chip sit half its own height too
  // high, eating into the gap above it — reserving that half-height below the tree area pushes the
  // tree's own bottom edge up to compensate, so the root->depth1 gap reads the same as any other
  // consecutive-depth gap.
  const rootChipHalfHeight = selectedGroup ? calculateNodeDimensions(selectedGroup.root.itemCount).HEIGHT / 2 : 0;

  const handleChipClick = (rootId: string, angle: number) => {
    setSelectedRootId(rootId);
    setRotationDeg((current) => computeRotationForSelection(current, angle));
  };

  // A newly selected root's tree can be taller than the visible tree area; overflow:auto
  // starts scrolled to the top, which would show its topmost ancestor instead of the root
  // anchored at the wheel. Re-anchor to the bottom every time the selection changes.
  const treeAreaRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const treeArea = treeAreaRef.current;
    if (treeArea) treeArea.scrollTop = treeArea.scrollHeight;
  }, [effectiveRootId]);

  return (
    <div
      className={["gtv-wheel-container", className].filter(Boolean).join(" ")}
      style={
        {
          "--gtv-wheel-radius": `${WHEEL_RADIUS}px`,
          "--gtv-wheel-visible-arc-height": `${WHEEL_VISIBLE_ARC_HEIGHT}px`,
          "--gtv-wheel-rotation-transition-ms": `${WHEEL_ROTATION_TRANSITION_MS}ms`,
          "--gtv-wheel-rotation-easing": WHEEL_ROTATION_EASING,
        } as React.CSSProperties
      }
    >
      <div className="gtv-wheel-tree-area" ref={treeAreaRef} style={{ paddingBottom: rootChipHalfHeight }}>
        {selectedGroup && (
          <GenreTree
            key={selectedGroup.root.id}
            className="gtv-wheel-tree"
            nodes={selectedGroup.nodes}
            orientation="vertical"
            hideRoot
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
        )}
      </div>

      <div className="gtv-wheel-viewport">
        <div className="gtv-wheel" style={{ "--gtv-wheel-rotation": `${rotationDeg}deg` } as React.CSSProperties}>
          {groups.map((group, index) => {
            const angle = getChipAngle(index);
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
  );
}
