import type { ReactNode } from "react";
import { MdFitScreen, MdZoomIn, MdZoomOut } from "react-icons/md";

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
      <div className="gtv-zoom-controls">
        <button
          type="button"
          className={["gtv-zoom-btn", !panZoom.canZoomIn && "gtv-zoom-btn--disabled"].filter(Boolean).join(" ")}
          disabled={!panZoom.canZoomIn}
          onClick={panZoom.zoomIn}
          aria-label="Zoom in"
        >
          <MdZoomIn className="gtv-icon" size={18} />
        </button>
        <button
          type="button"
          className={["gtv-zoom-btn", !panZoom.canZoomOut && "gtv-zoom-btn--disabled"].filter(Boolean).join(" ")}
          disabled={!panZoom.canZoomOut}
          onClick={panZoom.zoomOut}
          aria-label="Zoom out"
        >
          <MdZoomOut className="gtv-icon" size={18} />
        </button>
        <button type="button" className="gtv-zoom-btn" onClick={onFit} aria-label="Fit to frame">
          <MdFitScreen className="gtv-icon" size={18} />
        </button>
      </div>
    </div>
  );
}
