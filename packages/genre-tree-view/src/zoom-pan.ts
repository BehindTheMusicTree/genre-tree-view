import {
  ZOOM_BUTTON_SCALE_STEP,
  ZOOM_MAX_SCALE,
  ZOOM_MIN_SCALE,
  ZOOM_WHEEL_MAX_EXPONENT,
  ZOOM_WHEEL_SCALE_SPEED,
} from "./constants";

/** `minScale` defaults to ZOOM_MIN_SCALE but accepts an override so manual zoom-out's floor can
 * be relaxed to match a "fit to frame" scale computed for content too large for the static
 * default to reach — see usePanZoom's dynamic min-scale tracking. */
export function clampZoomScale(scale: number, minScale: number = ZOOM_MIN_SCALE): number {
  return Math.min(ZOOM_MAX_SCALE, Math.max(minScale, scale));
}

/** Exponential response to wheel delta so the zoom feels proportional at any current scale —
 * a fixed step would feel abrupt when zoomed far out and sluggish when zoomed far in. The exponent
 * is clamped to ±ZOOM_WHEEL_MAX_EXPONENT so an unusually fast swipe (large |wheelDeltaY| in one
 * event) can't produce a runaway multiplicative jump — see that constant's doc comment. */
export function computeZoomScale(currentScale: number, wheelDeltaY: number, minScale: number = ZOOM_MIN_SCALE): number {
  const exponent = Math.max(
    -ZOOM_WHEEL_MAX_EXPONENT,
    Math.min(ZOOM_WHEEL_MAX_EXPONENT, -wheelDeltaY * ZOOM_WHEEL_SCALE_SPEED),
  );
  return clampZoomScale(currentScale * Math.exp(exponent), minScale);
}

export function computeZoomScaleForButton(currentScale: number, direction: 1 | -1, minScale: number = ZOOM_MIN_SCALE): number {
  return clampZoomScale(currentScale * Math.pow(ZOOM_BUTTON_SCALE_STEP, direction), minScale);
}

/** Cross-browser quantum a physical mouse wheel's deltaY always lands on exact multiples of
 * (a long-documented Firefox/Chrome quirk); trackpad-generated deltaY values essentially never
 * do. Used by classifyWheelEvent below. */
const WHEEL_TICK_DELTA = 4.000244140625;

export interface WheelClassifierState {
  lastTime: number;
  lastType: "wheel" | "trackpad" | null;
}

export function createWheelClassifierState(): WheelClassifierState {
  return { lastTime: 0, lastType: null };
}

/** Classifies a ctrl+wheel event as a physical mouse wheel (few large, quantized deltaY steps) or
 * a trackpad ctrl+wheel/pinch gesture (many small deltaY events) — adapted from MapLibre/Mapbox
 * GL's scroll-zoom heuristic, so each can get its own response curve instead of sharing one.
 * `state` carries the running classification across a gesture's repeated events and is mutated
 * in place. */
export function classifyWheelEvent(deltaY: number, now: number, state: WheelClassifierState): "wheel" | "trackpad" {
  const timeDelta = now - state.lastTime;
  state.lastTime = now;

  let type: "wheel" | "trackpad";
  if (deltaY !== 0 && deltaY % WHEEL_TICK_DELTA === 0) {
    // Definitely a mouse wheel: this exact quantization essentially never occurs by chance.
    type = "wheel";
  } else if (Math.abs(deltaY) < 4) {
    // Definitely a trackpad: too small to be a real wheel notch.
    type = "trackpad";
  } else if (timeDelta > 400 || !state.lastType) {
    // New or unknown gesture: infer from delta-per-time — a fast trackpad still moves less per ms
    // than a wheel notch does.
    type = Math.abs(timeDelta * deltaY) < 200 ? "trackpad" : "wheel";
  } else {
    // Ambiguous repeat within the same gesture: stay with whatever this gesture already is.
    type = state.lastType;
  }

  state.lastType = type;
  return type;
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
 * space is never exceeded, so clipping can't happen. This deliberately ignores `ZOOM_MIN_SCALE`:
 * capping it there would make the button lie about "fitting" content too large to fit at that
 * static floor, rendering it too big for the viewport while still centering on the full (larger)
 * bounding box, cropping content. usePanZoom instead relaxes its own interactive floor to match,
 * so manual zoom-out can always reach at least as far out as this computes. */
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
