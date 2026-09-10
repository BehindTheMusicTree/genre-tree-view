/** Decides which side of the viewport the info panel should render on: "left" (default) unless
 * the panel would cover the clicked node's own rect, in which case "right" keeps the node
 * visible. Computed once at click time (see use-node-info-panel.ts) rather than continuously, so
 * the panel's side doesn't flicker as the tree pans/zooms underneath it. */
export function resolveInfoPanelSide(
  nodeRect: { left: number },
  viewportRect: { left: number },
  panelWidth: number,
): "left" | "right" {
  return nodeRect.left < viewportRect.left + panelWidth ? "right" : "left";
}

/** Same side decision `showNodeInfo` (use-node-info-panel.ts) makes, packaged as the
 * `centerOnElement` "obscured" argument (use-pan-zoom.ts) so a node click can center the node
 * within the space that will remain visible once the panel it's about to open covers the other
 * side — computed independently (not read from panel state), since the panel may not be open yet. */
export function resolveInfoPanelObscuredArea(
  element: Element | null | undefined,
  viewport: Element | null | undefined,
  panelWidth: number,
): { width: number; side: "left" | "right" } | null {
  if (!element || !viewport) return null;
  return {
    width: panelWidth,
    side: resolveInfoPanelSide(element.getBoundingClientRect(), viewport.getBoundingClientRect(), panelWidth),
  };
}
