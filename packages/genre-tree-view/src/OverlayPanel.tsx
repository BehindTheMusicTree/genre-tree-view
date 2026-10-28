import { useEffect, useRef } from "react";
import { MdClose } from "react-icons/md";

import { isEscapeOwnedElsewhere } from "./InfoPanel";
import { InfoPanelExpandButton } from "./InfoPanelExpandButton";
import { GenreTreeOverlayPanel } from "./types";

/** Consumer-supplied panel reusing the info panel's classes, so it covers exactly the same area —
 * see GenreTreeProps.overlayPanel. */
export function OverlayPanel({
  title,
  content,
  onClose,
  expanded: controlledExpanded,
  onExpandedChange,
  extraContent,
  collapsed = false,
  hideExpandButton = false,
}: GenreTreeOverlayPanel) {
  const panelRef = useRef<HTMLDivElement>(null);
  const expandable = !!onExpandedChange;
  const expanded = expandable ? !!controlledExpanded : true;

  // `inert` is a boolean attribute in React 19 but an unknown string one in 18 (the peer range covers both).
  useEffect(() => {
    panelRef.current?.toggleAttribute("inert", collapsed);
  }, [collapsed]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || isEscapeOwnedElsewhere(event)) return;
      if (expanded && onExpandedChange) onExpandedChange(false);
      else onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [expanded, onExpandedChange, onClose]);

  const className = [
    "gtv-info-panel",
    expandable ? "gtv-info-panel--left" : "gtv-info-panel--right gtv-info-panel--overlay",
    expanded && "gtv-info-panel--expanded",
    expanded && !extraContent && "gtv-info-panel--expanded-solo",
    collapsed && "gtv-info-panel--collapsed",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={className} ref={panelRef}>
      <div className="gtv-info-panel-header">
        <span className="gtv-info-panel-title">{title}</span>
        {onExpandedChange && !hideExpandButton && (
          <InfoPanelExpandButton expanded={expanded} onExpandedChange={onExpandedChange} />
        )}
        <button type="button" className="gtv-info-panel-close" onClick={onClose} aria-label="Close">
          <MdClose className="gtv-icon" size={16} />
        </button>
      </div>
      <div className="gtv-info-panel-body">
        <div className="gtv-info-panel-main">{content}</div>
        {extraContent && <div className="gtv-info-panel-extra">{extraContent}</div>}
      </div>
    </div>
  );
}
