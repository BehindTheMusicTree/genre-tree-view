"use client";

import type { GenreTreeViewMode } from "./types";
import { GenreTreeSkeleton } from "./GenreTreeSkeleton";
import { GenreTreeWheelSkeleton } from "./GenreTreeWheelSkeleton";

export type GenreTreeViewSkeletonProps = {
  viewMode: GenreTreeViewMode;
};

// Single source of truth for viewMode -> skeleton shape, so a consumer's next/dynamic
// `loading` fallback (rendered before GenreTreeView's own chunk downloads and this logic
// can run) never disagrees with what GenreTreeView renders internally once mounted.
export function GenreTreeViewSkeleton({ viewMode }: GenreTreeViewSkeletonProps) {
  if (viewMode === "wheel" || viewMode === "pop-core") {
    return (
      <div className="tree-container gtv-view-skeleton-wheel-wrapper">
        <GenreTreeWheelSkeleton />
      </div>
    );
  }
  return <GenreTreeSkeleton />;
}
