import * as d3 from "d3";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildPopHierarchy,
  calculateMainstreamPopOuterCircleRadius,
  calculatePopSubtreeRadialExtent,
  computeCenterRadialLayout,
  computePopRadialLayout,
  getRadialDepthRadius,
  getRadialPointOnCircle,
  hideCollidingLabels,
  measureWedge,
  POP_WEDGE_SPAN_DEGREES,
  popRadiusOfDepth,
  renderPopSubtree,
  type RenderPopSubtreeCallbacks,
} from "../pop-core-radial-layout";
import { buildTreeHierarchyStructure } from "../NodeHelper";
import {
  POP_TREE_DEPTH_RADIAL_SPACING,
  MAX_NODE_WIDTH,
  LINK_TO_NODE_HEIGHT_RATIO,
  MAX_NODE_HEIGHT,
  getItemCountRange,
  NODE_DOT_MAX_RADIUS,
  RADIAL_CORE_LINK_TINT_RATIO,
  RADIAL_POP_LINK_TINT_RATIO,
  TEXT_COLOR,
  TEXT_MUTED_COLOR,
  tintSurface,
} from "../constants";
import type { GenreTreeNode } from "../types";
import { linkPathEndpoints } from "./link-path-test-utils";

afterEach(() => {
  document.body.innerHTML = "";
});

function createSvg() {
  const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  document.body.appendChild(svgEl);
  return d3.select(svgEl).append("g") as unknown as d3.Selection<
    SVGGElement,
    unknown,
    null,
    undefined
  >;
}

const noopCallbacks: RenderPopSubtreeCallbacks = {
  onReparentTargetSelect: () => {},
};

const popRock: GenreTreeNode[] = [
  { id: "rock-pop", parentId: null, name: "Pop Rock", itemCount: 0 },
  { id: "arena-rock", parentId: "rock-pop", name: "Arena Rock", itemCount: 0 },
  { id: "soft-rock", parentId: "rock-pop", name: "Soft Rock", itemCount: 0 },
  {
    id: "yacht-rock",
    parentId: "arena-rock",
    name: "Yacht Rock",
    itemCount: 0,
  },
];

describe("buildPopHierarchy", () => {
  const popWithExcludedRootParent: GenreTreeNode[] = [
    { id: "rock-pop", parentId: "root-a", name: "Pop Rock", itemCount: 0 },
    {
      id: "arena-rock",
      parentId: "rock-pop",
      name: "Arena Rock",
      itemCount: 0,
    },
  ];

  it("roots the d3 hierarchy at the pop child, despite its parentId pointing at the excluded ring root", () => {
    const hierarchy = buildPopHierarchy(d3, popWithExcludedRootParent);
    expect(hierarchy.data.id).toBe("rock-pop");
    expect(hierarchy.parent).toBeNull();
  });

  it("keeps the root pop child's own parentId pointing at the real (excluded) ring root, not normalized to null", () => {
    const hierarchy = buildPopHierarchy(d3, popWithExcludedRootParent);
    expect(hierarchy.data.id).toBe("rock-pop");
    expect(hierarchy.data.parentId).toBe("root-a");
  });

  it("leaves non-root descendants' data untouched, still pointing at their real in-subtree parent", () => {
    const hierarchy = buildPopHierarchy(d3, popWithExcludedRootParent);
    const arenaRock = hierarchy
      .descendants()
      .find((d) => d.data.id === "arena-rock")!;
    expect(arenaRock.data.parentId).toBe("rock-pop");
  });
});

describe("computePopRadialLayout", () => {
  it("places the pop child (depth 0) one depthSpacing inside coreRootCircleRadius, inside its wedge", () => {
    const hierarchy = buildPopHierarchy(d3, popRock);
    const coreRootCircleRadius = 5000;
    const laidOut = computePopRadialLayout(
      d3,
      hierarchy,
      0,
      coreRootCircleRadius,
    );
    const popChild = laidOut
      .descendants()
      .find((d) => d.data.id === "rock-pop")!;
    const expectedRadius = coreRootCircleRadius - POP_TREE_DEPTH_RADIAL_SPACING;

    expect(Math.hypot(popChild.x!, popChild.y!)).toBeCloseTo(expectedRadius, 5);
    const angle = (Math.atan2(popChild.x!, -popChild.y!) * 180) / Math.PI;
    expect(Math.abs(angle)).toBeLessThan(POP_WEDGE_SPAN_DEGREES / 2);
  });

  it("places every node at coreRootCircleRadius - (depth + 1) * depthSpacing, shallowest nodes fixed just inside coreRootCircleRadius regardless of subtree height", () => {
    const hierarchy = buildPopHierarchy(d3, popRock);
    const coreRootCircleRadius = 5000;
    const laidOut = computePopRadialLayout(
      d3,
      hierarchy,
      90,
      coreRootCircleRadius,
    );

    laidOut.each((d) => {
      const radius = Math.hypot(d.x!, d.y!);
      expect(radius).toBeCloseTo(
        coreRootCircleRadius - (d.depth + 1) * POP_TREE_DEPTH_RADIAL_SPACING,
        5,
      );
    });
  });

  it("keeps every node's angle within the wedge centered on wedgeCenterAngleDegrees", () => {
    const hierarchy = buildPopHierarchy(d3, popRock);
    const wedgeCenterDeg = 90;
    const laidOut = computePopRadialLayout(d3, hierarchy, wedgeCenterDeg, 5000);

    laidOut.each((d) => {
      const angleDeg = (Math.atan2(d.x!, -d.y!) * 180) / Math.PI;
      const delta = Math.abs(((angleDeg - wedgeCenterDeg + 540) % 360) - 180);
      expect(delta).toBeLessThanOrEqual(40 + 1e-6);
    });
  });

  it("confines every node's angle to a narrower wedgeSpanDegrees when the root's real ring sector is narrower than the default 80deg wedge", () => {
    const hierarchy = buildPopHierarchy(d3, popRock);
    const wedgeCenterDeg = 90;
    const wedgeSpanDegrees = 30;
    const laidOut = computePopRadialLayout(
      d3,
      hierarchy,
      wedgeCenterDeg,
      5000,
      wedgeSpanDegrees,
    );

    laidOut.each((d) => {
      const angleDeg = (Math.atan2(d.x!, -d.y!) * 180) / Math.PI;
      const delta = Math.abs(((angleDeg - wedgeCenterDeg + 540) % 360) - 180);
      expect(delta).toBeLessThanOrEqual(wedgeSpanDegrees / 2 + 1e-6);
    });
  });

  it("keeps a single-node subtree (no children) at the wedge center, one depthSpacing inside coreRootCircleRadius", () => {
    const solo: GenreTreeNode[] = [
      { id: "solo-pop", parentId: null, name: "Solo Pop", itemCount: 0 },
    ];
    const hierarchy = buildPopHierarchy(d3, solo);
    const coreRootCircleRadius = 1000;
    const laidOut = computePopRadialLayout(
      d3,
      hierarchy,
      180,
      coreRootCircleRadius,
    );
    const node = laidOut.descendants()[0];

    expect(node.x!).toBeCloseTo(0, 5);
    expect(node.y!).toBeCloseTo(
      coreRootCircleRadius - POP_TREE_DEPTH_RADIAL_SPACING,
      5,
    );
  });

  it("places the shallowest node (the branch's own root) the same fixed distance inside coreRootCircleRadius, regardless of subtree height", () => {
    const shallow = buildPopHierarchy(d3, [
      { id: "shallow-pop", parentId: null, name: "Shallow Pop", itemCount: 0 },
    ]);
    const deep = buildPopHierarchy(d3, popRock);
    const coreRootCircleRadius = 5000;

    const laidOutShallow = computePopRadialLayout(
      d3,
      shallow,
      0,
      coreRootCircleRadius,
    );
    const laidOutDeep = computePopRadialLayout(
      d3,
      deep,
      180,
      coreRootCircleRadius,
    );

    const shallowRoot = laidOutShallow
      .descendants()
      .find((d) => d.data.id === "shallow-pop")!;
    const deepRoot = laidOutDeep
      .descendants()
      .find((d) => d.data.id === "rock-pop")!;

    // Every branch's own root lands the same fixed distance inside coreRootCircleRadius,
    // regardless of how tall the subtree beneath its ring root grows — only the deepest node's
    // distance from the mainstream circle should vary with height, not this.
    const expectedRadius = coreRootCircleRadius - POP_TREE_DEPTH_RADIAL_SPACING;
    expect(Math.hypot(shallowRoot.x!, shallowRoot.y!)).toBeCloseTo(
      expectedRadius,
      5,
    );
    expect(Math.hypot(deepRoot.x!, deepRoot.y!)).toBeCloseTo(expectedRadius, 5);
  });
});

describe("calculatePopSubtreeRadialExtent", () => {
  it("grows with the subtree's depth", () => {
    const shallow = buildPopHierarchy(d3, [
      { id: "a", parentId: null, name: "A", itemCount: 0 },
    ]);
    const deep = buildPopHierarchy(d3, popRock);

    const shallowExtent = calculatePopSubtreeRadialExtent(shallow);
    const deepExtent = calculatePopSubtreeRadialExtent(deep);

    expect(deepExtent).toBeGreaterThan(shallowExtent);
  });

  it("matches the (height + 1) * spacing + half node width + margin formula", () => {
    const hierarchy = buildPopHierarchy(d3, popRock);
    const extent = calculatePopSubtreeRadialExtent(hierarchy);
    const maxDepth = hierarchy.height;

    expect(extent).toBeCloseTo(
      (maxDepth + 1) * POP_TREE_DEPTH_RADIAL_SPACING + MAX_NODE_WIDTH / 2 + 24,
      5,
    );
  });
});

const centerWithSubtree: GenreTreeNode[] = [
  { id: "pop", parentId: null, name: "Pop", itemCount: 0 },
  { id: "pop-a", parentId: "pop", name: "Pop A", itemCount: 0 },
  { id: "pop-b", parentId: "pop", name: "Pop B", itemCount: 0 },
  { id: "pop-a-1", parentId: "pop-a", name: "Pop A 1", itemCount: 0 },
];

describe("computeCenterRadialLayout", () => {
  it("pins the depth-0 center node exactly at the origin", () => {
    const hierarchy = buildTreeHierarchyStructure(d3, centerWithSubtree);
    const laidOut = computeCenterRadialLayout(
      d3,
      hierarchy,
      100,
      POP_TREE_DEPTH_RADIAL_SPACING,
    );
    const center = laidOut.descendants().find((d) => d.data.id === "pop")!;

    expect(center.x!).toBeCloseTo(0, 5);
    expect(center.y!).toBeCloseTo(0, 5);
  });

  it("places depth-1 nodes one depthSpacing past coreRootCircleRadius, and each deeper generation one further step out", () => {
    const hierarchy = buildTreeHierarchyStructure(d3, centerWithSubtree);
    const coreRootCircleRadius = 100;
    const laidOut = computeCenterRadialLayout(
      d3,
      hierarchy,
      coreRootCircleRadius,
      POP_TREE_DEPTH_RADIAL_SPACING,
    );

    laidOut.each((d) => {
      if (d.depth === 0) return;
      const radius = Math.hypot(d.x!, d.y!);
      expect(radius).toBeCloseTo(
        coreRootCircleRadius + d.depth * POP_TREE_DEPTH_RADIAL_SPACING,
        5,
      );
    });
  });

  it("spreads depth-1 siblings proportional to their own subtree size rather than equally", () => {
    const hierarchy = buildTreeHierarchyStructure(d3, centerWithSubtree);
    const laidOut = computeCenterRadialLayout(
      d3,
      hierarchy,
      100,
      POP_TREE_DEPTH_RADIAL_SPACING,
    );
    const [a, b] = hierarchy.children!;

    // pop-a has a child (pop-a-1), pop-b doesn't: d3.tree's default separation should not split the
    // full circle evenly between them.
    const nodeA = laidOut.descendants().find((d) => d.data.id === a.data.id)!;
    const nodeB = laidOut.descendants().find((d) => d.data.id === b.data.id)!;
    const angleA = Math.atan2(nodeA.x!, -nodeA.y!);
    const angleB = Math.atan2(nodeB.x!, -nodeB.y!);

    expect(angleA).not.toBeCloseTo(angleB - Math.PI, 5);
  });
});

describe("calculateMainstreamPopOuterCircleRadius", () => {
  it("grows with the subtree's depth", () => {
    const shallow = buildTreeHierarchyStructure(d3, [
      { id: "pop", parentId: null, name: "Pop", itemCount: 0 },
      { id: "pop-a", parentId: "pop", name: "Pop A", itemCount: 0 },
    ]);
    const deep = buildTreeHierarchyStructure(d3, centerWithSubtree);

    const shallowExtent = calculateMainstreamPopOuterCircleRadius(
      shallow,
      100,
      POP_TREE_DEPTH_RADIAL_SPACING,
    );
    const deepExtent = calculateMainstreamPopOuterCircleRadius(
      deep,
      100,
      POP_TREE_DEPTH_RADIAL_SPACING,
    );

    expect(deepExtent).toBeGreaterThan(shallowExtent);
  });

  it("matches the coreRootCircleRadius + height * depthSpacing + half node width + margin formula", () => {
    const hierarchy = buildTreeHierarchyStructure(d3, centerWithSubtree);
    const coreRootCircleRadius = 100;
    const extent = calculateMainstreamPopOuterCircleRadius(
      hierarchy,
      coreRootCircleRadius,
      POP_TREE_DEPTH_RADIAL_SPACING,
    );

    expect(extent).toBeCloseTo(
      coreRootCircleRadius +
        hierarchy.height * POP_TREE_DEPTH_RADIAL_SPACING +
        MAX_NODE_WIDTH / 2 +
        24,
      5,
    );
  });
});

describe("getRadialDepthRadius", () => {
  it("is the single shared formula: coreRootCircleRadius + depth * depthSpacing", () => {
    expect(getRadialDepthRadius(0, 200, 50)).toBeCloseTo(200, 5);
    expect(getRadialDepthRadius(3, 200, 50)).toBeCloseTo(350, 5);
  });
});

describe("renderPopSubtree link rendering", () => {
  const nodes: GenreTreeNode[] = [
    { id: "pop-rock", parentId: null, name: "Pop Rock", itemCount: 1 },
    {
      id: "arena-rock",
      parentId: "pop-rock",
      name: "Arena Rock",
      itemCount: 2,
    },
  ];

  it("renders one path.gtv-link per link, visible (non-zero stroke-width, not none/transparent)", () => {
    const hierarchy = buildPopHierarchy(d3, nodes);
    const laidOut = computePopRadialLayout(d3, hierarchy, 0, 1000);
    const svg = createSvg();

    renderPopSubtree(
      d3,
      svg,
      laidOut,
      "#123456",
      null,
      [],
      noopCallbacks,
      getItemCountRange(nodes),
    );

    const links = svg.selectAll<SVGPathElement, unknown>("path.gtv-link");
    expect(links.size()).toBe(laidOut.links().length);
    links.each(function () {
      const strokeWidth = parseFloat(d3.select(this).style("stroke-width"));
      expect(strokeWidth).toBeGreaterThan(0);
      expect(d3.select(this).style("stroke")).not.toBe("none");
    });
  });

  it.each([
    [false, RADIAL_POP_LINK_TINT_RATIO],
    [true, RADIAL_CORE_LINK_TINT_RATIO],
  ])("strokes links in a muted tint of the root color (isCoreSector %s)", (isCoreSector, ratio) => {
    const hierarchy = buildPopHierarchy(d3, nodes);
    const laidOut = computePopRadialLayout(d3, hierarchy, 0, 1000);
    const svg = createSvg();

    renderPopSubtree(
      d3,
      svg,
      laidOut,
      "#123456",
      null,
      [],
      noopCallbacks,
      getItemCountRange(nodes),
      { isCoreSector },
    );

    expect(d3.color(svg.select("path.gtv-link").style("stroke"))?.formatHex()).toBe(
      tintSurface("#123456", ratio),
    );
  });

  it("strokes the Mainstream Pop center's links grey and its white dots black, not its white root color", () => {
    const hierarchy = buildPopHierarchy(d3, nodes);
    const laidOut = computePopRadialLayout(d3, hierarchy, 0, 1000);
    const svg = createSvg();

    renderPopSubtree(
      d3,
      svg,
      laidOut,
      "#ffffff",
      null,
      [],
      noopCallbacks,
      getItemCountRange(nodes),
      { isMainstreamSector: true },
    );

    expect(d3.color(svg.select("path.gtv-link").style("stroke"))?.formatHex()).toBe(
      d3.color(TEXT_MUTED_COLOR)?.formatHex(),
    );
    expect(svg.select("circle.gtv-node-dot").attr("stroke")).toBe(TEXT_COLOR);
  });

  it("renders the link to the max-itemCount node at MAX_NODE_HEIGHT × LINK_TO_NODE_HEIGHT_RATIO", () => {
    const hierarchy = buildPopHierarchy(d3, nodes);
    const laidOut = computePopRadialLayout(d3, hierarchy, 0, 1000);
    const svg = createSvg();

    renderPopSubtree(
      d3,
      svg,
      laidOut,
      "#123456",
      null,
      [],
      noopCallbacks,
      getItemCountRange(nodes),
    );

    const strokeWidth = parseFloat(
      svg.select<SVGPathElement>("path.gtv-link").style("stroke-width"),
    );
    // arena-rock is the range's max itemCount, so its link is the widest.
    expect(strokeWidth).toBeCloseTo(MAX_NODE_HEIGHT * LINK_TO_NODE_HEIGHT_RATIO, 5);
  });

  it("draws an extra root->depth1 link from rootLinkOrigin to the hierarchy's own depth-0 node, since the ring root itself isn't part of the hierarchy", () => {
    const hierarchy = buildPopHierarchy(d3, nodes);
    const coreRootCircleRadius = 1000;
    const angle = 0;
    const laidOut = computePopRadialLayout(
      d3,
      hierarchy,
      angle,
      coreRootCircleRadius,
    );
    const svg = createSvg();
    const rootLinkOrigin = getRadialPointOnCircle(angle, coreRootCircleRadius);

    renderPopSubtree(
      d3,
      svg,
      laidOut,
      "#123456",
      null,
      [],
      noopCallbacks,
      getItemCountRange(nodes),
      {
        rootLinkOrigin,
      },
    );

    const links = svg.selectAll<SVGPathElement, unknown>("path.gtv-link");
    // hierarchy.links() (pop-rock -> arena-rock) plus the extra root -> pop-rock link.
    expect(links.size()).toBe(laidOut.links().length + 1);

    const popRoot = laidOut
      .descendants()
      .find((d) => d.data.id === "pop-rock")!;
    const rootLink = links.filter((_, i, nodesArr) => {
      const d3Node = d3.select<SVGPathElement, unknown>(nodesArr[i]);
      const { start, end } = linkPathEndpoints(d3Node.attr("d")!);
      return (
        Math.abs(start[0] - rootLinkOrigin.x) < 1e-6 &&
        Math.abs(start[1] - rootLinkOrigin.y) < 1e-6 &&
        Math.abs(end[0] - popRoot.x!) < 1e-6 &&
        Math.abs(end[1] - popRoot.y!) < 1e-6
      );
    });
    expect(rootLink.size()).toBe(1);
  });

  it("omits the extra root link when rootLinkOrigin isn't given", () => {
    const hierarchy = buildPopHierarchy(d3, nodes);
    const laidOut = computePopRadialLayout(d3, hierarchy, 0, 1000);
    const svg = createSvg();

    renderPopSubtree(
      d3,
      svg,
      laidOut,
      "#123456",
      null,
      [],
      noopCallbacks,
      getItemCountRange(nodes),
    );

    const links = svg.selectAll<SVGPathElement, unknown>("path.gtv-link");
    expect(links.size()).toBe(laidOut.links().length);
  });
});

describe("renderPopSubtree label text color", () => {
  const nodes: GenreTreeNode[] = [
    { id: "pop-rock", parentId: null, name: "Pop Rock", itemCount: 1 },
  ];

  it("draws the label in dark TEXT_COLOR on the wash, keeping white ACCENT_TEXT_COLOR on hover for pop-tint sectors", () => {
    const hierarchy = buildPopHierarchy(d3, nodes);
    const laidOut = computePopRadialLayout(d3, hierarchy, 0, 1000);
    const svg = createSvg();

    renderPopSubtree(
      d3,
      svg,
      laidOut,
      "#123456",
      null,
      [],
      noopCallbacks,
      getItemCountRange(nodes),
    );

    expect(svg.select(".gtv-node-label").attr("fill")).toBe("#18181B");

    const hitArea = svg.select<SVGRectElement>(".gtv-hover-hit-area").node()!;
    hitArea.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));

    const hoverLabel = svg.select<HTMLDivElement>(".gtv-hover-label");
    expect(hoverLabel.style("color")).toBe("rgb(255, 255, 255)");

    const toolbar = svg.select<HTMLDivElement>(".gtv-toolbar").node()!;
    expect(toolbar.style.getPropertyValue("--gtv-toolbar-icon-color")).toBe(
      "#FFFFFF",
    );
  });

  it("draws the label in dark TEXT_COLOR on the wash, keeping white ACCENT_TEXT_COLOR on hover for core sectors", () => {
    const hierarchy = buildPopHierarchy(d3, nodes);
    const laidOut = computePopRadialLayout(d3, hierarchy, 0, 1000);
    const svg = createSvg();

    renderPopSubtree(
      d3,
      svg,
      laidOut,
      "#123456",
      null,
      [],
      noopCallbacks,
      getItemCountRange(nodes),
      {
        isCoreSector: true,
      },
    );

    expect(svg.select(".gtv-node-label").attr("fill")).toBe("#18181B");

    const hitArea = svg.select<SVGRectElement>(".gtv-hover-hit-area").node()!;
    hitArea.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));

    const hoverLabel = svg.select<HTMLDivElement>(".gtv-hover-label");
    expect(hoverLabel.style("color")).toBe("rgb(255, 255, 255)");

    const toolbar = svg.select<HTMLDivElement>(".gtv-toolbar").node()!;
    expect(toolbar.style.getPropertyValue("--gtv-toolbar-icon-color")).toBe(
      "#FFFFFF",
    );
  });

  it("uses dark TEXT_COLOR for the mainstream center sector (isMainstreamSector true)", () => {
    const hierarchy = buildPopHierarchy(d3, nodes);
    const laidOut = computePopRadialLayout(d3, hierarchy, 0, 1000);
    const svg = createSvg();

    renderPopSubtree(
      d3,
      svg,
      laidOut,
      "#123456",
      null,
      [],
      noopCallbacks,
      getItemCountRange(nodes),
      {
        isMainstreamSector: true,
      },
    );

    expect(svg.select(".gtv-node-label").attr("fill")).toBe("#18181B");

    const hitArea = svg.select<SVGRectElement>(".gtv-hover-hit-area").node()!;
    hitArea.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));

    const hoverLabel = svg.select<HTMLDivElement>(".gtv-hover-label");
    expect(hoverLabel.style("color")).toBe("rgb(24, 24, 27)");

    const toolbar = svg.select<HTMLDivElement>(".gtv-toolbar").node()!;
    expect(toolbar.style.getPropertyValue("--gtv-toolbar-icon-color")).toBe(
      "#18181B",
    );
  });
});

describe("renderPopSubtree onNodeClick", () => {
  const nodes: GenreTreeNode[] = [
    { id: "pop-rock", parentId: null, name: "Pop Rock", itemCount: 1 },
  ];

  it("fires onNodeClick with the node's data when its group is clicked", () => {
    const hierarchy = buildPopHierarchy(d3, nodes);
    const laidOut = computePopRadialLayout(d3, hierarchy, 0, 1000);
    const svg = createSvg();
    const onNodeClick = vi.fn();

    renderPopSubtree(
      d3,
      svg,
      laidOut,
      "#123456",
      null,
      [],
      { ...noopCallbacks, onNodeClick },
      getItemCountRange(nodes),
    );

    const group = svg.select<SVGGElement>("g.node").node()!;
    group.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(onNodeClick).toHaveBeenCalledTimes(1);
    expect(onNodeClick.mock.calls[0][0]).toEqual(
      expect.objectContaining({ id: "pop-rock" }),
    );
  });

  it("does not fire onNodeClick while a reparent is in progress", () => {
    const hierarchy = buildPopHierarchy(d3, nodes);
    const laidOut = computePopRadialLayout(d3, hierarchy, 0, 1000);
    const svg = createSvg();
    const onNodeClick = vi.fn();

    renderPopSubtree(
      d3,
      svg,
      laidOut,
      "#123456",
      "some-other-node",
      [],
      { ...noopCallbacks, onNodeClick },
      getItemCountRange(nodes),
    );

    const group = svg.select<SVGGElement>("g.node").node()!;
    group.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(onNodeClick).not.toHaveBeenCalled();
  });
});

describe("renderPopSubtree selection highlight", () => {
  const nodes: GenreTreeNode[] = [
    { id: "pop-rock", parentId: null, name: "Pop Rock", itemCount: 1 },
    {
      id: "arena-rock",
      parentId: "pop-rock",
      name: "Arena Rock",
      itemCount: 2,
    },
  ];

  it("gives the selected node an accent border and dims every other node", () => {
    const hierarchy = buildPopHierarchy(d3, nodes);
    const laidOut = computePopRadialLayout(d3, hierarchy, 0, 1000);
    const svg = createSvg();

    renderPopSubtree(
      d3,
      svg,
      laidOut,
      "#123456",
      null,
      [],
      noopCallbacks,
      getItemCountRange(nodes),
      {
        selectedNodeId: "arena-rock",
      },
    );

    const rootGroup = svg.select<SVGGElement>("#group-pop-rock").node()!;
    const childGroup = svg.select<SVGGElement>("#group-arena-rock").node()!;
    expect(rootGroup.getAttribute("class")).toContain("gtv-node--dimmed");
    expect(childGroup.getAttribute("class")).not.toContain("gtv-node--dimmed");

    const childDot = childGroup.querySelector(".gtv-node-dot") as SVGCircleElement;
    expect(childDot.getAttribute("stroke")).toBe("#4F46E5");
    expect(childDot.getAttribute("stroke-width")).toBe("2.5");
  });

  it("leaves every node undimmed and unaccented when no node is selected", () => {
    const hierarchy = buildPopHierarchy(d3, nodes);
    const laidOut = computePopRadialLayout(d3, hierarchy, 0, 1000);
    const svg = createSvg();

    renderPopSubtree(
      d3,
      svg,
      laidOut,
      "#123456",
      null,
      [],
      noopCallbacks,
      getItemCountRange(nodes),
    );

    const rootGroup = svg.select<SVGGElement>("#group-pop-rock").node()!;
    const childGroup = svg.select<SVGGElement>("#group-arena-rock").node()!;
    expect(rootGroup.getAttribute("class")).not.toContain("gtv-node--dimmed");
    expect(childGroup.getAttribute("class")).not.toContain("gtv-node--dimmed");
  });

  it("dims only links not touching the selected node, leaving its parent-link and children-links undimmed", () => {
    const hierarchy = buildPopHierarchy(d3, popRock);
    const laidOut = computePopRadialLayout(d3, hierarchy, 0, 1000);
    const svg = createSvg();

    renderPopSubtree(
      d3,
      svg,
      laidOut,
      "#123456",
      null,
      [],
      noopCallbacks,
      getItemCountRange(popRock),
      {
        selectedNodeId: "arena-rock",
      },
    );

    const links = svg.selectAll<SVGPathElement, unknown>("path.gtv-link");
    const dimmed = links.filter(function () {
      return (
        (this as SVGPathElement)
          .getAttribute("class")
          ?.includes("gtv-link--dimmed") ?? false
      );
    });

    // arena-rock's own links: rock-pop -> arena-rock, arena-rock -> yacht-rock (undimmed);
    // rock-pop -> soft-rock is unrelated (dimmed).
    expect(links.size()).toBe(3);
    expect(dimmed.size()).toBe(1);
  });

  it("dims the selected node's parent and children less than unrelated nodes", () => {
    const hierarchy = buildPopHierarchy(d3, popRock);
    const laidOut = computePopRadialLayout(d3, hierarchy, 0, 1000);
    const svg = createSvg();

    renderPopSubtree(
      d3,
      svg,
      laidOut,
      "#123456",
      null,
      [],
      noopCallbacks,
      getItemCountRange(popRock),
      {
        selectedNodeId: "arena-rock",
      },
    );

    const classOf = (id: string) =>
      svg.select<SVGGElement>(`#group-${id}`).node()?.getAttribute("class");

    expect(classOf("arena-rock")).not.toContain("gtv-node--dimmed");
    expect(classOf("rock-pop")).toContain("gtv-node--dimmed-related");
    expect(classOf("yacht-rock")).toContain("gtv-node--dimmed-related");
    expect(classOf("soft-rock")).toContain("gtv-node--dimmed");
    expect(classOf("soft-rock")).not.toContain("gtv-node--dimmed-related");
  });

  it("keeps the synthetic root->depth1 link undimmed when the hierarchy's own root node is selected", () => {
    const hierarchy = buildPopHierarchy(d3, popRock);
    const coreRootCircleRadius = 5000;
    const angle = 0;
    const laidOut = computePopRadialLayout(
      d3,
      hierarchy,
      angle,
      coreRootCircleRadius,
    );
    const svg = createSvg();
    const rootLinkOrigin = getRadialPointOnCircle(angle, coreRootCircleRadius);

    renderPopSubtree(
      d3,
      svg,
      laidOut,
      "#123456",
      null,
      [],
      noopCallbacks,
      getItemCountRange(popRock),
      {
        rootLinkOrigin,
        selectedNodeId: "rock-pop",
      },
    );

    const links = svg.selectAll<SVGPathElement, unknown>("path.gtv-link");
    const popRoot = laidOut
      .descendants()
      .find((d) => d.data.id === "rock-pop")!;
    const rootLink = links.filter((_, i, nodesArr) => {
      const d3Node = d3.select<SVGPathElement, unknown>(nodesArr[i]);
      const { start, end } = linkPathEndpoints(d3Node.attr("d")!);
      return (
        Math.abs(start[0] - rootLinkOrigin.x) < 1e-3 &&
        Math.abs(start[1] - rootLinkOrigin.y) < 1e-3 &&
        Math.abs(end[0] - popRoot.x!) < 1e-3 &&
        Math.abs(end[1] - popRoot.y!) < 1e-3
      );
    });

    expect(rootLink.size()).toBe(1);
    expect(rootLink.attr("class")).not.toContain("gtv-link--dimmed");
  });
});

describe("getRadialPointOnCircle", () => {
  it("places angle 0 (top) at (0, -radius)", () => {
    const point = getRadialPointOnCircle(0, 100);
    expect(point.x).toBeCloseTo(0, 5);
    expect(point.y).toBeCloseTo(-100, 5);
  });

  it("places angle 90deg (clockwise from top) at (radius, 0)", () => {
    const point = getRadialPointOnCircle(90, 100);
    expect(point.x).toBeCloseTo(100, 5);
    expect(point.y).toBeCloseTo(0, 5);
  });
});

describe("renderPopSubtree dot + label nodes", () => {
  const nodes: GenreTreeNode[] = [
    { id: "pop-rock", parentId: null, name: "Pop Rock", itemCount: 1 },
    { id: "arena-rock", parentId: "pop-rock", name: "Arena Rock", itemCount: 2 },
  ];

  it("renders a dot and a label per node", () => {
    const laidOut = computePopRadialLayout(d3, buildPopHierarchy(d3, nodes), 90, 1000);
    const svg = createSvg();
    renderPopSubtree(d3, svg, laidOut, "#123456", null, [], noopCallbacks, getItemCountRange(nodes));

    expect(svg.selectAll("circle.gtv-node-dot").size()).toBe(2);
    expect(svg.selectAll("text.gtv-node-label").size()).toBe(2);
    expect(svg.select("text.gtv-node-label").text()).toBe("Pop Rock");
  });

  it("anchors labels right of the dot on the right half and left of it on the left half", () => {
    const range = getItemCountRange(nodes);
    const right = createSvg();
    renderPopSubtree(d3, right, computePopRadialLayout(d3, buildPopHierarchy(d3, nodes), 90, 1000), "#123456", null, [], noopCallbacks, range);
    const left = createSvg();
    renderPopSubtree(d3, left, computePopRadialLayout(d3, buildPopHierarchy(d3, nodes), 270, 1000), "#123456", null, [], noopCallbacks, range);

    expect(right.select("text.gtv-node-label").attr("text-anchor")).toBe("start");
    expect(Number(right.select("text.gtv-node-label").attr("x"))).toBeGreaterThan(0);
    expect(left.select("text.gtv-node-label").attr("text-anchor")).toBe("end");
    expect(Number(left.select("text.gtv-node-label").attr("x"))).toBeLessThan(0);
  });

  it("hides labels that collide, keeping the higher itemCount one", () => {
    const siblings: GenreTreeNode[] = [
      { id: "reggae", parentId: null, name: "Reggae", itemCount: 1 },
      ...Array.from({ length: 17 }, (_, i) => ({
        id: `sub-${i}`,
        parentId: "reggae",
        name: `Reggae Subgenre Number ${i}`,
        itemCount: i + 1,
      })),
    ];
    const range = getItemCountRange(siblings);
    const svg = createSvg();
    renderPopSubtree(d3, svg, computePopRadialLayout(d3, buildPopHierarchy(d3, siblings), 0, 1000, 6), "#123456", null, [], noopCallbacks, range);
    hideCollidingLabels(d3, svg, range);

    expect(svg.selectAll(".gtv-node-label--hidden").size()).toBeGreaterThan(0);
    expect(svg.select("#group-sub-16 .gtv-node-label").classed("gtv-node-label--hidden")).toBe(false);
  });

  it("keeps every dot of a 17-child branch inside its measured wedge", () => {
    const siblings: GenreTreeNode[] = [
      { id: "reggae", parentId: null, name: "Reggae", itemCount: 1 },
      ...Array.from({ length: 17 }, (_, i) => ({ id: `sub-${i}`, parentId: "reggae", name: `Sub ${i}`, itemCount: 1 })),
    ];
    const center = 40;
    const radiusOfDepth = popRadiusOfDepth(3000, POP_TREE_DEPTH_RADIAL_SPACING);
    const span = (measureWedge(d3, buildPopHierarchy(d3, siblings), radiusOfDepth) * 180) / Math.PI;
    const laidOut = computePopRadialLayout(d3, buildPopHierarchy(d3, siblings), center, 3000, span);

    laidOut.each((d) => {
      const r = Math.hypot(d.x!, d.y!);
      const angle = (Math.atan2(d.x!, -d.y!) * 180) / Math.PI;
      const halfWidth = (Math.asin(NODE_DOT_MAX_RADIUS / r) * 180) / Math.PI;
      expect(angle - halfWidth).toBeGreaterThanOrEqual(center - span / 2 - 1e-9);
      expect(angle + halfWidth).toBeLessThanOrEqual(center + span / 2 + 1e-9);
    });
  });
});

describe("measureWedge", () => {
  const fan = (n: number): GenreTreeNode[] => [
    { id: "r", parentId: null, name: "R", itemCount: 1 },
    ...Array.from({ length: n }, (_, i) => ({ id: `c${i}`, parentId: "r", name: `C${i}`, itemCount: 1 })),
  ];

  it("needs at least one full dot slot per sibling on their ring", () => {
    const ringRadius = 2000;
    const need = measureWedge(d3, buildPopHierarchy(d3, fan(10)), () => ringRadius);
    expect(need * ringRadius).toBeGreaterThanOrEqual(10 * 2 * NODE_DOT_MAX_RADIUS);
  });

  it("needs more angle when the same siblings sit on a smaller ring", () => {
    const outer = measureWedge(d3, buildPopHierarchy(d3, fan(10)), () => 3000);
    const inner = measureWedge(d3, buildPopHierarchy(d3, fan(10)), () => 1500);
    expect(inner).toBeCloseTo(outer * 2, 9);
  });
});
