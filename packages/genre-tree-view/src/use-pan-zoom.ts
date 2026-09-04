import { useCallback, useEffect, useRef, useState } from "react";

import { PAN_MIN_VISIBLE_PX, ZOOM_FIT_PADDING, ZOOM_MAX_SCALE, ZOOM_MIN_SCALE } from "./constants";
import { computeFitScale, computeZoomScale, computeZoomScaleForButton } from "./zoom-pan";

export interface UsePanZoomResult {
  panX: number;
  panY: number;
  zoomScale: number;
  /** CSS transform implementing both pan and zoom as one shared coordinate system — apply this
   * to a single "stage" element and everything inside it (however many DOM subtrees) moves and
   * scales together with no separate synchronization step. */
  transform: string;
  canZoomIn: boolean;
  canZoomOut: boolean;
  zoomIn: () => void;
  zoomOut: () => void;
  /** Recomputes pan/scale so the union bounding box of the given elements (nulls ignored) fits
   * inside the viewport with ZOOM_FIT_PADDING of clearance. No-ops if none are present/measurable.
   * Also relaxes manual zoom-out's floor to match, when this content needs to go further out
   * than ZOOM_MIN_SCALE — see minScale below. */
  fitToFrame: (elements: (Element | null | undefined)[]) => void;
  handlePointerDown: (event: React.PointerEvent) => void;
}

/**
 * One pan/zoom stage, anchored to `viewportRef` (the element whose bounding rect defines screen
 * space for cursor-anchored zoom and the zoom buttons' own center). Ctrl+wheel/pinch zooms at the
 * cursor; plain wheel pans; click-and-drag over empty background pans. All of it adjusts `panX`/
 * `panY`/`zoomScale` state directly rather than any ancestor's scroll position, so a consumer
 * applying `transform` to one stage element never needs to keep multiple DOM subtrees in sync.
 */
export function usePanZoom(viewportRef: React.RefObject<HTMLElement | null>): UsePanZoomResult {
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [zoomScale, setZoomScale] = useState(1);

  // Floor for manual zoom-out (wheel/pinch/button), relaxed below ZOOM_MIN_SCALE whenever
  // fitToFrame computes a more permissive scale for the current content — so manual zoom-out can
  // always reach at least as far out as "fit to frame" does, instead of bottoming out at the
  // static default while fitToFrame jumps straight past it.
  const [minScale, setMinScale] = useState(ZOOM_MIN_SCALE);

  // Content bounding box in local (unscaled, pan-independent) coordinates, captured by the most
  // recent fitToFrame call — lets the pan clamp below convert any future panX/panY/zoomScale into
  // the content's on-screen rect without re-measuring the DOM on every drag/wheel event. Null
  // until fitToFrame has run once, at which point clamping is a no-op (nothing to clamp against yet).
  const contentBoundsRef = useRef<{ originX: number; originY: number; width: number; height: number } | null>(null);

  // Keeps at least PAN_MIN_VISIBLE_PX of content on-screen along each axis, so a drag or wheel-pan
  // can never carry the tree fully out of view with no visible edge left to drag back from. Axes
  // are independent (an X-axis clamp never depends on the current panY, and vice versa), so each
  // can be clamped separately as its own setState updater runs.
  const clampPanAxis = useCallback((pan: number, scale: number, axis: "x" | "y") => {
    const viewport = viewportRef.current;
    const bounds = contentBoundsRef.current;
    if (!viewport || !bounds) return pan;

    const viewportRect = viewport.getBoundingClientRect();
    const origin = axis === "x" ? bounds.originX : bounds.originY;
    const size = axis === "x" ? bounds.width : bounds.height;
    const viewportSize = axis === "x" ? viewportRect.width : viewportRect.height;

    const panMax = viewportSize - PAN_MIN_VISIBLE_PX - origin * scale;
    const panMin = PAN_MIN_VISIBLE_PX - size * scale - origin * scale;
    const lo = Math.min(panMin, panMax);
    const hi = Math.max(panMin, panMax);
    return Math.min(hi, Math.max(lo, pan));
  }, [viewportRef]);

  const zoomAtPoint = useCallback(
    (newScale: number, clientX: number, clientY: number) => {
      const viewport = viewportRef.current;
      if (!viewport || newScale === zoomScale) return;

      const rect = viewport.getBoundingClientRect();
      setPanX((prevPanX) => {
        const contentX = (clientX - rect.left - prevPanX) / zoomScale;
        return clientX - rect.left - contentX * newScale;
      });
      setPanY((prevPanY) => {
        const contentY = (clientY - rect.top - prevPanY) / zoomScale;
        return clientY - rect.top - contentY * newScale;
      });
      setZoomScale(newScale);
    },
    [zoomScale, viewportRef],
  );

  // Non-passive + attached directly to the DOM node (rather than React's onWheel) because
  // React's wheel handler is passive by default, which silently drops preventDefault() — and
  // without it, ctrl+wheel triggers the browser's own page zoom instead of this one.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.ctrlKey) {
        zoomAtPoint(computeZoomScale(zoomScale, event.deltaY, minScale), event.clientX, event.clientY);
      } else {
        setPanX((x) => clampPanAxis(x - event.deltaX, zoomScale, "x"));
        setPanY((y) => clampPanAxis(y - event.deltaY, zoomScale, "y"));
      }
    };

    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleWheel);
  }, [zoomScale, minScale, zoomAtPoint, viewportRef, clampPanAxis]);

  // Fallback for input that never reaches the wheel handler above — e.g. a trackpad/OS/browser
  // combination that doesn't translate a pinch gesture into a ctrlKey wheel event at all.
  // Anchored on the viewport's own center.
  const zoomByButton = useCallback(
    (direction: 1 | -1) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const rect = viewport.getBoundingClientRect();
      zoomAtPoint(
        computeZoomScaleForButton(zoomScale, direction, minScale),
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
      );
    },
    [zoomAtPoint, zoomScale, minScale, viewportRef],
  );

  // Generalizes zoomAtPoint's screen->content conversion from a single point to the union
  // bounding box of one or more elements, measured live via getBoundingClientRect() — this way
  // fitting the wheel+tree doesn't require re-deriving their geometry (radius, chip offsets,
  // svg dimensions) a second time here.
  const fitToFrame = useCallback(
    (elements: (Element | null | undefined)[]) => {
      const viewport = viewportRef.current;
      const present = elements.filter((el): el is Element => Boolean(el));
      if (!viewport || present.length === 0) return;

      const viewportRect = viewport.getBoundingClientRect();
      if (viewportRect.width <= 0 || viewportRect.height <= 0) return;
      // computeFitScale subtracts ZOOM_FIT_PADDING*2 from each dimension and deliberately never
      // clamps its lower bound (see zoom-pan.ts) — a viewport too small to hold the padding alone
      // would drive the result negative, mirroring/flinging the tree out of frame. Bail out rather
      // than fit into a viewport that can't even fit the padding.
      if (viewportRect.width <= ZOOM_FIT_PADDING * 2 || viewportRect.height <= ZOOM_FIT_PADDING * 2) return;

      const rects = present.map((el) => el.getBoundingClientRect());
      const contentLeft = Math.min(...rects.map((r) => r.left));
      const contentTop = Math.min(...rects.map((r) => r.top));
      const contentRight = Math.max(...rects.map((r) => r.right));
      const contentBottom = Math.max(...rects.map((r) => r.bottom));

      const contentWidth = (contentRight - contentLeft) / zoomScale;
      const contentHeight = (contentBottom - contentTop) / zoomScale;
      if (contentWidth <= 0 || contentHeight <= 0) return;

      const contentOriginX = (contentLeft - viewportRect.left - panX) / zoomScale;
      const contentOriginY = (contentTop - viewportRect.top - panY) / zoomScale;

      contentBoundsRef.current = {
        originX: contentOriginX,
        originY: contentOriginY,
        width: contentWidth,
        height: contentHeight,
      };

      const fitScale = computeFitScale(
        contentWidth,
        contentHeight,
        viewportRect.width,
        viewportRect.height,
        ZOOM_FIT_PADDING,
      );

      setMinScale(Math.min(ZOOM_MIN_SCALE, fitScale));
      setZoomScale(fitScale);
      setPanX(viewportRect.width / 2 - (contentOriginX + contentWidth / 2) * fitScale);
      setPanY(viewportRect.height / 2 - (contentOriginY + contentHeight / 2) * fitScale);
    },
    [viewportRef, zoomScale, panX, panY],
  );

  // Click-and-drag pan over empty background. Only starts outside a node/its toolbar so it
  // doesn't fight their own click/hover interactions.
  const lastPointRef = useRef({ x: 0, y: 0 });
  const handlePointerMoveRef = useRef<((event: PointerEvent) => void) | null>(null);
  const handlePointerUpRef = useRef<(() => void) | null>(null);

  // handlePointerDown below only depends on clampPanAxis (kept referentially stable across
  // renders), so its handlePointerMove closure can't just read zoomScale directly — that would
  // freeze it at whatever scale was current when handlePointerDown was last recreated. Mirroring
  // it into a ref, kept current via the effect below, gives the closure a live read instead.
  const zoomScaleRef = useRef(zoomScale);
  useEffect(() => {
    zoomScaleRef.current = zoomScale;
  }, [zoomScale]);

  const handlePointerDown = useCallback((event: React.PointerEvent) => {
    if (event.button !== 0) return;
    if ((event.target as Element).closest("g.node, foreignObject, .gtv-zoom-controls, .gtv-wheel-chip")) return;
    event.preventDefault();

    lastPointRef.current = { x: event.clientX, y: event.clientY };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - lastPointRef.current.x;
      const dy = moveEvent.clientY - lastPointRef.current.y;
      lastPointRef.current = { x: moveEvent.clientX, y: moveEvent.clientY };
      setPanX((x) => clampPanAxis(x + dx, zoomScaleRef.current, "x"));
      setPanY((y) => clampPanAxis(y + dy, zoomScaleRef.current, "y"));
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMoveRef.current!);
      window.removeEventListener("pointerup", handlePointerUpRef.current!);
    };

    handlePointerMoveRef.current = handlePointerMove;
    handlePointerUpRef.current = handlePointerUp;
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }, [clampPanAxis]);

  return {
    panX,
    panY,
    zoomScale,
    transform: `translate(${panX}px, ${panY}px) scale(${zoomScale})`,
    canZoomIn: zoomScale < ZOOM_MAX_SCALE,
    canZoomOut: zoomScale > minScale,
    zoomIn: () => zoomByButton(1),
    zoomOut: () => zoomByButton(-1),
    fitToFrame,
    handlePointerDown,
  };
}
