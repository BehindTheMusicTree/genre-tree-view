import * as d3 from "d3";

import { SCENE_SPLIT_PARENT_NAME } from "./constants";
import { GenreTreeNode } from "./types";

type D3Node = d3.HierarchyNode<GenreTreeNode>;

export interface SceneStack {
  parent: D3Node;
  commercial: D3Node;
  underground: D3Node;
  /** The ring a node sits on: its depth, pushed past the commercial subtree's deepest ring when it
   * belongs to the underground subtree. */
  ringDepthOf: (node: D3Node) => number;
  isUnderground: (node: D3Node) => boolean;
}

/** Finds the scene split in a core hierarchy: the SCENE_SPLIT_PARENT_NAME node whose two children
 * are a commercial and an underground subtree, drawn one after the other along the radius.
 * Returns null when there is no such node or none of its children carries a `scene` (data predating
 * the split); throws when they do but aren't exactly one of each. */
export function findSceneStack(hierarchy: D3Node): SceneStack | null {
  const parent = hierarchy.descendants().find((d) => d.data.name === SCENE_SPLIT_PARENT_NAME);
  const children = parent?.children ?? [];
  if (!parent || !children.some((child) => child.data.scene)) return null;
  const commercial = children.filter((child) => child.data.scene === "commercial");
  const underground = children.filter((child) => child.data.scene === "underground");
  if (children.length !== 2 || commercial.length !== 1 || underground.length !== 1) {
    throw new Error(
      `"${SCENE_SPLIT_PARENT_NAME}" must have exactly one commercial and one underground child, got: ${children
        .map((child) => `${child.data.name} (${child.data.scene ?? "no scene"})`)
        .join(", ")}`,
    );
  }
  const undergroundNodes = new Set(underground[0].descendants());
  const offset = commercial[0].height + 1;
  return {
    parent,
    commercial: commercial[0],
    underground: underground[0],
    isUnderground: (node) => undergroundNodes.has(node),
    ringDepthOf: (node) => node.depth + (undergroundNodes.has(node) ? offset : 0),
  };
}
