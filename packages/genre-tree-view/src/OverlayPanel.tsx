import { useEffect } from "react";
import { MdClose } from "react-icons/md";

import { isEscapeOwnedElsewhere } from "./InfoPanel";
import { GenreTreeOverlayPanel } from "./types";

/** Consumer-supplied panel reusing the expanded info panel's classes, so it covers exactly the
 * same area — see GenreTreeProps.overlayPanel. */
export function OverlayPanel({ title, content, onClose }: GenreTreeOverlayPanel) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || isEscapeOwnedElsewhere(event)) return;
      onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="gtv-info-panel gtv-info-panel--right gtv-info-panel--expanded gtv-info-panel--expanded-solo">
      <div className="gtv-info-panel-header">
        <span className="gtv-info-panel-title">{title}</span>
        <button type="button" className="gtv-info-panel-close" onClick={onClose} aria-label="Close">
          <MdClose className="gtv-icon" size={16} />
        </button>
      </div>
      <div className="gtv-info-panel-body">
        <div className="gtv-info-panel-main">{content}</div>
      </div>
    </div>
  );
}
