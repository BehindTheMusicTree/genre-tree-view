import { MdClose } from "react-icons/md";

import { GenreTreeNode } from "./types";

/** A direct child of the panel's node, styled to match exactly how that child renders as its own
 * `gtv-node-rect` out in the tree (solid vs. tinted fill, light vs. dark text) — computed by the
 * caller, since that styling depends on renderer-specific state (e.g. `hideRoot`, pop/core sector)
 * this component has no visibility into. */
export interface InfoPanelChild {
  node: GenreTreeNode;
  fill: string;
  textColor: string;
}

export interface InfoPanelProps {
  node: GenreTreeNode;
  childNodes: InfoPanelChild[];
  side: "left" | "right";
  onClose: () => void;
}

/** Displays a clicked node's own fields and its direct children — no fetching, no mutation,
 * purely presentational (see ARCHITECTURE.md). Anchored to `side`
 * (see use-node-info-panel.ts/info-panel-geometry.ts for how that's decided) by the caller's own
 * layout, not by this component. */
export function InfoPanel({ node, childNodes, side, onClose }: InfoPanelProps) {
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
      <div className="gtv-info-panel-children">
        <span className="gtv-info-panel-children-title">Children ({childNodes.length})</span>
        {childNodes.length > 0 && (
          <ul className="gtv-info-panel-children-list">
            {childNodes.map(({ node: child, fill, textColor }) => (
              <li key={child.id} className="gtv-info-panel-child" style={{ background: fill, color: textColor }}>
                {child.name}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
