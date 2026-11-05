import { PanelSection } from "@behindthemusictree/ui";
import { useMemo } from "react";

import { getItemCountRange, ItemCountRange, logarithmicPosition } from "./constants";
import { buildTreeIndex } from "./tree-index";
import { GenreNodeStyle, GenreNodeStyleResolver, GenreTreeNode } from "./types";

// Same log-scaled position as a tree card (scaled across the mini tree's own nodes), mapped onto
// a range that stays legible in the detail panel instead of the tree's 35-120px card heights.
const MINI_NODE_MIN_DIAMETER = 14;
const MINI_NODE_MAX_DIAMETER = 32;
const MINI_NODE_MIN_FONT_SIZE = 10;
const MINI_NODE_MAX_FONT_SIZE = 14;

/** A related node styled to match exactly how it renders as its own `gtv-node-rect` out in the
 * tree (solid vs. tinted fill, light vs. dark text). The styling is renderer-specific (e.g.
 * `hideRoot`, pop/core sector), so renderers expose it through `onNodeStyleResolverChange`. */
export interface InfoPanelChild extends GenreNodeStyle {
  node: GenreTreeNode;
}

export interface GenreNodeRelations extends GenreNodeStyle {
  node: GenreTreeNode;
  /** `null` for a root. */
  parentNode: InfoPanelChild | null;
  childNodes: InfoPanelChild[];
  /** Root-first, including the immediate parent. Empty for a root. */
  ancestorNodes: InfoPanelChild[];
}

/** The node, its parent, children and ancestors, each with the style the tree draws it with.
 * `null` while `nodeId` is null/unknown or `resolveStyle` has not been published yet. */
export function useGenreNodeRelations(
  nodes: readonly GenreTreeNode[],
  nodeId: string | null,
  resolveStyle: GenreNodeStyleResolver | null,
): GenreNodeRelations | null {
  const index = useMemo(() => buildTreeIndex(nodes), [nodes]);
  return useMemo(() => {
    const node = nodeId === null ? undefined : index.byId.get(nodeId);
    if (!node || !resolveStyle) return null;
    const styled = (target: GenreTreeNode): InfoPanelChild => ({ node: target, ...resolveStyle(target) });
    const parent = node.parentId === null ? undefined : index.byId.get(node.parentId);
    return {
      node,
      ...resolveStyle(node),
      parentNode: parent ? styled(parent) : null,
      childNodes: (index.childrenByParentId.get(node.id) ?? []).map(styled),
      ancestorNodes: index.ancestorsOf(node.id).map(styled),
    };
  }, [index, nodeId, resolveStyle]);
}

function miniNodeContent(target: GenreTreeNode, background: string, range: ItemCountRange) {
  const t = logarithmicPosition(target.itemCount, range);
  const diameter = MINI_NODE_MIN_DIAMETER + t * (MINI_NODE_MAX_DIAMETER - MINI_NODE_MIN_DIAMETER);
  const fontSize = MINI_NODE_MIN_FONT_SIZE + t * (MINI_NODE_MAX_FONT_SIZE - MINI_NODE_MIN_FONT_SIZE);
  return (
    <>
      <span className="gtv-info-panel-mini-dot" style={{ background, width: diameter, height: diameter }} />
      <span className="gtv-info-panel-mini-label" style={{ fontSize }}>
        {target.name}
      </span>
    </>
  );
}

interface NodeChipProps {
  related: InfoPanelChild;
  range: ItemCountRange;
  onSelectNode: (nodeId: string) => void;
}

function NodeChip({ related, range, onSelectNode }: NodeChipProps) {
  return (
    <button
      type="button"
      className="gtv-info-panel-child"
      title={related.node.name}
      onClick={() => onSelectNode(related.node.id)}
    >
      {miniNodeContent(related.node, related.fill, range)}
    </button>
  );
}

export interface GenreNodeAncestorsProps {
  ancestorNodes: InfoPanelChild[];
  onSelectNode: (nodeId: string) => void;
}

/** Collapsible "Ancestors" section; renders nothing for a root. */
export function GenreNodeAncestors({ ancestorNodes, onSelectNode }: GenreNodeAncestorsProps) {
  if (ancestorNodes.length === 0) return null;
  const range = getItemCountRange(ancestorNodes.map((ancestor) => ancestor.node));
  return (
    <PanelSection title="Ancestors">
      <ul className="gtv-info-panel-children-list gtv-info-panel-ancestors-list">
        {ancestorNodes.map((ancestor) => (
          <li key={ancestor.node.id}>
            <NodeChip related={ancestor} range={range} onSelectNode={onSelectNode} />
          </li>
        ))}
      </ul>
    </PanelSection>
  );
}

export interface GenreNodeFamilyProps extends GenreNodeStyle {
  node: GenreTreeNode;
  parentNode: InfoPanelChild | null;
  childNodes: InfoPanelChild[];
  /** Fired with the id of the parent or child chip that was clicked. */
  onSelectNode: (nodeId: string) => void;
}

/** Collapsible "Family" section: a mini tree of the node's parent, itself and its children. */
export function GenreNodeFamily({ node, fill, parentNode, childNodes, onSelectNode }: GenreNodeFamilyProps) {
  const range = getItemCountRange([
    ...(parentNode ? [parentNode.node] : []),
    node,
    ...childNodes.map((child) => child.node),
  ]);
  const sortedChildNodes = [...childNodes].sort((a, b) => b.node.itemCount - a.node.itemCount);
  return (
    <PanelSection title="Family">
      <div className="gtv-info-panel-mini-tree">
        {parentNode && (
          <div className="gtv-info-panel-mini-tree-parent">
            <NodeChip related={parentNode} range={range} onSelectNode={onSelectNode} />
          </div>
        )}
        <div
          className={`gtv-info-panel-mini-tree-node${childNodes.length === 0 ? " gtv-info-panel-mini-tree-node--leaf" : ""}`}
        >
          <span className="gtv-info-panel-child gtv-info-panel-mini-tree-current" title={node.name}>
            {miniNodeContent(node, fill, range)}
          </span>
        </div>
        <div className="gtv-info-panel-mini-tree-children">
          <span className="gtv-info-panel-children-title">
            {childNodes.length} {childNodes.length <= 1 ? "child" : "children"}
          </span>
          {childNodes.length > 0 && (
            <ul className="gtv-info-panel-children-list">
              {sortedChildNodes.map((child) => (
                <li key={child.node.id}>
                  <NodeChip related={child} range={range} onSelectNode={onSelectNode} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </PanelSection>
  );
}

export interface GenreNodeItemCountProps {
  node: GenreTreeNode;
  /** Caption for the count, e.g. "Tracks". */
  label: string;
}

export function GenreNodeItemCount({ node, label }: GenreNodeItemCountProps) {
  return (
    <dl className="gtv-info-panel-fields">
      <dt>{label}</dt>
      <dd>{node.itemCount}</dd>
    </dl>
  );
}
