import * as d3 from "d3";
import { bench, describe } from "vitest";
import { getItemCountRange } from "../constants";
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
