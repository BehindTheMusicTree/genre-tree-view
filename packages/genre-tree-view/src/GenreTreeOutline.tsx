"use client";

import {
  memo,
  MouseEvent as ReactMouseEvent,
  useLayoutEffect,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { InfoPanel, InfoPanelChild } from "./InfoPanel";
import { NodeToolbar } from "./NodeToolbar";
import { PopCoreSplit, splitRootGroupBySide } from "./pop-core-split";
import { groupNodesByRoot } from "./root-grouping";
import { TreeIndex } from "./tree-index";
import { GenreTreeAction, GenreTreeNode, GenreTreePlayState, GenreTreeProps } from "./types";
import { useTreeIndex } from "./use-tree-index";
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
  "rootColor" | "orientation" | "hideRoot" | "interactive" | "depthSpacingScale" | "wheelZoom"
>;

interface OutlineState {
  selectedId: string | null;
  /** Node ids, plus `sectionKey`s, whose `<details>` is expanded. */
  openIds: ReadonlySet<string>;
  playingNodeId: string | null;
  playState: GenreTreePlayState | undefined;
  reparentingNodeId: string | null;
  reparentForbiddenIds: ReadonlySet<string>;
  showToolbar: boolean;
}

interface OutlineStore {
  get: () => OutlineState;
  set: (patch: Partial<OutlineState>) => void;
  subscribe: (listener: () => void) => () => void;
}

function createOutlineStore(initial: OutlineState): OutlineStore {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set: (patch) => {
      state = { ...state, ...patch };
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

// Selectors return primitives, so a row only re-renders when its own slice changes.
function useOutlineState<T>(store: OutlineStore, selector: (state: OutlineState) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(store.get()));
}

type SectionKind = "core" | "pop";
// NUL prefix keeps section keys from ever colliding with a node id.
const sectionKey = (kind: SectionKind, rootId: string) => `\u0000${kind}:${rootId}`;

interface OutlineModel {
  index: TreeIndex;
  centerRoot: GenreTreeNode;
  ringRoots: GenreTreeNode[];
  ringSplitById: ReadonlyMap<string, PopCoreSplit>;
  aggregatedRootItemCountById: ReadonlyMap<string, number>;
  styleOf: (node: GenreTreeNode) => { fill: string; textColor: string };
}

function buildOutlineModel(nodes: readonly GenreTreeNode[], index: TreeIndex): OutlineModel {
  const groups = groupNodesByRoot([...nodes]);
  const centerGroup = groups.find((group) => group.root.name === CENTER_NODE_NAME);
  if (!centerGroup) {
    throw new Error(`GenreTreeOutline requires a root node named "${CENTER_NODE_NAME}"`);
  }
  const ringGroups = groups.filter((group) => group !== centerGroup);
  const ringSplitById = new Map(ringGroups.map((group) => [group.root.id, splitRootGroupBySide(group)]));
  const popNodeIds = new Set([...ringSplitById.values()].flatMap((split) => split.popNodes.map((node) => node.id)));

  // Same fill/text rules as GenreTreeWheelRadialPopCore's own getNodeVisualStyle: center subtree
  // tinted with dark text, a ring root's core side solid, its pop side tinted.
  const styleOf = (node: GenreTreeNode) => {
    const rootId = index.rootIdById.get(node.id) ?? node.id;
    if (rootId === centerGroup.root.id) {
      return { fill: tintSurface("#ffffff", POP_SECTOR_TINT_RATIO), textColor: TEXT_COLOR };
    }
    const rootColor = getGenreTreeColor(rootId);
    return {
      fill: popNodeIds.has(node.id) ? tintSurface(rootColor, POP_SECTOR_TINT_RATIO) : rootColor,
      textColor: ACCENT_TEXT_COLOR,
    };
  };

  return {
    index,
    centerRoot: centerGroup.root,
    ringRoots: ringGroups.map((group) => group.root),
    ringSplitById,
    aggregatedRootItemCountById: new Map(
      groups.map((group) => [group.root.id, group.nodes.reduce((sum, node) => sum + node.itemCount, 0)]),
    ),
    styleOf,
  };
}

/** Identity-stable for the component's lifetime; every handler reads the latest props. */
interface OutlineCallbacks {
  onNameClick: (event: ReactMouseEvent<HTMLButtonElement>, node: GenreTreeNode) => void;
  onHover: (node: GenreTreeNode) => void;
  toggleOpen: (key: string) => void;
  onPlayPause: (nodeId: string) => void;
  onAddChild: (parentId: string) => void;
  onRenameRequest: (node: GenreTreeNode) => void;
  onDeleteRequest: (node: GenreTreeNode) => void;
  onReparentRequest: (node: GenreTreeNode) => void;
  additionalActions: (node: GenreTreeNode) => GenreTreeAction[];
}

interface OutlineItemProps {
  model: OutlineModel;
  store: OutlineStore;
  callbacks: OutlineCallbacks;
}

function handleSummaryClick(event: ReactMouseEvent, toggle: () => void) {
  // The name button and toolbar preventDefault their own clicks so they never toggle the section.
  if (event.defaultPrevented) return;
  event.preventDefault();
  toggle();
}

// Declared unwrapped and memoized separately: a named `memo(function OutlineNode …)` would bind
// the recursive `<OutlineNode>` below to the unmemoized inner function.
function OutlineNodeView({
  nodeId,
  isRoot,
  model,
  store,
  callbacks,
}: OutlineItemProps & { nodeId: string; isRoot: boolean }) {
  const node = model.index.byId.get(nodeId)!;
  const isSelected = useOutlineState(store, (s) => s.selectedId === nodeId);
  const isOpen = useOutlineState(store, (s) => s.openIds.has(nodeId));
  const isPlaying = useOutlineState(store, (s) => s.playingNodeId === nodeId);
  const playState = useOutlineState(store, (s) => (s.playingNodeId === nodeId ? s.playState : undefined));
  const reparentStatus = useOutlineState(store, (s) =>
    s.reparentingNodeId === null ? null : s.reparentForbiddenIds.has(nodeId) ? "forbidden" : "target",
  );
  const showToolbar = useOutlineState(store, (s) => s.showToolbar);

  const itemCount = isRoot ? model.aggregatedRootItemCountById.get(nodeId)! : node.itemCount;
  const children = model.index.childrenByParentId.get(nodeId) ?? [];
  const split = isRoot ? model.ringSplitById.get(nodeId) : undefined;

  const row = (
    <span className={["gtv-outline-row", isSelected && "gtv-outline-row--selected"].filter(Boolean).join(" ")}>
      <span className="gtv-outline-dot" style={{ background: model.styleOf(node).fill }} />
      <button
        type="button"
        className={[
          "gtv-outline-name",
          isRoot && "gtv-outline-name--root",
          reparentStatus === "target" && "gtv-outline-name--reparent-target",
        ]
          .filter(Boolean)
          .join(" ")}
        disabled={reparentStatus === "forbidden"}
        onClick={(event) => callbacks.onNameClick(event, node)}
        onPointerEnter={() => callbacks.onHover(node)}
        onFocus={() => callbacks.onHover(node)}
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
            playingNodeId={isPlaying ? nodeId : null}
            playState={playState}
            onPlayPause={callbacks.onPlayPause}
            onAddChild={callbacks.onAddChild}
            onRenameRequest={callbacks.onRenameRequest}
            onDeleteRequest={callbacks.onDeleteRequest}
            onReparentRequest={callbacks.onReparentRequest}
            additionalActions={callbacks.additionalActions}
          />
        </span>
      )}
    </span>
  );

  const itemProps = { model, store, callbacks };
  return (
    <li className="gtv-outline-item" data-gtv-node-id={nodeId}>
      {children.length > 0 ? (
        <details open={isOpen}>
          <summary onClick={(event) => handleSummaryClick(event, () => callbacks.toggleOpen(nodeId))}>{row}</summary>
          {isOpen && (
            <ul className="gtv-outline-list">
              {split ? (
                <>
                  <OutlineSection rootId={nodeId} kind="core" branches={split.coreBranches} {...itemProps} />
                  <OutlineSection rootId={nodeId} kind="pop" branches={split.popBranches} {...itemProps} />
                </>
              ) : (
                children.map((child) => <OutlineNode key={child.id} nodeId={child.id} isRoot={false} {...itemProps} />)
              )}
            </ul>
          )}
        </details>
      ) : (
        <div className="gtv-outline-leaf">{row}</div>
      )}
    </li>
  );
}
const OutlineNode = memo(OutlineNodeView);

const OutlineSection = memo(function OutlineSection({
  rootId,
  kind,
  branches,
  model,
  store,
  callbacks,
}: OutlineItemProps & { rootId: string; kind: SectionKind; branches: PopCoreSplit["coreBranches"] }) {
  const key = sectionKey(kind, rootId);
  const isOpen = useOutlineState(store, (s) => s.openIds.has(key));
  if (branches.length === 0) return null;
  return (
    <li className="gtv-outline-item">
      <details open={isOpen}>
        <summary onClick={(event) => handleSummaryClick(event, () => callbacks.toggleOpen(key))}>
          <span className="gtv-outline-section-label">{kind === "core" ? "Core" : "Pop"}</span>
        </summary>
        {isOpen && (
          <ul className="gtv-outline-list">
            {branches.map(({ child }) => (
              <OutlineNode key={child.id} nodeId={child.id} isRoot={false} model={model} store={store} callbacks={callbacks} />
            ))}
          </ul>
        )}
      </details>
    </li>
  );
});

/**
 * Text counterpart of `GenreTreeWheelRadialPopCore`: the same forest as nested collapsible lists
 * (`<details>`), "Mainstream Pop" first, then every other root with its direct children split
 * into "Core" and "Pop" sections. Same toolbar, reparent and info-panel behavior as the graphical
 * renderers.
 *
 * Selection and open sections live in a per-instance external store that each memoized row
 * subscribes to by its own id, so selecting a node re-renders only the two affected rows and the
 * panel, and a collapsed section's rows aren't rendered at all.
 */
export function GenreTreeOutline(props: GenreTreeOutlineProps) {
  const {
    nodes,
    className,
    playingNodeId = null,
    playState,
    reparentingNodeId = null,
    showToolbar = true,
    selectedNodeId,
    renderExtraDetails,
  } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const index = useTreeIndex(nodes);
  const model = useMemo(() => buildOutlineModel(nodes, index), [nodes, index]);

  const reparentForbiddenIds = useMemo(() => {
    const ids = new Set<string>();
    const stack = reparentingNodeId ? [reparentingNodeId] : [];
    while (stack.length > 0) {
      const id = stack.pop()!;
      ids.add(id);
      stack.push(...(index.childrenByParentId.get(id) ?? []).map((child) => child.id));
    }
    return ids;
  }, [reparentingNodeId, index]);

  const [store] = useState(() =>
    createOutlineStore({
      selectedId: null,
      openIds: new Set(),
      playingNodeId,
      playState,
      reparentingNodeId,
      reparentForbiddenIds,
      showToolbar,
    }),
  );
  useLayoutEffect(() => {
    store.set({ playingNodeId, playState, reparentingNodeId, reparentForbiddenIds, showToolbar });
  }, [store, playingNodeId, playState, reparentingNodeId, reparentForbiddenIds, showToolbar]);

  const latestProps = useRef(props);
  useLayoutEffect(() => {
    latestProps.current = props;
  });

  const callbacks = useMemo<OutlineCallbacks>(
    () => ({
      onNameClick: (event, node) => {
        // Keeps a name click from also toggling the enclosing <summary>'s section.
        event.preventDefault();
        const { reparentingNodeId: reparenting, onReparent, onNodeClick } = latestProps.current;
        if (reparenting) {
          void onReparent?.(reparenting, node.id);
          return;
        }
        store.set({ selectedId: node.id });
        onNodeClick?.(node, event.nativeEvent);
      },
      onHover: (node) => latestProps.current.onNodeHover?.(node),
      toggleOpen: (key) => {
        const openIds = new Set(store.get().openIds);
        if (!openIds.delete(key)) openIds.add(key);
        store.set({ openIds });
      },
      onPlayPause: (nodeId) => latestProps.current.onPlayPause?.(nodeId),
      onAddChild: (parentId) => latestProps.current.onAddChild?.(parentId),
      onRenameRequest: (node) => latestProps.current.onRenameRequest?.(node),
      onDeleteRequest: (node) => latestProps.current.onDeleteRequest?.(node),
      onReparentRequest: (node) => latestProps.current.onReparentRequest?.(node),
      additionalActions: (node) => latestProps.current.additionalActions?.(node) ?? [],
    }),
    [store],
  );

  const selectedId = useOutlineState(store, (s) => s.selectedId);
  const pendingScrollIdRef = useRef<string | null>(null);

  // Expands every collapsed ancestor section of `nodeId`'s row, opens its info panel, and scrolls
  // it into view once rendered — shared by panel chip navigation and the externally-controlled
  // `selectedNodeId`. No-op for an id that isn't in the tree.
  const selectNode = (nodeId: string) => {
    const ancestors = index.ancestorsOf(nodeId);
    if (!index.rootIdById.get(nodeId)) return;
    const openIds = new Set(store.get().openIds);
    for (const ancestor of ancestors) openIds.add(ancestor.id);
    const [root, branchChild = index.byId.get(nodeId)!] = ancestors;
    if (root && root.id !== model.centerRoot.id) {
      openIds.add(sectionKey(branchChild.side === "pop" ? "pop" : "core", root.id));
    }
    if (store.get().selectedId !== nodeId) pendingScrollIdRef.current = nodeId;
    store.set({ openIds, selectedId: nodeId });
  };
  const selectNodeRef = useRef(selectNode);
  useLayoutEffect(() => {
    selectNodeRef.current = selectNode;
  });

  useLayoutEffect(() => {
    if (!selectedId || pendingScrollIdRef.current !== selectedId) return;
    pendingScrollIdRef.current = null;
    scrollRef.current
      ?.querySelector(`[data-gtv-node-id="${CSS.escape(selectedId)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  useEffect(() => {
    if (!selectedNodeId || selectedId === selectedNodeId) return;
    selectNodeRef.current(selectedNodeId);
  }, [selectedNodeId, selectedId]);

  const selectedNode = selectedId === null ? undefined : index.byId.get(selectedId);
  const itemProps = { model, store, callbacks };

  return (
    <div className={["gtv-outline", selectedNode && "gtv-outline--panel-open", className].filter(Boolean).join(" ")}>
      <div className="gtv-outline-scroll" ref={scrollRef}>
        <ul className="gtv-outline-list gtv-outline-list--roots">
          {[model.centerRoot, ...model.ringRoots].map((root) => (
            <OutlineNode key={root.id} nodeId={root.id} isRoot {...itemProps} />
          ))}
        </ul>
      </div>

      {selectedNode && (
        <InfoPanel
          node={selectedNode}
          {...model.styleOf(selectedNode)}
          parentNode={(() => {
            const parent = index.byId.get(selectedNode.parentId ?? "");
            return parent ? { node: parent, ...model.styleOf(parent) } : null;
          })()}
          childNodes={(index.childrenByParentId.get(selectedNode.id) ?? []).map((n) => ({ node: n, ...model.styleOf(n) }))}
          ancestorNodes={index
            .ancestorsOf(selectedNode.id)
            .slice(0, -1)
            .map((n): InfoPanelChild => ({ node: n, ...model.styleOf(n) }))}
          side="right"
          onClose={() => store.set({ selectedId: null })}
          onSelectNode={(id) => selectNodeRef.current(id)}
          renderExtraDetails={renderExtraDetails}
        />
      )}
    </div>
  );
}
