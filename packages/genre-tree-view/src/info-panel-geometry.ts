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
