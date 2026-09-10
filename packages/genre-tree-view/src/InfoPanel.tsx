import { ReactNode } from "react";
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
  /** Fill and text color matching how `node` itself renders as its own `gtv-node-rect` out in the
   * tree — computed by the caller for the same reason as `InfoPanelChild`'s (see above). */
  fill: string;
  textColor: string;
  /** `node`'s own parent, styled the same way as `InfoPanelChild` — null for a root, which has
   * none. */
  parentNode: InfoPanelChild | null;
  childNodes: InfoPanelChild[];
  /** `node`'s ancestors above its immediate parent, root-first — the Parent section already
   * shows the immediate parent, so this covers grandparent and up. Empty when there are none. */
  ancestorNodes: InfoPanelChild[];
  side: "left";
  onClose: () => void;
  /** Fired when the parent chip or a child chip is clicked, with that node's id — the caller
   * navigates the panel (and the tree's own selection/centering) to it. */
  onSelectNode: (nodeId: string) => void;
  /** See GenreTreeProps.renderExtraDetails — rendered below the built-in Children section. */
  renderExtraDetails?: (node: GenreTreeNode) => ReactNode;
}

/** Displays a clicked node's own fields, its parent, and its direct children — no fetching, no
 * mutation, purely presentational (see ARCHITECTURE.md). Anchored to `side`
 * (see use-node-info-panel.ts/info-panel-geometry.ts for how that's decided) by the caller's own
 * layout, not by this component. */
export function InfoPanel({
  node,
  fill,
  textColor,
  parentNode,
  childNodes,
  ancestorNodes,
  side,
  onClose,
  onSelectNode,
  renderExtraDetails,
}: InfoPanelProps) {
  return (
    <div className={`gtv-info-panel gtv-info-panel--${side}`}>
      <div
        className="gtv-info-panel-header"
        style={{ background: fill, color: textColor }}
      >
        <span className="gtv-info-panel-title" style={{ color: textColor }}>
          {node.name}
        </span>
        <button
          type="button"
          className="gtv-info-panel-close"
          style={{ color: textColor }}
          onClick={onClose}
          aria-label="Close"
        >
          <MdClose className="gtv-icon" size={16} />
        </button>
      </div>
      <dl className="gtv-info-panel-fields">
        <dt>Song count</dt>
        <dd>{node.itemCount}</dd>
        <dt>Side</dt>
        <dd>{node.side ?? "core"}</dd>
      </dl>
      {ancestorNodes.length > 0 && (
        <div className="gtv-info-panel-children">
          <span className="gtv-info-panel-children-title">Ancestors</span>
          <ul className="gtv-info-panel-children-list">
            {ancestorNodes.map(({ node: ancestor, fill, textColor }) => (
              <li key={ancestor.id}>
                <button
                  type="button"
                  className="gtv-info-panel-child"
                  style={{ background: fill, color: textColor }}
                  onClick={() => onSelectNode(ancestor.id)}
                >
                  {ancestor.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {parentNode && (
        <div className="gtv-info-panel-children">
          <span className="gtv-info-panel-children-title">Parent</span>
          <ul className="gtv-info-panel-children-list">
            <li>
              <button
                type="button"
                className="gtv-info-panel-child"
                style={{
                  background: parentNode.fill,
                  color: parentNode.textColor,
                }}
                onClick={() => onSelectNode(parentNode.node.id)}
              >
                {parentNode.node.name}
              </button>
            </li>
          </ul>
        </div>
      )}
      <div className="gtv-info-panel-children">
        <span className="gtv-info-panel-children-title">
          Children ({childNodes.length})
        </span>
        {childNodes.length > 0 && (
          <ul className="gtv-info-panel-children-list">
            {childNodes.map(({ node: child, fill, textColor }) => (
              <li key={child.id}>
                <button
                  type="button"
                  className="gtv-info-panel-child"
                  style={{ background: fill, color: textColor }}
                  onClick={() => onSelectNode(child.id)}
                >
                  {child.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {renderExtraDetails?.(node)}
    </div>
  );
}
