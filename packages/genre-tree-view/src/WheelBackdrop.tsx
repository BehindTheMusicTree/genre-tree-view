import { useLayoutEffect, useRef, useState } from "react";

import type { PanZoomView } from "./use-pan-zoom";
import { annularSectorPath, dividerEnd, farRadius } from "./wheel-backdrop-geometry";

export interface WheelBackdropSector {
  key: string;
  startDeg: number;
  endDeg: number;
  fill: string;
  fillOpacity?: number;
}

export interface WheelBackdropDivider {
  key: string;
  angleDeg: number;
}

export interface WheelBackdropProps {
  /** From usePanZoom: called with the live view on subscribe, every gesture frame and commit. */
  subscribeView: (listener: (view: PanZoomView) => void) => () => void;
  viewportSize: { width: number; height: number } | null;
  /** Pie-slice washes from the pivot out to the viewport edge. */
  sectors: WheelBackdropSector[];
  /** Ring-shaped washes starting at `innerSceneRadius` (e.g. the underground scene). */
  scenes?: WheelBackdropSector[];
  innerSceneRadius?: number;
  dividers: WheelBackdropDivider[];
  /** Rotates the whole backdrop around the pivot (GenreTreeWheel's wheel rotation). */
  rotationDeg?: number;
  /** Changes whenever the pivot moves inside the stage for a reason other than `viewportSize`. */
  layoutKey?: unknown;
}

// The drawn radius only changes (re-rendering every path) when the view outgrows it, or when it is
// more than SHRINK_FACTOR times what the view needs: bounding the excess bounds the stage layer's
// raster size. Each redraw leaves GROW_HEADROOM, so a zoom gesture redraws only every few steps.
const GROW_HEADROOM = 1.5;
const SHRINK_FACTOR = 2;

/** The backdrop's origin (the wheel pivot) in the coordinates of the pan/zoom-transformed stage,
 * which `.gtv-wheel-stage` (the backdrop's parent) is positioned in. Read from the DOM rather than a
 * ref because a parent's ref is not attached yet when a child's layout effect runs on mount.
 * Bounding boxes rather than offsets: those round to whole pixels, a visible drift at high zoom.
 * The stage and the backdrop share one transform, so their offset divided by the stage's scale is
 * exact whatever the live view is. */
function measurePivot(svg: SVGSVGElement | null): { x: number; y: number } | null {
  const stage = svg?.parentElement?.offsetParent;
  if (!svg || !(stage instanceof HTMLElement) || stage.offsetWidth === 0) return null;
  const stageRect = stage.getBoundingClientRect();
  const scale = stageRect.width / stage.offsetWidth;
  if (!(scale > 0)) return null;
  const pivotRect = svg.getBoundingClientRect();
  return { x: (pivotRect.left - stageRect.left) / scale, y: (pivotRect.top - stageRect.top) / scale };
}

/**
 * The wheel's sector washes, underground rings and dividers: one 1px SVG at the pivot, inside
 * the stage, so it moves with the stage on the compositor and pan/zoom never repaints it. Its
 * shapes reach just past the farthest viewport corner for the current view (not a fixed "cover any
 * zoom" radius): huge fixed shapes made Chrome composite enormous layers that it left partly
 * unrasterized mid-gesture (stair-stepped sector boundaries).
 */
export function WheelBackdrop({
  subscribeView,
  viewportSize,
  sectors,
  scenes = [],
  innerSceneRadius = 0,
  dividers,
  rotationDeg,
  layoutKey,
}: WheelBackdropProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [radius, setRadius] = useState(0);
  const radiusRef = useRef(0);

  useLayoutEffect(() => {
    if (!viewportSize) return;
    const pivot = measurePivot(svgRef.current);
    if (!pivot) return;
    return subscribeView((view) => {
      const needed = farRadius(view, viewportSize, pivot);
      const current = radiusRef.current;
      if (needed > current || needed * SHRINK_FACTOR < current) {
        const next = needed * GROW_HEADROOM;
        radiusRef.current = next;
        setRadius(next);
      }
    });
  }, [subscribeView, viewportSize, layoutKey]);

  return (
    <svg ref={svgRef} className="gtv-wheel-backdrop" width={1} height={1} overflow="visible" aria-hidden="true">
      <g
        className="gtv-wheel-backdrop-rotor"
        style={rotationDeg === undefined ? undefined : { transform: `rotate(${rotationDeg}deg)` }}
      >
        {radius > 0 &&
          sectors.map((s) => (
            <path
              key={`sector-${s.key}`}
              className="gtv-wheel-backdrop-sector"
              d={annularSectorPath(s.startDeg, s.endDeg, 0, radius)}
              fill={s.fill}
              fillOpacity={s.fillOpacity}
            />
          ))}
        {radius > 0 &&
          scenes.map((s) => (
            <path
              key={`scene-${s.key}`}
              className="gtv-wheel-scene-sector"
              data-start-angle={(s.startDeg * Math.PI) / 180}
              data-end-angle={(s.endDeg * Math.PI) / 180}
              d={annularSectorPath(s.startDeg, s.endDeg, innerSceneRadius, radius)}
              fill={s.fill}
              fillOpacity={s.fillOpacity}
            />
          ))}
        {radius > 0 &&
          dividers.map((d) => (
            <line
              key={`divider-${d.key}`}
              className="gtv-wheel-backdrop-divider"
              x1={0}
              y1={0}
              {...dividerEnd(d.angleDeg, radius)}
            />
          ))}
      </g>
    </svg>
  );
}
