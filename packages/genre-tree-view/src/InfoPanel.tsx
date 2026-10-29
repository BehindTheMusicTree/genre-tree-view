import { PointerEvent, ReactNode, useEffect, useRef, useState } from "react";
import { MdArrowBack, MdClose, MdZoomIn } from "react-icons/md";

import { getItemCountRange, INFO_PANEL_SHEET_DRAG_THRESHOLD_PX, ItemCountRange, logarithmicPosition } from "./constants";
import { InfoPanelExpandButton } from "./InfoPanelExpandButton";
import { InfoPanelSection } from "./InfoPanelSection";
import { NodeToolbar, NodeToolbarProps } from "./NodeToolbar";
import { GenreTreeNode, InfoPanelBody, InfoPanelSections } from "./types";

// Same log-scaled position as a tree card (scaled across the mini tree's own nodes), mapped onto
// a range that stays legible in the 25.5rem panel instead of the tree's 35-120px card heights.
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
  /** `node`'s ancestors root-first, including its immediate parent. Empty for a root. */
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
  /** See GenreTreeProps.hideInfoPanelTitle. */
  hideTitle?: boolean;
  /** See GenreTreeProps.itemCountLabel. */
  itemCountLabel: string;
  /** See GenreTreeProps.renderInfoPanelBody. */
  renderInfoPanelBody?: (node: GenreTreeNode, sections: InfoPanelSections) => InfoPanelBody;
  /** When set, shows a "Zoom in" action that fires it. */
  onZoomIn?: () => void;
  /** When set, renders the node's play/add-child/rename/reparent/delete actions below the
   * header. Omitted when the toolbar is disabled (see GenreTreeProps.showToolbar). */
  actions?: Omit<NodeToolbarProps, "node" | "className">;
  /** See GenreTreeProps.readOnly. */
  readOnly?: boolean;
  /** See GenreTreeProps.renderDangerZone. */
  renderDangerZone?: (node: GenreTreeNode) => ReactNode;
  /** See GenreTreeProps.expanded. */
  expanded?: boolean;
  /** See GenreTreeProps.onExpandedChange. */
  onExpandedChange?: (on: boolean) => void;
  /** See GenreTreeProps.collapsed. */
  collapsed?: boolean;
  /** See GenreTreeProps.hideExpandButton. */
  hideExpandButton?: boolean;
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
  renderInfoPanelBody,
  hideClose = false,
  hideTitle = false,
  itemCountLabel,
  onZoomIn,
  actions,
  readOnly = false,
  renderDangerZone,
  expanded = false,
  onExpandedChange,
  collapsed = false,
  hideExpandButton = false,
}: InfoPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Only styled in a narrow container, where the panel docks to the bottom as a sheet: peek covers
  // its lower part, full rises to the panel's usual top.
  const [sheetFull, setSheetFull] = useState(false);
  const grabberDragRef = useRef<{ startY: number; dragged: boolean } | null>(null);
  const onGrabberPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    grabberDragRef.current = { startY: event.clientY, dragged: false };
  };
  const onGrabberPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = grabberDragRef.current;
    if (!drag) return;
    const dy = event.clientY - drag.startY;
    if (Math.abs(dy) < INFO_PANEL_SHEET_DRAG_THRESHOLD_PX) return;
    drag.dragged = true;
    if (dy < 0) setSheetFull(true);
    else if (sheetFull) setSheetFull(false);
    else if (!hideClose) onClose();
  };
  const onGrabberClick = () => {
    const dragged = grabberDragRef.current?.dragged ?? false;
    grabberDragRef.current = null;
    if (!dragged) setSheetFull((full) => !full);
  };
  // `inert` is a boolean attribute in React 19 but an unknown string one in 18 (the peer range covers both).
  useEffect(() => {
    panelRef.current?.toggleAttribute("inert", collapsed);
  }, [collapsed]);
  const miniTreeRange = getItemCountRange([
    ...(parentNode ? [parentNode.node] : []),
    node,
    ...childNodes.map((child) => child.node),
  ]);
  const ancestorRange = getItemCountRange(ancestorNodes.map((ancestor) => ancestor.node));
  const miniNodeSize = ({ itemCount }: GenreTreeNode, range: ItemCountRange) => {
    const t = logarithmicPosition(itemCount, range);
    return {
      diameter: MINI_NODE_MIN_DIAMETER + t * (MINI_NODE_MAX_DIAMETER - MINI_NODE_MIN_DIAMETER),
      fontSize: MINI_NODE_MIN_FONT_SIZE + t * (MINI_NODE_MAX_FONT_SIZE - MINI_NODE_MIN_FONT_SIZE),
    };
  };
  const miniNodeContent = (target: GenreTreeNode, background: string, range: ItemCountRange) => {
    const { diameter, fontSize } = miniNodeSize(target, range);
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

  const dangerZone = !readOnly && renderDangerZone && (
    <div className="gtv-info-panel-danger-zone">{renderDangerZone(node)}</div>
  );

  const toolbar = actions ? <NodeToolbar key={node.id} node={node} className="gtv-info-panel-toolbar" {...actions} /> : null;
  const ancestors =
    ancestorNodes.length > 0 ? (
      <InfoPanelSection title="Ancestors">
        <ul className="gtv-info-panel-children-list gtv-info-panel-ancestors-list">
          {ancestorNodes.map(({ node: ancestor, fill }) => (
            <li key={ancestor.id}>
              <button
                type="button"
                className="gtv-info-panel-child"
                title={ancestor.name}
                onClick={() => onSelectNode(ancestor.id)}
              >
                {miniNodeContent(ancestor, fill, ancestorRange)}
              </button>
            </li>
          ))}
        </ul>
      </InfoPanelSection>
    ) : null;
  const family = (
    <>
      <InfoPanelSection title="Family">
        <div className="gtv-info-panel-mini-tree">
          {parentNode && (
            <div className="gtv-info-panel-mini-tree-parent">
              <button
                type="button"
                className="gtv-info-panel-child"
                title={parentNode.node.name}
                onClick={() => onSelectNode(parentNode.node.id)}
              >
                {miniNodeContent(parentNode.node, parentNode.fill, miniTreeRange)}
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
              {miniNodeContent(node, fill, miniTreeRange)}
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
                      {miniNodeContent(child, fill, miniTreeRange)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </InfoPanelSection>
    </>
  );
  const itemCount = (
    <dl className="gtv-info-panel-fields">
      <dt>{itemCountLabel}</dt>
      <dd>{node.itemCount}</dd>
    </dl>
  );
  const { primary, aside } = renderInfoPanelBody
    ? renderInfoPanelBody(node, { toolbar, ancestors, family, itemCount })
    : { primary: <>{toolbar}{ancestors}{family}{itemCount}</> };
  const hasAside = aside !== undefined && aside !== null && aside !== false;

  return (
    <div
      className={`gtv-info-panel gtv-info-panel--sheet${sheetFull ? " gtv-info-panel--sheet-full" : ""} gtv-info-panel--${side}${expanded ? " gtv-info-panel--expanded" : ""}${expanded && !hasAside ? " gtv-info-panel--expanded-solo" : ""}${collapsed ? " gtv-info-panel--collapsed" : ""}`}
      ref={panelRef}
    >
      <button
        type="button"
        className="gtv-info-panel-grabber"
        aria-label={sheetFull ? "Lower panel" : "Raise panel"}
        aria-expanded={sheetFull}
        onPointerDown={onGrabberPointerDown}
        onPointerUp={onGrabberPointerUp}
        onClick={onGrabberClick}
      />
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
        <span
          className={`gtv-info-panel-title${hideTitle ? " gtv-info-panel-title--hidden" : ""}`}
          style={{ color: textColor }}
        >
          {node.name}
          {node.umbrella && <span className="gtv-info-panel-umbrella-badge">umbrella</span>}
        </span>
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
        {onExpandedChange && !hideExpandButton && (
          <InfoPanelExpandButton expanded={expanded} onExpandedChange={onExpandedChange} style={{ color: textColor }} />
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
        <div className="gtv-info-panel-primary">
          {primary}
          {expanded && !hasAside && dangerZone}
        </div>
        {hasAside && (
          <div className="gtv-info-panel-aside">
            {aside}
            {expanded && dangerZone}
          </div>
        )}
      </div>
      {!expanded && dangerZone}
    </div>
  );
}
