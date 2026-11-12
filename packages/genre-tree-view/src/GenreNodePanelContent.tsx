import { FieldList, PanelSection } from "@behindthemusictree/ui";
import { CSSProperties, Ref, useLayoutEffect, useMemo, useRef } from "react";

import { buildTreeIndex } from "./tree-index";
import { GenreNodeStyle, GenreNodeStyleResolver, GenreTreeNode } from "./types";

// Hosts only know the selected node's real count, not its relatives', so Family and Ancestors draw
// every node at one size instead of scaling by count.
const MINI_NODE_DIAMETER = 32;
const MINI_NODE_FONT_SIZE = 14;

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

function miniNodeContent(target: GenreTreeNode, background: string, labelRef?: Ref<HTMLSpanElement>) {
  return (
    <>
      <span
        className="gtv-info-panel-mini-dot"
        style={{ background, width: MINI_NODE_DIAMETER, height: MINI_NODE_DIAMETER }}
      />
      <span ref={labelRef} className="gtv-info-panel-mini-label" style={{ fontSize: MINI_NODE_FONT_SIZE }}>
        {target.name}
      </span>
    </>
  );
}

interface NodeChipProps {
  related: InfoPanelChild;
  onSelectNode: (nodeId: string) => void;
  labelRef?: Ref<HTMLSpanElement>;
}

function NodeChip({ related, onSelectNode, labelRef }: NodeChipProps) {
  return (
    <button
      type="button"
      className="gtv-info-panel-child"
      title={related.node.name}
      onClick={() => onSelectNode(related.node.id)}
    >
      {miniNodeContent(related.node, related.fill, labelRef)}
    </button>
  );
}

/** The selected node itself: drawn like a relative, with a bolder ring, and not clickable. */
function CurrentNodeChip({ node, fill }: { node: GenreTreeNode; fill: string }) {
  return (
    <span className="gtv-info-panel-child gtv-info-panel-mini-tree-current" title={node.name} aria-current="true">
      {miniNodeContent(node, fill)}
    </span>
  );
}

export interface GenreNodeAncestorsProps extends GenreNodeStyle {
  /** The selected node, drawn at the end of the lineage. */
  node: GenreTreeNode;
  ancestorNodes: InfoPanelChild[];
  onSelectNode: (nodeId: string) => void;
}

/** Collapsible "Ancestors" section: the lineage from the root down to the selected node; renders
 * nothing for a root. */
export function GenreNodeAncestors({ node, fill, ancestorNodes, onSelectNode }: GenreNodeAncestorsProps) {
  if (ancestorNodes.length === 0) return null;
  return (
    <PanelSection title="Ancestors">
      <ul className="gtv-info-panel-children-list gtv-info-panel-ancestors-list">
        {ancestorNodes.map((ancestor) => (
          <li key={ancestor.node.id}>
            <NodeChip related={ancestor} onSelectNode={onSelectNode} />
          </li>
        ))}
        <li>
          <CurrentNodeChip node={node} fill={fill} />
        </li>
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
  const sortedChildNodes = [...childNodes].sort((a, b) => b.node.itemCount - a.node.itemCount);
  const miniTreeRef = useRef<HTMLDivElement>(null);
  const parentLabelRef = useRef<HTMLSpanElement>(null);
  const parentLabelSpace = parentNode
    ? ({ "--gtv-mini-parent-font-size": `${MINI_NODE_FONT_SIZE}px` } as CSSProperties)
    : undefined;

  // The parent's label wraps above its dot, out of flow: publish its height so the mini tree
  // reserves exactly the lines it takes.
  useLayoutEffect(() => {
    const miniTree = miniTreeRef.current;
    const label = parentLabelRef.current;
    if (!miniTree || !label) return;
    const publish = () =>
      miniTree.style.setProperty("--gtv-mini-parent-label-height", `${label.getBoundingClientRect().height}px`);
    publish();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(publish);
    observer.observe(label);
    return () => observer.disconnect();
  }, [parentNode]);

  return (
    <PanelSection title="Family">
      <div ref={miniTreeRef} className="gtv-info-panel-mini-tree" style={parentLabelSpace}>
        {parentNode && (
          <div className="gtv-info-panel-mini-tree-parent">
            <NodeChip related={parentNode} onSelectNode={onSelectNode} labelRef={parentLabelRef} />
          </div>
        )}
        <div
          className={`gtv-info-panel-mini-tree-node${childNodes.length === 0 ? " gtv-info-panel-mini-tree-node--leaf" : ""}`}
        >
          <CurrentNodeChip node={node} fill={fill} />
        </div>
        <div className="gtv-info-panel-mini-tree-children">
          <span className="gtv-info-panel-mini-tree-children-title">
            {childNodes.length} {childNodes.length <= 1 ? "child" : "children"}
          </span>
          {childNodes.length > 0 && (
            <ul className="gtv-info-panel-children-list">
              {sortedChildNodes.map((child) => (
                <li key={child.node.id}>
                  <NodeChip related={child} onSelectNode={onSelectNode} />
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
    <FieldList items={[{ label, value: node.itemCount }]} />
  );
}
