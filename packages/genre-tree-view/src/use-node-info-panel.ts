import { useCallback, useEffect, useRef, useState } from "react";

import { GenreTreeNode } from "./types";
import { resolveInfoPanelSide } from "./info-panel-geometry";

export interface NodeInfoPanelState {
  node: GenreTreeNode;
  side: "left";
}

export interface UseNodeInfoPanelOptions {
  /** The consumer-controlled selection (see GenreTreeProps.selectedNodeId). A transition from an
   * id to `null` closes the panel without firing `onSelectedNodeChange`, since the consumer
   * initiated it. */
  selectedNodeId?: string | null;
  /** See GenreTreeProps.onSelectedNodeChange. */
  onSelectedNodeChange?: (node: GenreTreeNode | null) => void;
}

export interface UseNodeInfoPanelResult {
  panel: NodeInfoPanelState | null;
  /** Opens (or updates, if already open) the panel for `node`. No-ops if `element` or `viewport`
   * is missing (e.g. not yet mounted in jsdom). */
  showNodeInfo: (node: GenreTreeNode, element: Element | null | undefined, viewport: Element | null | undefined) => void;
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
    if (prevSelectedNodeId && selectedNodeId === null) setPanel(null);
  }

  const selectedNodeIdRef = useRef(selectedNodeId);
  const onSelectedNodeChangeRef = useRef(onSelectedNodeChange);
  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId;
    onSelectedNodeChangeRef.current = onSelectedNodeChange;
  });

  const showNodeInfo = useCallback(
    (node: GenreTreeNode, element: Element | null | undefined, viewport: Element | null | undefined) => {
      if (!element || !viewport) return;
      setPanel({ node, side: resolveInfoPanelSide() });
      // Skipped when opening for the consumer's own selectedNodeId, so it never echoes back.
      if (node.id !== selectedNodeIdRef.current) onSelectedNodeChangeRef.current?.(node);
    },
    [],
  );

  const closeNodeInfo = useCallback(() => {
    setPanel(null);
    onSelectedNodeChangeRef.current?.(null);
  }, []);

  return { panel, showNodeInfo, closeNodeInfo };
}
