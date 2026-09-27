import { useMemo } from "react";

import { buildTreeIndex, TreeIndex } from "./tree-index";
import { GenreTreeNode } from "./types";

/** `buildTreeIndex(nodes)`, rebuilt only when `nodes`' identity changes. */
export function useTreeIndex(nodes: readonly GenreTreeNode[]): TreeIndex {
  return useMemo(() => buildTreeIndex(nodes), [nodes]);
}
