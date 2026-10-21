import { ReactNode, useState } from "react";
import { MdExpandMore } from "react-icons/md";

interface InfoPanelSectionProps {
  title: string;
  children: ReactNode;
}

/** A titled InfoPanel section whose body collapses/expands from a chevron toggle in its header. */
export function InfoPanelSection({ title, children }: InfoPanelSectionProps) {
  const [open, setOpen] = useState(true);
  return (
    <div className="gtv-info-panel-children">
      <button
        type="button"
        className="gtv-info-panel-section-toggle"
        aria-expanded={open}
        onClick={() => setOpen((isOpen) => !isOpen)}
      >
        <span className="gtv-info-panel-children-title">{title}</span>
        <MdExpandMore className="gtv-icon gtv-info-panel-section-chevron" size={16} />
      </button>
      {open && children}
    </div>
  );
}
