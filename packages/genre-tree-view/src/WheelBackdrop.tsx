import { useLayoutEffect, useRef, useState } from "react";

import type { PanZoomView } from "./use-pan-zoom";
import { annularSectorPath, clampSpanToSector, dividerEnd, farRadius } from "./wheel-backdrop-geometry";

export interface WheelBackdropScene {
  key: string;
  startDeg: number;
  endDeg: number;
  /** Final color of the ring: it is cut out of the sector, not layered over it. */
  fill: string;
}

export interface WheelBackdropSector {
  key: string;
  startDeg: number;
  endDeg: number;
  fill: string;
  fillOpacity?: number;
  /** Rings (from `innerSceneRadius` out) inside this sector, e.g. underground scenes. */
  scenes?: WheelBackdropScene[];
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
 * The wheel's sector washes, underground rings and dividers. Zones are juxtaposed, never stacked:
 * a sector's rings are holes in its path (evenodd) filled by their own paths, so each zone has a
 * single fill.
 * One 1px SVG at the pivot, inside
 * the stage, so it moves with the stage on the compositor and pan/zoom never repaints it. Its
 * shapes reach just past the farthest viewport corner for the current view (not a fixed "cover any
 * zoom" radius): huge fixed shapes made Chrome composite enormous layers that it left partly
 * unrasterized mid-gesture (stair-stepped sector boundaries).
 */
export function WheelBackdrop({
  subscribeView,
  viewportSize,
  sectors,
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
          sectors.map((s) => {
            const rings = (s.scenes ?? []).flatMap((scene) => {
              const span = clampSpanToSector(scene, s);
              return span ? [{ scene, span }] : [];
            });
            const d = [
              annularSectorPath(s.startDeg, s.endDeg, 0, radius),
              ...rings.map(({ span }) => annularSectorPath(span.startDeg, span.endDeg, innerSceneRadius, radius)),
            ].join("");
            return (
              <g key={`sector-${s.key}`}>
                <path
                  className="gtv-wheel-backdrop-sector"
                  d={d}
                  fillRule="evenodd"
                  fill={s.fill}
                  fillOpacity={s.fillOpacity}
                />
                {rings.map(({ scene, span }) => (
                  <path
                    key={`scene-${scene.key}`}
                    className="gtv-wheel-scene-sector"
                    data-start-angle={(span.startDeg * Math.PI) / 180}
                    data-end-angle={(span.endDeg * Math.PI) / 180}
                    d={annularSectorPath(span.startDeg, span.endDeg, innerSceneRadius, radius)}
                    fill={scene.fill}
                  />
                ))}
              </g>
            );
          })}
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
