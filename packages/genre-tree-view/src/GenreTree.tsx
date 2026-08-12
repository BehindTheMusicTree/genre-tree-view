"use client";

import { useEffect, useRef, useMemo } from "react";
import * as d3 from "d3";

import { GenreTreeProps } from "./types";
import { buildTreeHierarchyStructure } from "./NodeHelper";
import { calculateSvgDimensions, createTreeLayout, setupTreeLayout, renderTree } from "./tree-renderer";
import { getGenreTreeColor, HOVER_BRIGHTNESS } from "./constants";

/**
 * Renders one connected hierarchy of `GenreTreeNode`s as an interactive D3/SVG tree.
 * Purely presentational: fetching, mutations, and popups are the consumer's responsibility,
 * wired through the callback props.
 */
export function GenreTree({
  nodes,
  className,
  rootColor,
  orientation = "horizontal",
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
}: GenreTreeProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectingFileNodeIdRef = useRef<string | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    const nodeId = selectingFileNodeIdRef.current;
    if (files && files.length > 0 && nodeId) {
      onUploadFiles?.(nodeId, Array.from(files));
    }
    event.target.value = "";
  };

  const { treeData, resolvedRootColor, svgWidth, svgHeight } = useMemo(() => {
    const root = buildTreeHierarchyStructure(d3, nodes);
    const originalTreeData = createTreeLayout(d3, root, orientation);
    const {
      svgWidth: width,
      svgHeight: height,
      highestVerticalCoordinate,
    } = calculateSvgDimensions(d3, originalTreeData, orientation);
    const reshapedTreeData = setupTreeLayout(d3, originalTreeData, highestVerticalCoordinate, orientation);

    return {
      treeData: reshapedTreeData,
      resolvedRootColor: rootColor ?? getGenreTreeColor(nodes[0]?.id ?? ""),
      svgWidth: width,
      svgHeight: height,
    };
  }, [nodes, rootColor, orientation]);

  // A reparent-in-progress node can belong to a *different* GenreTree instance (a different
  // root). Only the tree that actually contains it needs to block self/descendants as targets.
  const reparentForbiddenIds = useMemo(() => {
    if (!reparentingNodeId) return [];
    const reparentingHierarchyNode = treeData.descendants().find((d) => d.data.id === reparentingNodeId);
    if (!reparentingHierarchyNode) return [];
    return reparentingHierarchyNode.descendants().map((d) => d.data.id);
  }, [treeData, reparentingNodeId]);

  useEffect(() => {
    if (!svgRef.current) return;

    d3.select(svgRef.current).selectAll("*").remove();

    renderTree(
      d3,
      svgRef,
      treeData,
      svgWidth,
      svgHeight,
      reparentingNodeId,
      reparentForbiddenIds,
      resolvedRootColor,
      {
        onPlayPause,
        onAddChild,
        onRenameRequest,
        onDeleteRequest,
        onReparentRequest,
        onReparentTargetSelect: (newParentId) => {
          if (reparentingNodeId) {
            void onReparent?.(reparentingNodeId, newParentId);
          }
        },
        fileInputRef,
        selectingFileNodeIdRef,
        playingNodeId,
        playState,
      },
      orientation,
    );
  }, [
    treeData,
    svgWidth,
    svgHeight,
    reparentingNodeId,
    reparentForbiddenIds,
    resolvedRootColor,
    playingNodeId,
    playState,
    onPlayPause,
    onAddChild,
    onRenameRequest,
    onDeleteRequest,
    onReparentRequest,
    onReparent,
    orientation,
  ]);

  useEffect(() => {
    const svgElement = svgRef.current;
    return () => {
      if (svgElement) {
        d3.select(svgElement).selectAll("*").remove();
      }
    };
  }, []);

  return (
    <div className={className} style={{ "--gtv-hover-brightness": HOVER_BRIGHTNESS } as React.CSSProperties}>
      <input type="file" multiple ref={fileInputRef} style={{ display: "none" }} onChange={handleFileChange} />
      {/* overflow: visible so the toolbar's overflow menu isn't clipped when it extends past
          the tree's own layout bounds (SVG defaults to overflow: hidden). */}
      <svg ref={svgRef} width={svgWidth} height={svgHeight} style={{ overflow: "visible" }} />
    </div>
  );
}
