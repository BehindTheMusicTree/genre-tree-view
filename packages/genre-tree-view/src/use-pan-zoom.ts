import { useCallback, useEffect, useRef, useState } from "react";

import { ZOOM_MAX_SCALE, ZOOM_MIN_SCALE } from "./constants";
import { computeZoomScale, computeZoomScaleForButton } from "./zoom-pan";

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
        zoomAtPoint(computeZoomScale(zoomScale, event.deltaY), event.clientX, event.clientY);
      } else {
        setPanX((x) => x - event.deltaX);
        setPanY((y) => y - event.deltaY);
      }
    };

    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleWheel);
  }, [zoomScale, zoomAtPoint, viewportRef]);

  // Fallback for input that never reaches the wheel handler above — e.g. a trackpad/OS/browser
  // combination that doesn't translate a pinch gesture into a ctrlKey wheel event at all.
  // Anchored on the viewport's own center.
  const zoomByButton = useCallback(
    (direction: 1 | -1) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const rect = viewport.getBoundingClientRect();
      zoomAtPoint(computeZoomScaleForButton(zoomScale, direction), rect.left + rect.width / 2, rect.top + rect.height / 2);
    },
    [zoomAtPoint, zoomScale, viewportRef],
  );

  // Click-and-drag pan over empty background. Only starts outside a node/its toolbar so it
  // doesn't fight their own click/hover interactions.
  const lastPointRef = useRef({ x: 0, y: 0 });
  const handlePointerMoveRef = useRef<((event: PointerEvent) => void) | null>(null);
  const handlePointerUpRef = useRef<(() => void) | null>(null);

  const handlePointerDown = useCallback((event: React.PointerEvent) => {
    if (event.button !== 0) return;
    if ((event.target as Element).closest("g.node, foreignObject, .gtv-zoom-controls, .gtv-wheel-chip")) return;
    event.preventDefault();

    lastPointRef.current = { x: event.clientX, y: event.clientY };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - lastPointRef.current.x;
      const dy = moveEvent.clientY - lastPointRef.current.y;
      lastPointRef.current = { x: moveEvent.clientX, y: moveEvent.clientY };
      setPanX((x) => x + dx);
      setPanY((y) => y + dy);
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMoveRef.current!);
      window.removeEventListener("pointerup", handlePointerUpRef.current!);
    };

    handlePointerMoveRef.current = handlePointerMove;
    handlePointerUpRef.current = handlePointerUp;
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }, []);

  return {
    panX,
    panY,
    zoomScale,
    transform: `translate(${panX}px, ${panY}px) scale(${zoomScale})`,
    canZoomIn: zoomScale < ZOOM_MAX_SCALE,
    canZoomOut: zoomScale > ZOOM_MIN_SCALE,
    zoomIn: () => zoomByButton(1),
    zoomOut: () => zoomByButton(-1),
    handlePointerDown,
  };
}
