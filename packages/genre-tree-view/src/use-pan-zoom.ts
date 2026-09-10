import { useCallback, useEffect, useRef, useState } from "react";

import {
  CENTER_ON_ELEMENT_DURATION_MS,
  PAN_MIN_VISIBLE_PX,
  ZOOM_ANIMATION_DURATION_MS,
  ZOOM_FIT_PADDING,
  ZOOM_MAX_SCALE,
  ZOOM_MIN_SCALE,
  ZOOM_PINCH_SCALE_SPEED,
} from "./constants";
import {
  classifyWheelEvent,
  clampZoomScale,
  computeFitScale,
  computeZoomScale,
  computeZoomScaleForButton,
  createWheelClassifierState,
} from "./zoom-pan";

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
  /** Animates pan/scale so `element`'s center glides to the center of the viewport's *available*
   * space at `targetScale` (clamped to [minScale, ZOOM_MAX_SCALE]) — used to bring a clicked node
   * to a fixed, comfortable reading scale regardless of the scale the user was already at. Pass
   * `obscuredWidth`/`obscuredSide` when an overlay (e.g. the info panel) will cover part of the
   * viewport, so the element centers within the space that remains visible beside it rather than
   * the viewport's full width. No-ops if the element/viewport isn't present/measurable. */
  centerOnElement: (
    element: Element | null | undefined,
    targetScale: number,
    obscured?: { width: number; side: "left" | "right" } | null,
  ) => void;
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

  // Reads/writes zoomScaleRef.current (not the zoomScale/minScale state closures) so a burst of
  // events firing faster than React can commit a render — a trackpad delivers many wheel ticks
  // per gesture, a touch pinch many pointermoves per frame — each sees the immediately-preceding
  // event's result instead of a stale pre-render scale. Without this, rapid events either collapse
  // onto one stale base (perceived as sluggish/laggy trackpad zoom) or anchor against the wrong
  // scale (perceived as the zoomed point drifting during a fast pinch).
  const zoomAtPoint = useCallback(
    (computeNewScale: (currentScale: number) => number, clientX: number, clientY: number) => {
      const viewport = viewportRef.current;
      if (!viewport) {
        return;
      }
      const currentScale = zoomScaleRef.current;
      const newScale = computeNewScale(currentScale);
      if (newScale === currentScale) {
        return;
      }

      // A wheel/pinch zoom mid-glide takes over from centerOnElement's animation immediately,
      // rather than fighting it over the same panX/panY/zoomScale state.
      centerAnimationRef.current = null;

      const rect = viewport.getBoundingClientRect();
      setPanX((prevPanX) => {
        const contentX = (clientX - rect.left - prevPanX) / currentScale;
        return clientX - rect.left - contentX * newScale;
      });
      setPanY((prevPanY) => {
        const contentY = (clientY - rect.top - prevPanY) / currentScale;
        return clientY - rect.top - contentY * newScale;
      });
      zoomScaleRef.current = newScale;
      setZoomScale(newScale);
    },
    [viewportRef],
  );

  // Tracks the ctrl+wheel glide animation started by animateZoomTo below — null when no
  // animation is in flight. `targetScale` (not the already-reached interpolated scale) is what a
  // new wheel event during an in-flight glide extends, so a burst of ticks compounds into one
  // continuous glide-and-settle instead of restarting/jumping on every event, matching Google
  // Maps' feel.
  const zoomAnimationRef = useRef<{
    startScale: number;
    targetScale: number;
    startTime: number;
    clientX: number;
    clientY: number;
  } | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  // Running state for classifyWheelEvent (see zoom-pan.ts), distinguishing a physical mouse
  // wheel's few large ticks from a trackpad ctrl+wheel gesture's many small ones so each gets its
  // own response curve.
  const wheelClassifierRef = useRef(createWheelClassifierState());

  // stepZoomAnimation schedules itself for the next frame, so it needs to call its own latest
  // version without referencing the `const` it's assigned to inside its own body (disallowed by
  // the hooks linter, mirroring stablePointerMove/handlePointerMoveRef's ref-indirection below).
  const stepZoomAnimationRef = useRef<() => void>(() => {});

  const stepZoomAnimation = useCallback(() => {
    const anim = zoomAnimationRef.current;
    const viewport = viewportRef.current;
    if (!anim || !viewport) {
      animationFrameIdRef.current = null;
      return;
    }

    const t = Math.min(1, (performance.now() - anim.startTime) / ZOOM_ANIMATION_DURATION_MS);
    const eased = 1 - Math.pow(1 - t, 3);
    const currentScale = zoomScaleRef.current;
    const frameScale = anim.startScale + (anim.targetScale - anim.startScale) * eased;

    // Re-anchored every frame (not just once at the start) using the current frame's interpolated
    // scale, so the same content point stays under the cursor throughout the glide rather than
    // only at the end.
    const rect = viewport.getBoundingClientRect();
    setPanX((prevPanX) => {
      const contentX = (anim.clientX - rect.left - prevPanX) / currentScale;
      return anim.clientX - rect.left - contentX * frameScale;
    });
    setPanY((prevPanY) => {
      const contentY = (anim.clientY - rect.top - prevPanY) / currentScale;
      return anim.clientY - rect.top - contentY * frameScale;
    });
    // eslint-disable-next-line react-hooks/immutability -- see minScaleRef/zoomScaleRef comment in fitToFrame
    zoomScaleRef.current = frameScale;
    setZoomScale(frameScale);

    if (t < 1) {
      animationFrameIdRef.current = requestAnimationFrame(() => stepZoomAnimationRef.current());
    } else {
      zoomAnimationRef.current = null;
      animationFrameIdRef.current = null;
    }
  }, [viewportRef]);
  useEffect(() => {
    stepZoomAnimationRef.current = stepZoomAnimation;
  }, [stepZoomAnimation]);

  // Entry point for the animated ctrl+wheel zoom path. Retargets an in-flight glide (extending
  // its target and restarting the ease from the current interpolated scale) rather than letting
  // overlapping animations fight, so a fast burst of wheel ticks reads as one continuous glide.
  const animateZoomTo = useCallback(
    (computeNewScale: (currentScale: number) => number, clientX: number, clientY: number) => {
      const inFlight = zoomAnimationRef.current;
      const baseScale = inFlight ? inFlight.targetScale : zoomScaleRef.current;
      const targetScale = computeNewScale(baseScale);
      if (targetScale === baseScale) {
        return;
      }

      // A physical-wheel zoom mid-glide takes over from centerOnElement's animation immediately,
      // rather than fighting it over the same panX/panY/zoomScale state.
      // eslint-disable-next-line react-hooks/immutability -- see zoomScaleRef comment in fitToFrame
      centerAnimationRef.current = null;

      zoomAnimationRef.current = {
        startScale: zoomScaleRef.current,
        targetScale,
        startTime: performance.now(),
        clientX,
        clientY,
      };

      if (animationFrameIdRef.current === null) {
        animationFrameIdRef.current = requestAnimationFrame(stepZoomAnimation);
      }
    },
    [stepZoomAnimation],
  );

  // Keeps the viewport's current center point fixed on screen when its box is resized (matching
  // Google Maps: resizing the map container never re-fits or re-zooms, it just reveals/hides edges
  // around the same center) — panX/panY shift by half the size delta so the point that was in the
  // middle of the old box is still in the middle of the new one, then get re-clamped in case the
  // resize shrank the viewport below what the current pan allows.
  const viewportSizeRef = useRef<{ width: number; height: number } | null>(null);
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;

      const previous = viewportSizeRef.current;
      viewportSizeRef.current = { width, height };
      if (!previous) return;

      const dx = (width - previous.width) / 2;
      const dy = (height - previous.height) / 2;
      if (dx === 0 && dy === 0) return;

      const scale = zoomScaleRef.current;
      setPanX((x) => clampPanAxis(x + dx, scale, "x"));
      setPanY((y) => clampPanAxis(y + dy, scale, "y"));
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [viewportRef, clampPanAxis]);

  // Non-passive + attached directly to the DOM node (rather than React's onWheel) because
  // React's wheel handler is passive by default, which silently drops preventDefault() — and
  // without it, ctrl+wheel triggers the browser's own page zoom instead of this one. Registered
  // once (zoomAtPoint/clampPanAxis read live scale via refs rather than being deps here) instead
  // of re-subscribing on every scale change, which previously tore down and rebuilt this listener
  // on every single wheel tick during a continuous trackpad gesture.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.ctrlKey) {
        const now = performance.now();
        const wheelType = classifyWheelEvent(event.deltaY, now, wheelClassifierRef.current);
        if (wheelType === "trackpad") {
          // Trackpad ctrl+wheel/pinch already arrives as a continuous, high-frequency stream of
          // small deltas — applying it instantly (like Google Maps/MapLibre do) tracks the
          // gesture 1:1 with zero added latency. Easing *each* of these events (as the "wheel"
          // branch below does) stacked a ~200ms lag behind every single one, which read as the
          // trackpad path lagging noticeably behind Google Maps' own feel.
          zoomAtPoint((current) => computeZoomScale(current, event.deltaY, minScaleRef.current), event.clientX, event.clientY);
        } else {
          // A physical wheel's notches are few and chunky (one big jump per click), so easing the
          // glide between them reads as smooth rather than laggy.
          animateZoomTo(
            (current) => computeZoomScaleForButton(current, event.deltaY < 0 ? 1 : -1, minScaleRef.current),
            event.clientX,
            event.clientY,
          );
        }
      } else {
        const scale = zoomScaleRef.current;
        setPanX((x) => clampPanAxis(x - event.deltaX, scale, "x"));
        setPanY((y) => clampPanAxis(y - event.deltaY, scale, "y"));
      }
    };

    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleWheel);
  }, [animateZoomTo, zoomAtPoint, viewportRef, clampPanAxis]);

  // Fallback for input that never reaches the wheel handler above — e.g. a trackpad/OS/browser
  // combination that doesn't translate a pinch gesture into a ctrlKey wheel event at all.
  // Anchored on the viewport's own center.
  const zoomByButton = useCallback(
    (direction: 1 | -1) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const rect = viewport.getBoundingClientRect();
      zoomAtPoint(
        (current) => computeZoomScaleForButton(current, direction, minScaleRef.current),
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
      );
    },
    [zoomAtPoint, viewportRef],
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

      // fitToFrame sets panX/panY/zoomScale directly, so any in-flight centerOnElement glide would
      // otherwise resume overwriting it on its very next frame.
      // eslint-disable-next-line react-hooks/immutability -- see zoomScaleRef comment in fitToFrame
      centerAnimationRef.current = null;
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

      // Keep zoomScaleRef/minScaleRef current immediately so a wheel/pinch event firing right after
      // fitToFrame reads the new scale instead of a stale one from before this render commits.
      const newMinScale = Math.min(ZOOM_MIN_SCALE, fitScale);
      // eslint-disable-next-line react-hooks/immutability -- see comment above
      minScaleRef.current = newMinScale;
      setMinScale(newMinScale);
      // eslint-disable-next-line react-hooks/immutability -- see comment above
      zoomScaleRef.current = fitScale;
      setZoomScale(fitScale);
      setPanX(viewportRect.width / 2 - (contentOriginX + contentWidth / 2) * fitScale);
      setPanY(viewportRect.height / 2 - (contentOriginY + contentHeight / 2) * fitScale);
    },
    [viewportRef, zoomScale, panX, panY],
  );

  // Tracks the eased "fly to" glide started by centerOnElement below — unlike zoomAnimationRef's
  // wheel-notch glide (which re-anchors around a fixed *screen* point every frame), this eases
  // panX/panY/zoomScale together toward one fixed target, since the destination here is "this
  // element's content-space center on screen", not "whatever's under the cursor right now" —
  // matching the single smooth flight of Google Maps' own click-to-center-and-zoom.
  const centerAnimationRef = useRef<{
    startPanX: number;
    startPanY: number;
    startScale: number;
    targetPanX: number;
    targetPanY: number;
    targetScale: number;
    startTime: number;
  } | null>(null);
  const centerAnimationFrameIdRef = useRef<number | null>(null);
  // Ref-indirection for the same reason stepZoomAnimationRef needs it above: this schedules its
  // own next frame and can't reference the `const` it's assigned to from inside its own body.
  const stepCenterAnimationRef = useRef<() => void>(() => {});

  const stepCenterAnimation = useCallback(() => {
    const anim = centerAnimationRef.current;
    if (!anim) {
      centerAnimationFrameIdRef.current = null;
      return;
    }

    const t = Math.min(1, (performance.now() - anim.startTime) / CENTER_ON_ELEMENT_DURATION_MS);
    const eased = 1 - Math.pow(1 - t, 3);
    const scale = anim.startScale + (anim.targetScale - anim.startScale) * eased;
    const px = anim.startPanX + (anim.targetPanX - anim.startPanX) * eased;
    const py = anim.startPanY + (anim.targetPanY - anim.startPanY) * eased;

    // eslint-disable-next-line react-hooks/immutability -- see zoomScaleRef comment in fitToFrame
    zoomScaleRef.current = scale;
    setZoomScale(scale);
    setPanX(px);
    setPanY(py);

    if (t < 1) {
      centerAnimationFrameIdRef.current = requestAnimationFrame(() => stepCenterAnimationRef.current());
    } else {
      // eslint-disable-next-line react-hooks/immutability -- see zoomScaleRef comment in fitToFrame
      centerAnimationRef.current = null;
      centerAnimationFrameIdRef.current = null;
    }
  }, []);
  useEffect(() => {
    stepCenterAnimationRef.current = stepCenterAnimation;
  }, [stepCenterAnimation]);

  // Same screen->content conversion as fitToFrame/zoomAtPoint, but targeting one element's center
  // at a fixed scale rather than fitting a bounding box — used for "click a node, bring it to a
  // comfortable reading scale, centered" instead of "fit everything on screen". Glides there via
  // stepCenterAnimation rather than jumping instantly.
  const centerOnElement = useCallback(
    (
      element: Element | null | undefined,
      targetScale: number,
      obscured?: { width: number; side: "left" | "right" } | null,
    ) => {
      const viewport = viewportRef.current;
      if (!viewport || !element) return;

      const viewportRect = viewport.getBoundingClientRect();
      if (viewportRect.width <= 0 || viewportRect.height <= 0) return;

      const rect = element.getBoundingClientRect();
      // Reads zoomScaleRef/minScaleRef/panXRef/panYRef (not the zoomScale/minScale/panX/panY state
      // closures) for the same reason zoomAtPoint does: this is invoked from a D3 click handler
      // rebound only when a largely-unrelated effect's deps change, so a state closure here would
      // compute against whatever pan/zoom was current when that effect last ran rather than the
      // live value.
      const currentScale = zoomScaleRef.current;
      const newScale = clampZoomScale(targetScale, minScaleRef.current);
      const centerX = (rect.left + rect.width / 2 - viewportRect.left - panXRef.current) / currentScale;
      const centerY = (rect.top + rect.height / 2 - viewportRect.top - panYRef.current) / currentScale;
      // With an overlay obscuring one side, "centered on screen" means centered in the strip that
      // remains visible beside it, not the viewport's full width — otherwise the element ends up
      // right where the overlay covers it.
      const availableCenterX = !obscured
        ? viewportRect.width / 2
        : obscured.side === "left"
          ? obscured.width + (viewportRect.width - obscured.width) / 2
          : (viewportRect.width - obscured.width) / 2;
      const targetPanX = availableCenterX - centerX * newScale;
      const targetPanY = viewportRect.height / 2 - centerY * newScale;

      // Cancel any in-flight wheel-notch glide so it doesn't fight this animation over the same
      // panX/panY/zoomScale state.
      zoomAnimationRef.current = null;
      if (animationFrameIdRef.current !== null) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }

      // eslint-disable-next-line react-hooks/immutability -- see zoomScaleRef comment in fitToFrame
      centerAnimationRef.current = {
        startPanX: panXRef.current,
        startPanY: panYRef.current,
        startScale: currentScale,
        targetPanX,
        targetPanY,
        targetScale: newScale,
        startTime: performance.now(),
      };
      if (centerAnimationFrameIdRef.current === null) {
        centerAnimationFrameIdRef.current = requestAnimationFrame(() => stepCenterAnimationRef.current());
      }
    },
    [viewportRef],
  );

  // Click-and-drag pan over empty background. Only starts outside a node/its toolbar so it
  // doesn't fight their own click/hover interactions.
  const lastPointRef = useRef({ x: 0, y: 0 });

  // handlePointerDown/handlePointerMove/handlePointerUp are registered as window listeners via
  // referentially-stable wrappers (see stablePointerMove/stablePointerUp below), so they can't just
  // read zoomScale/minScale directly — that would freeze them at whatever value was current when
  // the listener was attached. Mirroring them into refs gives the closures a live read instead; every
  // setZoomScale/setMinScale call site updates its ref in the same spot, so there's no separate
  // effect racing those writes.
  const zoomScaleRef = useRef(zoomScale);
  const minScaleRef = useRef(minScale);
  // Live mirrors of panX/panY, kept in sync via effect below — only read at the *start* of
  // centerOnElement (a discrete click, not a hot path), so a render's worth of lag from the effect
  // is imperceptible, unlike zoomScaleRef/minScaleRef's manual same-tick updates above.
  const panXRef = useRef(panX);
  const panYRef = useRef(panY);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability -- see zoomScaleRef comment in fitToFrame
    panXRef.current = panX;
  }, [panX]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability -- see zoomScaleRef comment in fitToFrame
    panYRef.current = panY;
  }, [panY]);

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
        if (current.distance <= 0) {
          return;
        }
        zoomAtPoint(
          () =>
            clampZoomScale(
              current.scale * Math.pow(distance / current.distance, ZOOM_PINCH_SCALE_SPEED),
              minScaleRef.current,
            ),
          (a.x + b.x) / 2,
          (a.y + b.y) / 2,
        );
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
      // Starting a background drag takes over from any in-flight centerOnElement glide, rather
      // than fighting it over the same panX/panY state.
      // eslint-disable-next-line react-hooks/immutability -- see zoomScaleRef comment in fitToFrame
      centerAnimationRef.current = null;
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
      if (animationFrameIdRef.current !== null) cancelAnimationFrame(animationFrameIdRef.current);
      if (centerAnimationFrameIdRef.current !== null) cancelAnimationFrame(centerAnimationFrameIdRef.current);
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
    centerOnElement,
    handlePointerDown,
  };
}
