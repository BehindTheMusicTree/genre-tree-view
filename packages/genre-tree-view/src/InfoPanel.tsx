import { ReactNode, useEffect, useState } from "react";
import { MdArrowBack, MdClose, MdCloseFullscreen, MdExpandMore, MdOpenInFull, MdZoomIn } from "react-icons/md";

import { getItemCountRange, logarithmicPosition } from "./constants";
import { NodeToolbar, NodeToolbarProps } from "./NodeToolbar";
import { GenreTreeNode } from "./types";

// Same log-scaled position as a tree card (scaled across the mini tree's own nodes), mapped onto
// a range that stays legible in the 280px panel instead of the tree's 35-120px card heights.
const MINI_NODE_MIN_DIAMETER = 14;
const MINI_NODE_MAX_DIAMETER = 32;
const MINI_NODE_MIN_FONT_SIZE = 10;
const MINI_NODE_MAX_FONT_SIZE = 14;

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
  side: "left" | "right";
  onClose: () => void;
  /** Fired when the parent chip or a child chip is clicked, with that node's id — the caller
   * navigates the panel (and the tree's own selection/centering) to it. */
  onSelectNode: (nodeId: string) => void;
  /** Reselects the previously selected node; the button is hidden when omitted. */
  onPrevious?: () => void;
  previousLabel?: string;
  /** See GenreTreeProps.hideInfoPanelClose. */
  hideClose?: boolean;
  /** See GenreTreeProps.renderExtraDetails — rendered below the built-in Children section. */
  renderExtraDetails?: (node: GenreTreeNode) => ReactNode;
  /** When set, shows a "Zoom in" action that fires it. */
  onZoomIn?: () => void;
  /** When set, renders the node's play/add-child/rename/reparent/delete actions below the
   * header. Omitted when the toolbar is disabled (see GenreTreeProps.showToolbar). */
  actions?: Omit<NodeToolbarProps, "node" | "className">;
  /** See GenreTreeProps.readOnly. */
  readOnly?: boolean;
  /** See GenreTreeProps.editMode. */
  editMode?: boolean;
  /** See GenreTreeProps.onEditModeChange. */
  onEditModeChange?: (on: boolean) => void;
  /** See GenreTreeProps.renderTitleEditor. */
  renderTitleEditor?: (node: GenreTreeNode) => ReactNode;
  /** See GenreTreeProps.renderParentsEditor. */
  renderParentsEditor?: (node: GenreTreeNode) => ReactNode;
  /** See GenreTreeProps.renderDangerZone. */
  renderDangerZone?: (node: GenreTreeNode) => ReactNode;
  /** See GenreTreeProps.expanded. */
  expanded?: boolean;
  /** See GenreTreeProps.onExpandedChange. */
  onExpandedChange?: (on: boolean) => void;
}

export function isEscapeOwnedElsewhere(event: KeyboardEvent): boolean {
  if (event.defaultPrevented) return true;
  const target = event.target;
  if (target instanceof Element && target.closest("input, textarea, select, [contenteditable]:not([contenteditable=false])")) {
    return true;
  }
  return document.querySelector('dialog[open], [role="dialog"][aria-modal="true"], [role="alertdialog"]') !== null;
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
  onPrevious,
  previousLabel,
  renderExtraDetails,
  hideClose = false,
  onZoomIn,
  actions,
  readOnly = false,
  editMode = false,
  onEditModeChange,
  renderTitleEditor,
  renderParentsEditor,
  renderDangerZone,
  expanded = false,
  onExpandedChange,
}: InfoPanelProps) {
  const [familyOpen, setFamilyOpen] = useState(true);
  const editing = editMode && !readOnly;
  const shownParent = editing && renderParentsEditor ? null : parentNode;
  const miniTreeRange = getItemCountRange([
    ...(shownParent ? [shownParent.node] : []),
    node,
    ...childNodes.map((child) => child.node),
  ]);
  const miniNodeSize = ({ itemCount }: GenreTreeNode) => {
    const t = logarithmicPosition(itemCount, miniTreeRange);
    return {
      diameter: MINI_NODE_MIN_DIAMETER + t * (MINI_NODE_MAX_DIAMETER - MINI_NODE_MIN_DIAMETER),
      fontSize: MINI_NODE_MIN_FONT_SIZE + t * (MINI_NODE_MAX_FONT_SIZE - MINI_NODE_MIN_FONT_SIZE),
    };
  };
  const miniNodeContent = (target: GenreTreeNode, background: string) => {
    const { diameter, fontSize } = miniNodeSize(target);
    return (
      <>
        <span className="gtv-info-panel-mini-dot" style={{ background, width: diameter, height: diameter }} />
        <span className="gtv-info-panel-mini-label" style={{ fontSize }}>
          {target.name}
        </span>
      </>
    );
  };
  const sortedChildNodes = [...childNodes].sort((a, b) => b.node.itemCount - a.node.itemCount);

  useEffect(() => {
    if (!expanded || !onExpandedChange) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || isEscapeOwnedElsewhere(event)) return;
      onExpandedChange(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [expanded, onExpandedChange]);

  const dangerZone = editing && renderDangerZone && (
    <div className="gtv-info-panel-danger-zone">{renderDangerZone(node)}</div>
  );

  return (
    <div
      className={`gtv-info-panel gtv-info-panel--${side}${expanded ? " gtv-info-panel--expanded" : ""}${expanded && !renderExtraDetails ? " gtv-info-panel--expanded-solo" : ""}`}
    >
      <div
        className="gtv-info-panel-header"
        style={{ background: fill, color: textColor }}
      >
        {onPrevious && (
          <button
            type="button"
            className="gtv-info-panel-previous"
            style={{ color: textColor }}
            onClick={onPrevious}
            aria-label={previousLabel ? `Previous: ${previousLabel}` : "Previous"}
            title={previousLabel}
          >
            <MdArrowBack className="gtv-icon" size={16} />
          </button>
        )}
        {editing && renderTitleEditor ? (
          <div className="gtv-info-panel-title gtv-info-panel-title--editor">{renderTitleEditor(node)}</div>
        ) : (
          <span className="gtv-info-panel-title" style={{ color: textColor }}>
            {node.name}
          </span>
        )}
        {onZoomIn && (
          <button
            type="button"
            className="gtv-info-panel-zoom-in"
            style={{ color: textColor }}
            onClick={onZoomIn}
            aria-label="Zoom in"
            title="Zoom in"
          >
            <MdZoomIn className="gtv-icon" size={16} />
          </button>
        )}
        {onEditModeChange && !readOnly && (
          <button
            type="button"
            className="gtv-info-panel-edit"
            style={{ color: textColor }}
            onClick={() => onEditModeChange(!editMode)}
            aria-pressed={editMode}
          >
            {editMode ? "Done" : "Edit"}
          </button>
        )}
        {onExpandedChange && (
          <button
            type="button"
            className="gtv-info-panel-close"
            style={{ color: textColor }}
            onClick={() => onExpandedChange(!expanded)}
            aria-label={expanded ? "Collapse panel" : "Expand panel"}
          >
            {expanded ? (
              <MdCloseFullscreen className="gtv-icon" size={16} />
            ) : (
              <MdOpenInFull className="gtv-icon" size={16} />
            )}
          </button>
        )}
        {!hideClose && (
          <button
            type="button"
            className="gtv-info-panel-close"
            style={{ color: textColor }}
            onClick={onClose}
            aria-label="Close"
          >
            <MdClose className="gtv-icon" size={16} />
          </button>
        )}
      </div>
      <div className="gtv-info-panel-body">
        <div className="gtv-info-panel-main">
          {actions && <NodeToolbar key={node.id} node={node} className="gtv-info-panel-toolbar" {...actions} />}
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
          {editing && renderParentsEditor && renderParentsEditor(node)}
          <div className="gtv-info-panel-children">
            <button
              type="button"
              className="gtv-info-panel-section-toggle"
              aria-expanded={familyOpen}
              onClick={() => setFamilyOpen((open) => !open)}
            >
              <span className="gtv-info-panel-children-title">Family</span>
              <MdExpandMore className="gtv-icon gtv-info-panel-section-chevron" size={16} />
            </button>
            {familyOpen && (
              <div className="gtv-info-panel-mini-tree">
                {shownParent && (
                  <div className="gtv-info-panel-mini-tree-parent">
                    <button
                      type="button"
                      className="gtv-info-panel-child"
                      title={shownParent.node.name}
                      onClick={() => onSelectNode(shownParent.node.id)}
                    >
                      {miniNodeContent(shownParent.node, shownParent.fill)}
                    </button>
                  </div>
                )}
                <div
                    className={`gtv-info-panel-mini-tree-node${childNodes.length === 0 ? " gtv-info-panel-mini-tree-node--leaf" : ""}`}
                  >
                  <span
                    className="gtv-info-panel-child gtv-info-panel-mini-tree-current"
                    title={node.name}
                  >
                    {miniNodeContent(node, fill)}
                  </span>
                </div>
                <div className="gtv-info-panel-mini-tree-children">
                  <span className="gtv-info-panel-children-title">{childNodes.length} {childNodes.length <= 1 ? "child" : "children"}</span>
                  {childNodes.length > 0 && (
                    <ul className="gtv-info-panel-children-list">
                      {sortedChildNodes.map(({ node: child, fill }) => (
                        <li key={child.id}>
                          <button
                            type="button"
                            className="gtv-info-panel-child"
                            title={child.name}
                            onClick={() => onSelectNode(child.id)}
                          >
                            {miniNodeContent(child, fill)}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
          {expanded && dangerZone}
        </div>
        {renderExtraDetails && (
          <div className="gtv-info-panel-extra">{renderExtraDetails(node)}</div>
        )}
      </div>
      {!expanded && dangerZone}
    </div>
  );
}
