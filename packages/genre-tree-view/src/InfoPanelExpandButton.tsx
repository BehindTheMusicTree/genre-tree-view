import { CSSProperties } from "react";
import { MdCloseFullscreen, MdOpenInFull } from "react-icons/md";

interface InfoPanelExpandButtonProps {
  expanded: boolean;
  onExpandedChange: (on: boolean) => void;
  style?: CSSProperties;
}

export function InfoPanelExpandButton({ expanded, onExpandedChange, style }: InfoPanelExpandButtonProps) {
  return (
    <button
      type="button"
      className="gtv-info-panel-close"
      style={style}
      onClick={() => onExpandedChange(!expanded)}
      aria-label={expanded ? "Collapse panel" : "Expand panel"}
    >
      {expanded ? <MdCloseFullscreen className="gtv-icon" size={16} /> : <MdOpenInFull className="gtv-icon" size={16} />}
    </button>
  );
}
