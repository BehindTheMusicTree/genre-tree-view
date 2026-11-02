import type { ReactNode } from "react";
import { ZoomControls } from "@behindthemusictree/ui";

import { BusyIndicator } from "./BusyIndicator";
import type { ZoomControlsVisibility } from "./types";
import type { UsePanZoomResult } from "./use-pan-zoom";

interface FloatingControlsProps {
  panZoom: Pick<UsePanZoomResult, "zoomIn" | "zoomOut" | "canZoomIn" | "canZoomOut">;
  onFit: () => void;
  zoomControls: ZoomControlsVisibility;
  /** Host content laid out beside the zoom buttons (above them on narrow containers). */
  leading?: ReactNode;
  busy?: boolean;
}

/** The bottom-right zoom in / zoom out / fit-to-frame buttons, shared by every tree layout. */
export function FloatingControls({ panZoom, onFit, zoomControls, leading, busy }: FloatingControlsProps) {
  return (
    <div className="gtv-wheel-floating-controls">
      {busy && <BusyIndicator />}
      {leading && <div className="gtv-floating-controls-leading">{leading}</div>}
      {zoomControls !== "never" && (
        <ZoomControls
          onZoomIn={panZoom.zoomIn}
          onZoomOut={panZoom.zoomOut}
          onFit={onFit}
          canZoomIn={panZoom.canZoomIn}
          canZoomOut={panZoom.canZoomOut}
          className={zoomControls === "auto" ? "gtv-zoom-controls gtv-zoom-controls--auto" : "gtv-zoom-controls"}
        />
      )}
    </div>
  );
}
