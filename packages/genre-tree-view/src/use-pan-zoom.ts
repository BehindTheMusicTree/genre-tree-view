import { useCallback, useEffect, useRef, useState } from "react";

import {
  PAN_MIN_VISIBLE_PX,
  ZOOM_FIT_PADDING,
  ZOOM_MAX_SCALE,
  ZOOM_MIN_SCALE,
  ZOOM_PINCH_SCALE_SPEED,
} from "./constants";
import { clampZoomScale, computeFitScale, computeZoomScale, computeZoomScaleForButton } from "./zoom-pan";

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
  // the content's on-screen rect without re-measuring the DOM on every drag/wheel event. Stays
  // null until fitToFrame has run at least once; clampPanAxis treats null as "nothing to clamp
  // against" and passes the pan value through unchanged.
  const contentBoundsRef = useRef<{ originX: number; originY: number; width: number; height: number } | null>(null);

  // Keeps at least PAN_MIN_VISIBLE_PX of content on-screen along each axis, so a drag or wheel-pan
  // can never carry the tree fully out of view with no visible edge left to drag back from. Axes
  // are independent (an X-axis clamp never depends on the current panY, and vice versa), so each
  // can be clamped separately as its own setState updater runs.
  const clampPanAxis = useCallback((pan: number, scale: number, axis: "x" | "y") => {
    const viewport = viewportRef.current;
    const bounds = contentBoundsRef.current;
    if (!viewport || !bounds) return pan;

    const origin = axis === "x" ? bounds.originX : bounds.originY;
    const size = axis === "x" ? bounds.width : bounds.height;
    // clientWidth/clientHeight (not getBoundingClientRect) since this runs on every wheel/pointer-
    // move event and only the viewport's own size is needed, not its position — avoids forcing a
    // synchronous layout read in a hot path.
    const viewportSize = axis === "x" ? viewport.clientWidth : viewport.clientHeight;

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

  // handlePointerDown/handlePointerMove/handlePointerUp are registered as window listeners via
  // referentially-stable wrappers (see stablePointerMove/stablePointerUp below), so they can't just
  // read zoomScale/minScale directly — that would freeze them at whatever value was current when
  // the listener was attached. Mirroring them into refs, kept current via the effects below, gives
  // the closures a live read instead.
  const zoomScaleRef = useRef(zoomScale);
  useEffect(() => {
    zoomScaleRef.current = zoomScale;
  }, [zoomScale]);
  const minScaleRef = useRef(minScale);
  useEffect(() => {
    minScaleRef.current = minScale;
  }, [minScale]);

  // Tracks every currently-down pointer by id so a second touch landing mid-drag is recognized as
  // the start of a pinch rather than treated as an unrelated pan. Two-finger touch pinch normally
  // never reaches JS at all (the browser treats it as native page zoom) — that's handled by
  // touch-action: none on the viewport element (see GenreTree.tsx/styles.css), which routes both
  // touch points here as ordinary pointer events instead.
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  // Pointers whose pointerdown landed on a node/toolbar/control: excluded from single-pointer pan
  // (so they don't fight that element's own click/hover handling) but still tracked so a pinch that
  // starts on top of content — the common case, since the tree fills most of the screen — still works.
  const suppressedPointersRef = useRef<Set<number>>(new Set());
  // Also remembers which pointer ids the current baseline was computed from, so a third finger
  // landing (or the active pair otherwise changing) recomputes it instead of reusing a stale
  // distance/scale from a different pair — which would otherwise cause a sudden jump in zoom.
  const pinchStartRef = useRef<{ ids: [number, number]; distance: number; scale: number } | null>(null);

  const pinchPointerIds = useCallback((pointers: Map<number, { x: number; y: number }>): [number, number] => {
    const ids = Array.from(pointers.keys());
    return [ids[0], ids[1]];
  }, []);

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      const pointers = activePointersRef.current;
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (pointers.size >= 2) {
        const [idA, idB] = pinchPointerIds(pointers);
        const a = pointers.get(idA)!;
        const b = pointers.get(idB)!;
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        const current = pinchStartRef.current;
        if (!current || current.ids[0] !== idA || current.ids[1] !== idB) {
          pinchStartRef.current = { ids: [idA, idB], distance, scale: zoomScaleRef.current };
          return;
        }
        if (current.distance <= 0) return;
        const newScale = clampZoomScale(
          current.scale * Math.pow(distance / current.distance, ZOOM_PINCH_SCALE_SPEED),
          minScaleRef.current,
        );
        zoomAtPoint(newScale, (a.x + b.x) / 2, (a.y + b.y) / 2);
        return;
      }

      if (suppressedPointersRef.current.has(event.pointerId)) return;

      const dx = event.clientX - lastPointRef.current.x;
      const dy = event.clientY - lastPointRef.current.y;
      lastPointRef.current = { x: event.clientX, y: event.clientY };
      setPanX((x) => clampPanAxis(x + dx, zoomScaleRef.current, "x"));
      setPanY((y) => clampPanAxis(y + dy, zoomScaleRef.current, "y"));
    },
    [zoomAtPoint, clampPanAxis, pinchPointerIds],
  );

  // handlePointerMove/handlePointerUp are recreated whenever zoomAtPoint (and so zoomScale)
  // changes, e.g. mid-pinch — but window.addEventListener/removeEventListener only match by
  // function identity. Registering these referentially stable wrappers instead (which delegate to
  // the latest handler via ref) means the exact same function passed to addEventListener is always
  // the one passed to removeEventListener, so a pinch never leaves a stale listener attached.
  const handlePointerMoveRef = useRef(handlePointerMove);
  useEffect(() => {
    handlePointerMoveRef.current = handlePointerMove;
  }, [handlePointerMove]);
  const handlePointerUpRef = useRef<(event: PointerEvent) => void>(() => {});
  const stablePointerMove = useCallback((event: PointerEvent) => handlePointerMoveRef.current(event), []);
  const stablePointerUp = useCallback((event: PointerEvent) => handlePointerUpRef.current(event), []);

  const handlePointerUp = useCallback((event: PointerEvent) => {
    const pointers = activePointersRef.current;
    pointers.delete(event.pointerId);
    suppressedPointersRef.current.delete(event.pointerId);

    if (pointers.size < 2) pinchStartRef.current = null;
    const remaining = Array.from(pointers.values());
    // Dropping from two fingers to one resumes as a plain drag, anchored at the finger left on
    // screen, instead of jumping by the distance between the old two-finger midpoint and it.
    if (remaining.length === 1) lastPointRef.current = remaining[0];

    if (pointers.size === 0) {
      window.removeEventListener("pointermove", stablePointerMove);
      window.removeEventListener("pointerup", stablePointerUp);
      window.removeEventListener("pointercancel", stablePointerUp);
    }
  }, [stablePointerMove, stablePointerUp]);
  useEffect(() => {
    handlePointerUpRef.current = handlePointerUp;
  }, [handlePointerUp]);

  const handlePointerDown = useCallback((event: React.PointerEvent) => {
    if (event.button !== 0) return;
    // A pointer landing on a node/toolbar/control is excluded from single-pointer pan (so it
    // doesn't fight that element's own click/hover handling) but still tracked below — otherwise a
    // pinch that starts on top of content, the common case since the tree fills most of the screen,
    // would never be recognized as a pinch at all.
    const isInteractive = (event.target as Element).closest("g.node, foreignObject, .gtv-zoom-controls, .gtv-wheel-chip") !== null;

    const pointers = activePointersRef.current;
    const wasEmpty = pointers.size === 0;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    lastPointRef.current = { x: event.clientX, y: event.clientY };

    if (isInteractive) {
      suppressedPointersRef.current.add(event.pointerId);
    } else {
      event.preventDefault();
    }

    if (wasEmpty) {
      window.addEventListener("pointermove", stablePointerMove);
      window.addEventListener("pointerup", stablePointerUp);
      window.addEventListener("pointercancel", stablePointerUp);
    }
  }, [stablePointerMove, stablePointerUp]);

  // Covers the case handlePointerUp's own cleanup can't: the component unmounting mid-gesture
  // (route change, conditional render) before every pointer has lifted, which would otherwise
  // leave these window listeners attached and still calling setState after unmount.
  useEffect(() => {
    const pointers = activePointersRef.current;
    const suppressed = suppressedPointersRef.current;
    return () => {
      window.removeEventListener("pointermove", stablePointerMove);
      window.removeEventListener("pointerup", stablePointerUp);
      window.removeEventListener("pointercancel", stablePointerUp);
      pointers.clear();
      suppressed.clear();
      pinchStartRef.current = null;
    };
  }, [stablePointerMove, stablePointerUp]);

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
