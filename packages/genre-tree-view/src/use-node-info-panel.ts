import { useCallback, useState } from "react";

import { GenreTreeNode } from "./types";
import { INFO_PANEL_WIDTH } from "./constants";
import { resolveInfoPanelSide } from "./info-panel-geometry";

export interface NodeInfoPanelState {
  node: GenreTreeNode;
  side: "left" | "right";
}

export interface UseNodeInfoPanelResult {
  panel: NodeInfoPanelState | null;
  /** Opens (or updates, if already open) the panel for `node`, freezing its side against the
   * clicked element's/viewport's current rects — a different node clicked later re-evaluates the
   * side fresh, but panning/zooming while it's open does not. No-ops if either rect isn't
   * measurable (e.g. not yet mounted in jsdom). */
  showNodeInfo: (node: GenreTreeNode, element: Element | null | undefined, viewport: Element | null | undefined) => void;
  closeNodeInfo: () => void;
}

/** Owns the "which node's info panel is open, and on which side" state for one renderer instance
 * (see GenreTree.tsx and the wheel renderers' top-level components) — not global, not lifted to
 * the consumer, mirroring how usePanZoom is instantiated once per viewport. */
export function useNodeInfoPanel(): UseNodeInfoPanelResult {
  const [panel, setPanel] = useState<NodeInfoPanelState | null>(null);

  const showNodeInfo = useCallback(
    (node: GenreTreeNode, element: Element | null | undefined, viewport: Element | null | undefined) => {
      if (!element || !viewport) return;
      const side = resolveInfoPanelSide(element.getBoundingClientRect(), viewport.getBoundingClientRect(), INFO_PANEL_WIDTH);
      setPanel({ node, side });
    },
    [],
  );

  const closeNodeInfo = useCallback(() => setPanel(null), []);

  return { panel, showNodeInfo, closeNodeInfo };
}
