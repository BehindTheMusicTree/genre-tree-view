import { INFO_PANEL_SHEET_MAX_WIDTH, INFO_PANEL_SHEET_PEEK_FRACTION } from "./constants";

/** The part of the viewport an overlay covers, as `centerOnElement`'s "obscured" argument
 * (use-pan-zoom.ts). */
export type ObscuredArea = { side: "left" | "right"; width: number } | { side: "bottom"; height: number };

/** The info panel always renders on the left side of the viewport. */
export function resolveInfoPanelSide(): "left" {
  return "left";
}

/** Packages the panel's footprint as the `centerOnElement` "obscured" argument (use-pan-zoom.ts) so
 * a node click can center the node within the space that remains visible once the panel covers
 * the left side — or, in a narrow container where it docks as a bottom sheet, its peek height. */
export function resolveInfoPanelObscuredArea(
  element: Element | null | undefined,
  viewport: Element | null | undefined,
  panelWidth: number,
): ObscuredArea | null {
  if (!element || !viewport) return null;
  if (viewport.clientWidth > 0 && viewport.clientWidth <= INFO_PANEL_SHEET_MAX_WIDTH) {
    return { side: "bottom", height: viewport.clientHeight * INFO_PANEL_SHEET_PEEK_FRACTION };
  }
  return { width: panelWidth, side: resolveInfoPanelSide() };
}
