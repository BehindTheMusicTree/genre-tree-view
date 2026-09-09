import { MdClose } from "react-icons/md";

import { GenreTreeNode } from "./types";

export interface InfoPanelProps {
  node: GenreTreeNode;
  side: "left" | "right";
  onClose: () => void;
}

/** Displays a clicked node's own fields — no fetching, no mutation, purely presentational (see
 * ARCHITECTURE.md). Anchored to `side` (see use-node-info-panel.ts/info-panel-geometry.ts for how
 * that's decided) by the caller's own layout, not by this component. */
export function InfoPanel({ node, side, onClose }: InfoPanelProps) {
  return (
    <div className={`gtv-info-panel gtv-info-panel--${side}`}>
      <div className="gtv-info-panel-header">
        <span className="gtv-info-panel-title">{node.name}</span>
        <button type="button" className="gtv-info-panel-close" onClick={onClose} aria-label="Close">
          <MdClose className="gtv-icon" size={16} />
        </button>
      </div>
      <dl className="gtv-info-panel-fields">
        <dt>Id</dt>
        <dd>{node.id}</dd>
        <dt>Parent id</dt>
        <dd>{node.parentId ?? "—"}</dd>
        <dt>Name</dt>
        <dd>{node.name}</dd>
        <dt>Item count</dt>
        <dd>{node.itemCount}</dd>
        <dt>Actionable</dt>
        <dd>{(node.actionable ?? true) ? "Yes" : "No"}</dd>
        <dt>Side</dt>
        <dd>{node.side ?? "core"}</dd>
      </dl>
    </div>
  );
}
