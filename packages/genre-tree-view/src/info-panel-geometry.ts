/** The info panel always renders on the left side of the viewport. */
export function resolveInfoPanelSide(): "left" {
  return "left";
}

/** Packages the panel's side as the `centerOnElement` "obscured" argument (use-pan-zoom.ts) so a
 * node click can center the node within the space that remains visible once the panel covers the
 * left side. */
export function resolveInfoPanelObscuredArea(
  element: Element | null | undefined,
  viewport: Element | null | undefined,
  panelWidth: number,
): { width: number; side: "left" } | null {
  if (!element || !viewport) return null;
  return { width: panelWidth, side: resolveInfoPanelSide() };
}
