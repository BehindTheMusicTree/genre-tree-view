import { useCallback, useEffect, useRef, useState } from "react";

import { GenreTreeNode } from "./types";

export interface NodeInfoPanelState {
  node: GenreTreeNode;
}

export interface UseNodeInfoPanelOptions {
  /** The consumer-controlled selection (see GenreTreeProps.selectedNodeId). A transition from an
   * id to `null`/`undefined` closes the panel without firing `onSelectedNodeChange`, since the
   * consumer initiated it. */
  selectedNodeId?: string | null;
  /** See GenreTreeProps.onSelectedNodeChange. */
  onSelectedNodeChange?: (node: GenreTreeNode | null) => void;
}

export interface UseNodeInfoPanelResult {
  panel: NodeInfoPanelState | null;
  /** Opens (or updates, if already open) the panel for `node`. No-ops if `element` or `viewport`
   * is missing (e.g. not yet mounted in jsdom). Notifies `onSelectedNodeChange` when the shown node
   * changes, unless `notify` is false — pass that when syncing to the consumer's `selectedNodeId`. */
  showNodeInfo: (
    node: GenreTreeNode,
    element: Element | null | undefined,
    viewport: Element | null | undefined,
    options?: { notify?: boolean },
  ) => void;
  closeNodeInfo: () => void;
}

/** Owns the "which node's info panel is open, and on which side" state for one renderer instance
 * (see GenreTree.tsx and the wheel renderers' top-level components) — not global, not lifted to
 * the consumer, mirroring how usePanZoom is instantiated once per viewport. Every open/close goes
 * through here, so this is the one place that notifies the consumer of selection changes. */
export function useNodeInfoPanel({
  selectedNodeId,
  onSelectedNodeChange,
}: UseNodeInfoPanelOptions = {}): UseNodeInfoPanelResult {
  const [panel, setPanel] = useState<NodeInfoPanelState | null>(null);
  const [prevSelectedNodeId, setPrevSelectedNodeId] = useState(selectedNodeId);
  if (selectedNodeId !== prevSelectedNodeId) {
    setPrevSelectedNodeId(selectedNodeId);
    if (prevSelectedNodeId !== undefined) setPanel(null);
  }

  // Also written synchronously in show/close so two calls in one tick compare against each other.
  const shownNodeIdRef = useRef<string | null>(null);
  const onSelectedNodeChangeRef = useRef(onSelectedNodeChange);
  useEffect(() => {
    shownNodeIdRef.current = panel?.node.id ?? null;
    onSelectedNodeChangeRef.current = onSelectedNodeChange;
  });

  const showNodeInfo = useCallback(
    (
      node: GenreTreeNode,
      element: Element | null | undefined,
      viewport: Element | null | undefined,
      { notify = true }: { notify?: boolean } = {},
    ) => {
      if (notify && selectedNodeId !== undefined) {
        if (node.id !== selectedNodeId) onSelectedNodeChangeRef.current?.(node);
        return;
      }
      if (!element || !viewport) return;
      setPanel({ node });
      const changed = node.id !== shownNodeIdRef.current;
      shownNodeIdRef.current = node.id;
      if (changed && notify) onSelectedNodeChangeRef.current?.(node);
    },
    [selectedNodeId],
  );

  const closeNodeInfo = useCallback(() => {
    if (selectedNodeId !== undefined) {
      if (selectedNodeId !== null) onSelectedNodeChangeRef.current?.(null);
      return;
    }
    setPanel(null);
    shownNodeIdRef.current = null;
    onSelectedNodeChangeRef.current?.(null);
  }, [selectedNodeId]);

  return {
    panel: selectedNodeId !== undefined && panel?.node.id !== selectedNodeId ? null : panel,
    showNodeInfo,
    closeNodeInfo,
  };
}
