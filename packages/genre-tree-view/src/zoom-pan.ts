import { ZOOM_BUTTON_SCALE_STEP, ZOOM_MAX_SCALE, ZOOM_MIN_SCALE, ZOOM_WHEEL_SCALE_SPEED } from "./constants";

export function clampZoomScale(scale: number): number {
  return Math.min(ZOOM_MAX_SCALE, Math.max(ZOOM_MIN_SCALE, scale));
}

/** Exponential response to wheel delta so the zoom feels proportional at any current scale —
 * a fixed step would feel abrupt when zoomed far out and sluggish when zoomed far in. */
export function computeZoomScale(currentScale: number, wheelDeltaY: number): number {
  return clampZoomScale(currentScale * Math.exp(-wheelDeltaY * ZOOM_WHEEL_SCALE_SPEED));
}

export function computeZoomScaleForButton(currentScale: number, direction: 1 | -1): number {
  return clampZoomScale(currentScale * Math.pow(ZOOM_BUTTON_SCALE_STEP, direction));
}

/** Selector for the elements "fit to frame" should measure: the tree's actually-rendered cards
 * and connector links. Deliberately excludes the invisible per-node hit area and the SVG's own
 * declared width/height, both of which bake in ACTIONS_OVERLAY_WIDTH/HEIGHT (see constants.ts) —
 * toolbar/menu clearance reserved to one side of the tree. Fitting to that reserved space instead
 * of the visible content leaves a large, lopsided gap around the tree after fitting. */
export const TREE_CONTENT_SELECTOR = ".gtv-node-rect, .gtv-link";

/** Collects the tight-content elements (see TREE_CONTENT_SELECTOR) under `container`, ready to
 * pass into usePanZoom's fitToFrame. */
export function queryTreeContentElements(container: Element | null | undefined): Element[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll(TREE_CONTENT_SELECTOR));
}

/** Scale that fits `contentWidth`×`contentHeight` inside `viewportWidth`×`viewportHeight` with
 * `padding` px of clearance on every side, picking whichever dimension is more constraining.
 * Capped at 1 (never zooms in past the tree's natural size), not just `ZOOM_MAX_SCALE`: content is
 * measured from `TREE_CONTENT_SELECTOR` alone, excluding the ACTIONS_OVERLAY_WIDTH/HEIGHT space
 * the layout reserves for hover toolbars/menus. That reserved space scales together with the tree
 * under the shared zoom transform, so scaling past 1 would inflate it past the fixed-px `padding`
 * and clip an edge node's toolbar/menu against the viewport. At scale ≤ 1 the layout's own reserved
 * space is never exceeded, so clipping can't happen — unlike interactive zoom, this deliberately
 * ignores `ZOOM_MIN_SCALE`: capping it there would make the button lie about "fitting" content too
 * large to fit at the interactive floor, rendering it too big for the viewport while still centering
 * on the full (larger) bounding box, cropping content. */
export function computeFitScale(
  contentWidth: number,
  contentHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  padding: number,
): number {
  return Math.min(
    1,
    ZOOM_MAX_SCALE,
    (viewportWidth - padding * 2) / contentWidth,
    (viewportHeight - padding * 2) / contentHeight,
  );
}
