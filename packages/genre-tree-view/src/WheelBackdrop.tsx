import { useLayoutEffect, useRef, useState, type RefObject } from "react";

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
  /** The zero-size `.gtv-wheel-stage` anchor: its offset inside the stage is the wheel's pivot. */
  pivotRef: RefObject<HTMLElement | null>;
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
// this many times larger than needed — never per gesture frame.
const SHRINK_FACTOR = 4;

/** The pivot in the stage's own (untransformed) coordinates. Measured from bounding boxes rather
 * than `offsetLeft`/`offsetTop`, which round to whole pixels: at zoom 3 that is a visible shift
 * between the backdrop and the nodes. The stage and the pivot share one transform, so their
 * relative offset divided by the stage's own scale is exact whatever the live view is. */
function measurePivot(pivotEl: HTMLElement | null): { x: number; y: number } | null {
  const stage = pivotEl?.offsetParent as HTMLElement | null;
  if (!pivotEl || !stage || stage.offsetWidth === 0) return null;
  const stageRect = stage.getBoundingClientRect();
  const pivotRect = pivotEl.getBoundingClientRect();
  const scale = stageRect.width / stage.offsetWidth;
  if (!(scale > 0)) return null;
  return { x: (pivotRect.left - stageRect.left) / scale, y: (pivotRect.top - stageRect.top) / scale };
}

/**
 * The wheel's sector washes, underground rings and dividers, drawn in one viewport-sized SVG that
 * sits behind the stage instead of inside it. Polar shapes reach "to the edge of the screen", so
 * inside the pan/zoomed stage they had to be huge elements: Chrome then composites each as a
 * huge layer and leaves tiles of it unrasterized while the stage moves (stair-stepped sector
 * boundaries mid-gesture). Here the SVG clips at its own box, so no layer ever exceeds the
 * viewport, and a `<g>` transform mirroring the stage's view keeps it registered with the nodes.
 */
export function WheelBackdrop({
  subscribeView,
  viewportSize,
  pivotRef,
  sectors,
  scenes = [],
  innerSceneRadius = 0,
  dividers,
  rotationDeg,
  layoutKey,
}: WheelBackdropProps) {
  const groupRef = useRef<SVGGElement>(null);
  const [radius, setRadius] = useState(0);
  const radiusRef = useRef(0);

  useLayoutEffect(() => {
    if (!viewportSize) return;
    const pivot = measurePivot(pivotRef.current);
    if (!pivot) return;
    return subscribeView((view) => {
      const group = groupRef.current;
      if (!group) return;
      group.setAttribute(
        "transform",
        `translate(${view.x + view.k * pivot.x} ${view.y + view.k * pivot.y}) scale(${view.k})`,
      );
      const needed = farRadius(view, viewportSize, pivot);
      const current = radiusRef.current;
      if (needed > current || needed * SHRINK_FACTOR < current) {
        // Round up to a power of two so growth steps are few and shrink never chases the view.
        const next = 2 ** Math.ceil(Math.log2(Math.max(needed, 1)));
        radiusRef.current = next;
        setRadius(next);
      }
    });
  }, [subscribeView, viewportSize, pivotRef, layoutKey]);

  return (
    <svg className="gtv-wheel-backdrop" aria-hidden="true">
      <g ref={groupRef}>
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
      </g>
    </svg>
  );
}
