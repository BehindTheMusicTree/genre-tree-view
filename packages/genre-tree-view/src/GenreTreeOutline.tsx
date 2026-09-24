"use client";

import { MouseEvent as ReactMouseEvent, ReactNode, useCallback, useEffect, useMemo, useRef } from "react";

import { InfoPanel, InfoPanelChild } from "./InfoPanel";
import { NodeToolbar } from "./NodeToolbar";
import { splitRootGroupBySide } from "./pop-core-split";
import { computeAncestorChain, findRootId, groupNodesByRoot } from "./root-grouping";
import { GenreTreeNode, GenreTreeProps } from "./types";
import { useNodeInfoPanel } from "./use-node-info-panel";
import {
  ACCENT_TEXT_COLOR,
  CENTER_NODE_NAME,
  getGenreTreeColor,
  POP_SECTOR_TINT_RATIO,
  TEXT_COLOR,
  tintSurface,
} from "./constants";

export type GenreTreeOutlineProps = Omit<
  GenreTreeProps,
  "rootColor" | "orientation" | "hideRoot" | "interactive" | "depthSpacingScale"
>;

/**
 * Text counterpart of `GenreTreeWheelRadialPopCore`: the same forest as nested collapsible lists
 * (native `<details>`), "Mainstream Pop" first, then every other root with its direct children
 * split into "Core" and "Pop" sections. Same toolbar, reparent and info-panel behavior as the
 * graphical renderers.
 */
export function GenreTreeOutline({
  nodes,
  className,
  playingNodeId,
  playState,
  reparentingNodeId = null,
  onPlayPause,
  onAddChild,
  onRenameRequest,
  onDeleteRequest,
  onReparentRequest,
  onReparent,
  onNodeClick,
  additionalActions,
  showToolbar = true,
  selectedNodeId,
  renderExtraDetails,
}: GenreTreeOutlineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { panel, showNodeInfo, closeNodeInfo } = useNodeInfoPanel();

  const groups = useMemo(() => groupNodesByRoot(nodes), [nodes]);
  const { centerGroup, ringSplits } = useMemo(() => {
    const center = groups.find((group) => group.root.name === CENTER_NODE_NAME);
    return {
      centerGroup: center,
      ringSplits: groups
        .filter((group) => group !== center)
        .map((group) => ({ root: group.root, ...splitRootGroupBySide(group) })),
    };
  }, [groups]);
  if (!centerGroup) {
    throw new Error(`GenreTreeOutline requires a root node named "${CENTER_NODE_NAME}"`);
  }

  const childrenByParentId = useMemo(() => {
    const map = new Map<string, GenreTreeNode[]>();
    for (const node of nodes) {
      if (node.parentId === null) continue;
      const siblings = map.get(node.parentId);
      if (siblings) siblings.push(node);
      else map.set(node.parentId, [node]);
    }
    return map;
  }, [nodes]);

  const aggregatedRootItemCountById = useMemo(
    () => new Map(groups.map((group) => [group.root.id, group.nodes.reduce((sum, node) => sum + node.itemCount, 0)])),
    [groups],
  );

  const popNodeIds = useMemo(
    () => new Set(ringSplits.flatMap((split) => split.popNodes.map((node) => node.id))),
    [ringSplits],
  );

  const reparentForbiddenIds = useMemo(() => {
    if (!reparentingNodeId) return new Set<string>();
    const ids = new Set<string>();
    const stack = [reparentingNodeId];
    while (stack.length > 0) {
      const id = stack.pop()!;
      ids.add(id);
      stack.push(...(childrenByParentId.get(id) ?? []).map((child) => child.id));
    }
    return ids;
  }, [reparentingNodeId, childrenByParentId]);

  // Same fill/text rules as GenreTreeWheelRadialPopCore's own getNodeVisualStyle: center subtree
  // tinted with dark text, a ring root's core side solid, its pop side tinted.
  const getNodeVisualStyle = (node: GenreTreeNode): { fill: string; textColor: string } => {
    const rootId = findRootId(node.id, nodes) ?? node.id;
    if (rootId === centerGroup.root.id) {
      return { fill: tintSurface("#ffffff", POP_SECTOR_TINT_RATIO), textColor: TEXT_COLOR };
    }
    const rootColor = getGenreTreeColor(rootId);
    return {
      fill: popNodeIds.has(node.id) ? tintSurface(rootColor, POP_SECTOR_TINT_RATIO) : rootColor,
      textColor: ACCENT_TEXT_COLOR,
    };
  };

  // Opens every collapsed ancestor section of `nodeId`'s row, scrolls it into view, and opens its
  // info panel — shared by panel chip navigation and the externally-controlled `selectedNodeId`.
  const selectNode = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      const item = scrollRef.current?.querySelector<HTMLElement>(`[data-gtv-node-id="${CSS.escape(nodeId)}"]`);
      if (!node || !item) return;
      for (let details = item.parentElement?.closest("details"); details; details = details.parentElement?.closest("details")) {
        details.open = true;
      }
      item.scrollIntoView({ block: "nearest" });
      showNodeInfo(node, item, scrollRef.current);
    },
    [nodes, showNodeInfo],
  );

  useEffect(() => {
    if (!selectedNodeId || panel?.node.id === selectedNodeId) return;
    selectNode(selectedNodeId);
  }, [selectedNodeId, panel, selectNode]);

  const handleNameClick = (event: ReactMouseEvent<HTMLButtonElement>, node: GenreTreeNode) => {
    // Keeps a name click from also toggling the enclosing <summary>'s section.
    event.preventDefault();
    if (reparentingNodeId) {
      void onReparent?.(reparentingNodeId, node.id);
      return;
    }
    showNodeInfo(node, event.currentTarget.closest("[data-gtv-node-id]"), scrollRef.current);
    onNodeClick?.(node, event.nativeEvent);
  };

  const renderRow = (node: GenreTreeNode, isRoot: boolean) => {
    const itemCount = isRoot ? aggregatedRootItemCountById.get(node.id)! : node.itemCount;
    const isReparentForbidden = reparentForbiddenIds.has(node.id);
    return (
      <span className={["gtv-outline-row", panel?.node.id === node.id && "gtv-outline-row--selected"].filter(Boolean).join(" ")}>
        {isRoot && <span className="gtv-outline-dot" style={{ background: getGenreTreeColor(node.id) }} />}
        <button
          type="button"
          className={[
            "gtv-outline-name",
            isRoot && "gtv-outline-name--root",
            reparentingNodeId && !isReparentForbidden && "gtv-outline-name--reparent-target",
          ]
            .filter(Boolean)
            .join(" ")}
          disabled={Boolean(reparentingNodeId) && isReparentForbidden}
          onClick={(event) => handleNameClick(event, node)}
        >
          {node.name}
        </button>
        <span className="gtv-outline-count">{itemCount}</span>
        {showToolbar && (
          // Keeps toolbar clicks from also toggling the enclosing <summary>'s section.
          <span className="gtv-outline-toolbar" onClick={(event) => event.preventDefault()}>
            <NodeToolbar
              node={node}
              itemCount={itemCount}
              playingNodeId={playingNodeId}
              playState={playState}
              onPlayPause={onPlayPause}
              onAddChild={onAddChild}
              onRenameRequest={onRenameRequest}
              onDeleteRequest={onDeleteRequest}
              onReparentRequest={onReparentRequest}
              additionalActions={additionalActions}
            />
          </span>
        )}
      </span>
    );
  };

  const renderItem = (node: GenreTreeNode, body: ReactNode, isRoot = false) => (
    <li key={node.id} className="gtv-outline-item" data-gtv-node-id={node.id}>
      {body ? (
        <details>
          <summary>{renderRow(node, isRoot)}</summary>
          {body}
        </details>
      ) : (
        <div className="gtv-outline-leaf">{renderRow(node, isRoot)}</div>
      )}
    </li>
  );

  const renderSubtree = (node: GenreTreeNode): ReactNode => {
    const children = childrenByParentId.get(node.id) ?? [];
    return renderItem(
      node,
      children.length > 0 && <ul className="gtv-outline-list">{children.map(renderSubtree)}</ul>,
    );
  };

  const renderSection = (label: string, branchRoots: GenreTreeNode[]) =>
    branchRoots.length > 0 && (
      <li className="gtv-outline-item">
        <details>
          <summary>
            <span className="gtv-outline-section-label">{label}</span>
          </summary>
          <ul className="gtv-outline-list">{branchRoots.map(renderSubtree)}</ul>
        </details>
      </li>
    );

  const centerChildren = childrenByParentId.get(centerGroup.root.id) ?? [];

  return (
    <div className={["gtv-outline", panel && "gtv-outline--panel-open", className].filter(Boolean).join(" ")}>
      <div className="gtv-outline-scroll" ref={scrollRef}>
        <ul className="gtv-outline-list gtv-outline-list--roots">
          {renderItem(
            centerGroup.root,
            centerChildren.length > 0 && <ul className="gtv-outline-list">{centerChildren.map(renderSubtree)}</ul>,
            true,
          )}
          {ringSplits.map(({ root, coreBranches, popBranches }) => {
            const hasChildren = coreBranches.length + popBranches.length > 0;
            return renderItem(
              root,
              hasChildren && (
                <ul className="gtv-outline-list">
                  {renderSection("Core", coreBranches.map((branch) => branch.child))}
                  {renderSection("Pop", popBranches.map((branch) => branch.child))}
                </ul>
              ),
              true,
            );
          })}
        </ul>
      </div>

      {panel && (
        <InfoPanel
          node={panel.node}
          {...getNodeVisualStyle(panel.node)}
          parentNode={(() => {
            const parent = nodes.find((n) => n.id === panel.node.parentId);
            return parent ? { node: parent, ...getNodeVisualStyle(parent) } : null;
          })()}
          childNodes={(childrenByParentId.get(panel.node.id) ?? []).map((n) => ({ node: n, ...getNodeVisualStyle(n) }))}
          ancestorNodes={computeAncestorChain(nodes, panel.node.parentId).map(
            (n): InfoPanelChild => ({ node: n, ...getNodeVisualStyle(n) }),
          )}
          side="right"
          onClose={closeNodeInfo}
          onSelectNode={selectNode}
          renderExtraDetails={renderExtraDetails}
        />
      )}
    </div>
  );
}
