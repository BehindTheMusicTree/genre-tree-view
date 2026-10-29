import * as d3 from "d3";
import { bench, describe } from "vitest";
import { getItemCountRange, POP_TREE_DEPTH_RADIAL_SPACING } from "../constants";
import { buildCoreHierarchy, computeCoreRadialLayout } from "../core-radial-layout";
import {
  buildPopHierarchy,
  computePopRadialLayout,
  hideCollidingLabels,
  renderPopSubtree,
  type RenderPopSubtreeCallbacks,
} from "../pop-core-radial-layout";
import type { GenreTreeNode } from "../types";
import fixtureJson from "../__tests__/fixtures/genre-tree.json";

const fixture = fixtureJson as GenreTreeNode[];

const childrenByParent = new Map<string | null, GenreTreeNode[]>();
for (const node of fixture) {
  const siblings = childrenByParent.get(node.parentId) ?? [];
  siblings.push(node);
  childrenByParent.set(node.parentId, siblings);
}
const collectSubtree = (root: GenreTreeNode): GenreTreeNode[] => [
  root,
  ...(childrenByParent.get(root.id) ?? []).flatMap(collectSubtree),
];
const largestSubtree = (childrenByParent.get(null) ?? [])
  .map(collectSubtree)
  .reduce((a, b) => (b.length > a.length ? b : a));

const largestCoreSubtree = (childrenByParent.get(largestSubtree[0].id) ?? [])
  .map(collectSubtree)
  .reduce((a, b) => (b.length > a.length ? b : a));

const range = getItemCountRange(largestSubtree);
const callbacks: RenderPopSubtreeCallbacks = { onReparentTargetSelect: () => {} };

const createSvg = () => {
  const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  document.body.appendChild(svgEl);
  return d3.select(svgEl).append("g") as unknown as d3.Selection<SVGGElement, unknown, null, undefined>;
};
const layout = () => computePopRadialLayout(d3, buildPopHierarchy(d3, largestSubtree), 0, 1000, 80);

describe(`pop-core on the largest fixture root (${largestSubtree.length} nodes)`, () => {
  bench("buildPopHierarchy + computePopRadialLayout", () => {
    layout();
  });

  bench("renderPopSubtree", () => {
    const svg = createSvg();
    renderPopSubtree(d3, svg, layout(), "#123456", null, [], callbacks, range);
    document.body.innerHTML = "";
  });

  const svg = createSvg();
  renderPopSubtree(d3, svg, layout(), "#123456", null, [], callbacks, range);
  bench("hideCollidingLabels at zoom 1", () => {
    hideCollidingLabels(d3, svg, range, 1);
  });
  bench("hideCollidingLabels at zoom 3", () => {
    hideCollidingLabels(d3, svg, range, 3);
  });
});

describe(`core on the largest fixture root's largest child (${largestCoreSubtree.length} nodes)`, () => {
  bench("buildCoreHierarchy + computeCoreRadialLayout", () => {
    computeCoreRadialLayout(d3, buildCoreHierarchy(d3, largestCoreSubtree), 0, 200, 1000, POP_TREE_DEPTH_RADIAL_SPACING);
  });
});
