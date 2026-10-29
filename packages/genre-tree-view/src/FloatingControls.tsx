import type { ReactNode } from "react";
import { ZoomControls } from "@behindthemusictree/ui";

import { BusyIndicator } from "./BusyIndicator";
import type { ControlsOrientation } from "./types";
import type { UsePanZoomResult } from "./use-pan-zoom";

interface FloatingControlsProps {
  panZoom: Pick<UsePanZoomResult, "zoomIn" | "zoomOut" | "canZoomIn" | "canZoomOut">;
  onFit: () => void;
  orientation: ControlsOrientation;
  /** Host content laid out beside (horizontal) or above (vertical) the zoom buttons. */
  leading?: ReactNode;
  busy?: boolean;
}

/** The bottom-right zoom in / zoom out / fit-to-frame buttons, shared by every tree layout. */
export function FloatingControls({ panZoom, onFit, orientation, leading, busy }: FloatingControlsProps) {
  return (
    <div
      className={[
        "gtv-wheel-floating-controls",
        orientation === "horizontal" && "gtv-wheel-floating-controls--horizontal",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {busy && <BusyIndicator />}
      {leading && <div className="gtv-floating-controls-leading">{leading}</div>}
      <ZoomControls
        onZoomIn={panZoom.zoomIn}
        onZoomOut={panZoom.zoomOut}
        onFit={onFit}
        canZoomIn={panZoom.canZoomIn}
        canZoomOut={panZoom.canZoomOut}
        orientation={orientation}
        className="gtv-zoom-controls"
      />
    </div>
  );
}
