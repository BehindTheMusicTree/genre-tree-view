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

/** Scale that fits `contentWidth`×`contentHeight` inside `viewportWidth`×`viewportHeight` with
 * `padding` px of clearance on every side, picking whichever dimension is more constraining. */
export function computeFitScale(
  contentWidth: number,
  contentHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  padding: number,
): number {
  return clampZoomScale(
    Math.min((viewportWidth - padding * 2) / contentWidth, (viewportHeight - padding * 2) / contentHeight),
  );
}
