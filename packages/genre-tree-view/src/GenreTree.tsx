"use client";

import { useEffect, useRef, useMemo } from "react";
import * as d3 from "d3";
import { MdFitScreen, MdZoomIn, MdZoomOut } from "react-icons/md";

import { GenreTreeProps } from "./types";
import { buildTreeHierarchyStructure } from "./NodeHelper";
import { calculateSvgDimensions, createTreeLayout, setupTreeLayout, renderTree } from "./tree-renderer";
import { getGenreTreeColor, HOVER_BRIGHTNESS } from "./constants";
import { usePanZoom } from "./use-pan-zoom";

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
  hideRoot = false,
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
  interactive = true,
}: GenreTreeProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectingFileNodeIdRef = useRef<string | null>(null);
  const panZoom = usePanZoom(viewportRef);

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
      rootDepthOffset,
    } = calculateSvgDimensions(d3, originalTreeData, orientation, hideRoot);
    const reshapedTreeData = setupTreeLayout(
      d3,
      originalTreeData,
      highestVerticalCoordinate,
      orientation,
      rootDepthOffset,
    );

    return {
      treeData: reshapedTreeData,
      resolvedRootColor: rootColor ?? getGenreTreeColor(nodes[0]?.id ?? ""),
      svgWidth: width,
      svgHeight: height,
    };
  }, [nodes, rootColor, orientation, hideRoot]);

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
      hideRoot,
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
    hideRoot,
  ]);

  useEffect(() => {
    const svgElement = svgRef.current;
    return () => {
      if (svgElement) {
        d3.select(svgElement).selectAll("*").remove();
      }
    };
  }, []);

  const svg = <svg ref={svgRef} width={svgWidth} height={svgHeight} style={{ overflow: "visible", display: "block" }} />;

  const fileInput = (
    <input type="file" multiple ref={fileInputRef} style={{ display: "none" }} onChange={handleFileChange} />
  );

  if (!interactive) {
    // No own viewport, transform, or controls — an ancestor (e.g. GenreTreeWheel's shared stage)
    // supplies the entire pan/zoom transform for this tree and whatever else it's paired with.
    return (
      <div className={className} style={{ "--gtv-hover-brightness": HOVER_BRIGHTNESS } as React.CSSProperties}>
        {fileInput}
        {svg}
      </div>
    );
  }

  return (
    <div
      ref={viewportRef}
      className={className}
      style={{
        "--gtv-hover-brightness": HOVER_BRIGHTNESS,
        position: "relative",
        overflow: "hidden",
        width: "100%",
        height: "100%",
        cursor: "grab",
      } as React.CSSProperties}
      onPointerDown={panZoom.handlePointerDown}
    >
      {fileInput}
      {/* transform-origin: 0 0 so panX/panY/zoomScale compose in one consistent coordinate
          system — see use-pan-zoom.ts. */}
      <div style={{ position: "absolute", top: 0, left: 0, transform: panZoom.transform, transformOrigin: "0 0" }}>
        {svg}
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
          onClick={() => panZoom.fitToFrame([svgRef.current])}
          aria-label="Fit to frame"
        >
          <MdFitScreen className="gtv-icon" size={18} />
        </button>
      </div>
    </div>
  );
}
