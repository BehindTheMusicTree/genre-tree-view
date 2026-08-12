"use client";

import { useEffect, useMemo, useState } from "react";

import { GenreTree } from "./GenreTree";
import { groupNodesByRoot } from "./root-grouping";
import { computeRotationForSelection, getChipAngle } from "./wheel-geometry";
import { GenreTreeNode, GenreTreeProps } from "./types";
import {
  getGenreTreeColor,
  WHEEL_CHIP_HEIGHT,
  WHEEL_CHIP_HEIGHT_SELECTED,
  WHEEL_CHIP_MAX_WIDTH,
  WHEEL_CHIP_MIN_WIDTH,
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

  useEffect(() => {
    if (effectiveRootId) onRootSelect?.(effectiveRootId);
  }, [effectiveRootId, onRootSelect]);

  const selectedGroup = groups.find((group) => group.root.id === effectiveRootId) ?? null;

  const handleChipClick = (rootId: string, angle: number) => {
    setSelectedRootId(rootId);
    setRotationDeg((current) => computeRotationForSelection(current, angle));
  };

  return (
    <div
      className={["gtv-wheel-container", className].filter(Boolean).join(" ")}
      style={
        {
          "--gtv-wheel-radius": `${WHEEL_RADIUS}px`,
          "--gtv-wheel-visible-arc-height": `${WHEEL_VISIBLE_ARC_HEIGHT}px`,
          "--gtv-wheel-chip-height": `${WHEEL_CHIP_HEIGHT}px`,
          "--gtv-wheel-chip-height-selected": `${WHEEL_CHIP_HEIGHT_SELECTED}px`,
          "--gtv-wheel-chip-min-width": `${WHEEL_CHIP_MIN_WIDTH}px`,
          "--gtv-wheel-chip-max-width": `${WHEEL_CHIP_MAX_WIDTH}px`,
          "--gtv-wheel-rotation-transition-ms": `${WHEEL_ROTATION_TRANSITION_MS}ms`,
          "--gtv-wheel-rotation-easing": WHEEL_ROTATION_EASING,
        } as React.CSSProperties
      }
    >
      <div className="gtv-wheel-tree-area">
        {selectedGroup && (
          <GenreTree
            key={selectedGroup.root.id}
            nodes={selectedGroup.nodes}
            orientation="vertical"
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
            const angle = getChipAngle(index, groups.length);
            const selected = group.root.id === effectiveRootId;
            return (
              <div
                key={group.root.id}
                className="gtv-wheel-slot"
                style={{ "--gtv-chip-angle": `${angle}deg` } as React.CSSProperties}
              >
                <button
                  type="button"
                  className={"gtv-wheel-chip" + (selected ? " gtv-wheel-chip--selected" : "")}
                  aria-pressed={selected}
                  style={{ "--gtv-chip-color": getGenreTreeColor(group.root.id) } as React.CSSProperties}
                  onClick={() => handleChipClick(group.root.id, angle)}
                >
                  {group.root.name}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
