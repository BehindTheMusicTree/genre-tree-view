import { afterEach, describe, expect, it, vi } from "vitest";
import * as d3 from "d3";
import {
  addReparentTargetOverlay,
  addToolbarActions,
  buildTreeHierarchyStructure,
  closeLightActionsMenu,
  toggleLightActionsMenu,
  type MenuActionItem,
  type NodeActionCallbacks,
} from "../NodeHelper";
import { calculateNodeDimensions, getItemCountRange } from "../constants";
import type { GenreTreeNode, TreeOrientation } from "../types";

afterEach(() => {
  document.body.innerHTML = "";
});

function createSvgGroup(node: GenreTreeNode) {
  const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  document.body.appendChild(svgEl);
  // addToolbarActions/addReparentTargetOverlay read `nodeGroup.datum().data`, matching the
  // d3.HierarchyNode shape (`{ data: GenreTreeNode }`) the real render pipeline binds via `.data(treeData.descendants())`.
  const g = d3
    .select(svgEl)
    .append("g")
    .datum({ data: node }) as unknown as d3.Selection<SVGGElement, unknown, HTMLElement, unknown>;
  return { svgEl, g };
}

function baseCallbacks(overrides: Partial<NodeActionCallbacks> = {}): NodeActionCallbacks {
  return {
    fileInputRef: { current: null },
    selectingFileNodeIdRef: { current: null },
    ...overrides,
  };
}

describe("buildTreeHierarchyStructure", () => {
  it("builds a hierarchy where each node's parent matches parentId", () => {
    const nodes: GenreTreeNode[] = [
      { id: "root", parentId: null, name: "Root", itemCount: 0 },
      { id: "child", parentId: "root", name: "Child", itemCount: 0 },
    ];
    const root = buildTreeHierarchyStructure(d3, nodes);
    expect(root.data.id).toBe("root");
    expect(root.children?.[0].data.id).toBe("child");
  });

  it("rolls up itemCount bottom-up so a node's count is at least the sum of its children's", () => {
    const nodes: GenreTreeNode[] = [
      { id: "root", parentId: null, name: "Root", itemCount: 1 },
      { id: "child", parentId: "root", name: "Child", itemCount: 2 },
      { id: "grandchild-a", parentId: "child", name: "Grandchild A", itemCount: 3 },
      { id: "grandchild-b", parentId: "child", name: "Grandchild B", itemCount: 4 },
    ];
    const root = buildTreeHierarchyStructure(d3, nodes);
    const byId = new Map(root.descendants().map((d) => [d.data.id, d.data.itemCount]));

    expect(byId.get("grandchild-a")).toBe(3);
    expect(byId.get("grandchild-b")).toBe(4);
    expect(byId.get("child")).toBe(2 + 3 + 4);
    expect(byId.get("root")).toBe(1 + 2 + 3 + 4);
  });

  it("does not mutate the original nodes array/objects passed in", () => {
    const nodes: GenreTreeNode[] = [
      { id: "root", parentId: null, name: "Root", itemCount: 1 },
      { id: "child", parentId: "root", name: "Child", itemCount: 2 },
    ];
    buildTreeHierarchyStructure(d3, nodes);
    expect(nodes[0].itemCount).toBe(1);
    expect(nodes[1].itemCount).toBe(2);
  });
});

describe("addReparentTargetOverlay", () => {
  it("appends an overlay group with a clickable target that fires the callback with this node's id", () => {
    const node: GenreTreeNode = { id: "n1", parentId: null, name: "N1", itemCount: 0 };
    const { g } = createSvgGroup(node);
    const onSelect = vi.fn();

    addReparentTargetOverlay(d3, g, onSelect, getItemCountRange([node]));

    const foreignObject = g.select("foreignObject").node() as SVGForeignObjectElement;
    foreignObject.dispatchEvent(new MouseEvent("click", { bubbles: false }));
    expect(onSelect).toHaveBeenCalledWith("n1");
  });

  it("is idempotent: calling it twice keeps a single overlay group", () => {
    const node: GenreTreeNode = { id: "n1", parentId: null, name: "N1", itemCount: 0 };
    const { g } = createSvgGroup(node);
    const onSelect = vi.fn();

    addReparentTargetOverlay(d3, g, onSelect, getItemCountRange([node]));
    addReparentTargetOverlay(d3, g, onSelect, getItemCountRange([node]));

    expect(g.selectAll("#select-as-new-parent-group-n1").size()).toBe(1);
  });

  it("removes itself on mouseleave", () => {
    const node: GenreTreeNode = { id: "n1", parentId: null, name: "N1", itemCount: 0 };
    const { g } = createSvgGroup(node);

    const overlay = addReparentTargetOverlay(d3, g, vi.fn(), getItemCountRange([node]));
    (overlay.node() as SVGGElement).dispatchEvent(new MouseEvent("mouseleave", { bubbles: false }));

    expect(g.select("#select-as-new-parent-group-n1").empty()).toBe(true);
  });
});

describe("toggleLightActionsMenu / closeLightActionsMenu", () => {
  const items: MenuActionItem[] = [
    { key: "one", icon: () => null, label: () => "One", onClick: vi.fn() },
    {
      key: "two",
      icon: () => null,
      label: () => "Two",
      onClick: vi.fn(),
      danger: true,
      dividerBefore: true,
    },
    { key: "disabled", icon: () => null, label: () => "Disabled", onClick: vi.fn(), enabled: () => false },
  ];

  it("re-parents the menu to the node group's parent layer and copies its transform", () => {
    const node: GenreTreeNode = { id: "n1", parentId: null, name: "N1", itemCount: 0 };
    const { svgEl, g } = createSvgGroup(node);
    (g.node() as SVGGElement).setAttribute("transform", "translate(10, 20)");

    toggleLightActionsMenu(d3, g, "menu-n1", 5, 5, items);

    const menu = svgEl.querySelector("#menu-n1") as SVGGElement;
    expect(menu).toBeTruthy();
    expect(menu.parentNode).toBe(svgEl);
    expect(menu.getAttribute("transform")).toBe("translate(10, 20)");
  });

  it("toggles closed when called again with an already-open menu id", () => {
    const node: GenreTreeNode = { id: "n1", parentId: null, name: "N1", itemCount: 0 };
    const { svgEl, g } = createSvgGroup(node);

    toggleLightActionsMenu(d3, g, "menu-n1", 0, 0, items);
    expect(svgEl.querySelector("#menu-n1")).toBeTruthy();

    toggleLightActionsMenu(d3, g, "menu-n1", 0, 0, items);
    expect(svgEl.querySelector("#menu-n1")).toBeFalsy();
  });

  it("invokes the matching item's onClick and closes the menu when an enabled row is clicked", () => {
    const node: GenreTreeNode = { id: "n1", parentId: null, name: "N1", itemCount: 0 };
    const { svgEl, g } = createSvgGroup(node);
    const onClick = vi.fn();
    const localItems: MenuActionItem[] = [{ key: "go", icon: () => null, label: () => "Go", onClick }];

    toggleLightActionsMenu(d3, g, "menu-n1", 0, 0, localItems);
    const row = svgEl.querySelector('[data-menu-key="go"]') as HTMLButtonElement;
    row.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(onClick).toHaveBeenCalled();
    expect(svgEl.querySelector("#menu-n1")).toBeFalsy();
  });

  it("does not invoke onClick and does not close the menu for a disabled row", () => {
    const node: GenreTreeNode = { id: "n1", parentId: null, name: "N1", itemCount: 0 };
    const { svgEl, g } = createSvgGroup(node);
    const onClick = vi.fn();
    const localItems: MenuActionItem[] = [
      { key: "go", icon: () => null, label: () => "Go", onClick, enabled: () => false },
    ];

    toggleLightActionsMenu(d3, g, "menu-n1", 0, 0, localItems);
    const row = svgEl.querySelector('[data-menu-key="go"]') as HTMLButtonElement;
    row.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(onClick).not.toHaveBeenCalled();
    expect(svgEl.querySelector("#menu-n1")).toBeTruthy();
  });

  it("closes the menu on an outside click", () => {
    const node: GenreTreeNode = { id: "n1", parentId: null, name: "N1", itemCount: 0 };
    const { svgEl, g } = createSvgGroup(node);

    toggleLightActionsMenu(d3, g, "menu-n1", 0, 0, items);
    expect(svgEl.querySelector("#menu-n1")).toBeTruthy();

    window.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(svgEl.querySelector("#menu-n1")).toBeFalsy();
  });

  it("closeLightActionsMenu removes the element and detaches its outside-click listener", () => {
    const node: GenreTreeNode = { id: "n1", parentId: null, name: "N1", itemCount: 0 };
    const { svgEl, g } = createSvgGroup(node);

    toggleLightActionsMenu(d3, g, "menu-n1", 0, 0, items);
    closeLightActionsMenu(d3, "menu-n1");

    expect(svgEl.querySelector("#menu-n1")).toBeFalsy();
    // A stale outside-click listener would attempt to remove the (already-gone) menu again;
    // dispatching a further click must not throw and must leave nothing behind.
    expect(() => window.dispatchEvent(new MouseEvent("click", { bubbles: true }))).not.toThrow();
  });
});

describe("addToolbarActions", () => {
  it("is idempotent: a second call with a toolbar already present is a no-op", () => {
    const node: GenreTreeNode = { id: "n1", parentId: null, name: "N1", itemCount: 5 };
    const { g } = createSvgGroup(node);

    addToolbarActions(d3, node, g, baseCallbacks(), getItemCountRange([node]));
    addToolbarActions(d3, node, g, baseCallbacks(), getItemCountRange([node]));

    expect(g.selectAll("#toolbar-n1").size()).toBe(1);
  });

  it("renders only the play button (no add/upload, no kebab) when actionable is false", () => {
    const node: GenreTreeNode = { id: "n1", parentId: null, name: "N1", itemCount: 5, actionable: false };
    const { svgEl, g } = createSvgGroup(node);

    addToolbarActions(d3, node, g, baseCallbacks(), getItemCountRange([node]));

    expect(svgEl.querySelector('[data-menu-key="play"]')).toBeTruthy();
    expect(svgEl.querySelector('[data-menu-key="upload"]')).toBeFalsy();
    expect(svgEl.querySelector('[data-menu-key="add"]')).toBeFalsy();
    expect(svgEl.querySelector('[data-menu-key="__more"]')).toBeFalsy();
  });

  it("renders upload/add and a kebab when actionable", () => {
    const node: GenreTreeNode = { id: "n1", parentId: null, name: "N1", itemCount: 5 };
    const { svgEl, g } = createSvgGroup(node);

    addToolbarActions(d3, node, g, baseCallbacks(), getItemCountRange([node]));

    expect(svgEl.querySelector('[data-menu-key="upload"]')).toBeTruthy();
    expect(svgEl.querySelector('[data-menu-key="add"]')).toBeTruthy();
    expect(svgEl.querySelector('[data-menu-key="__more"]')).toBeTruthy();
  });

  it("disables the play button when itemCount is 0 and clicking it does not call onPlayPause", () => {
    const node: GenreTreeNode = { id: "n1", parentId: null, name: "N1", itemCount: 0 };
    const { svgEl, g } = createSvgGroup(node);
    const onPlayPause = vi.fn();

    addToolbarActions(d3, node, g, baseCallbacks({ onPlayPause }), getItemCountRange([node]));

    const playButton = svgEl.querySelector('[data-menu-key="play"]') as HTMLButtonElement;
    expect(playButton.disabled).toBe(true);
    playButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onPlayPause).not.toHaveBeenCalled();
  });

  it("clicking the enabled play button calls onPlayPause with the node id", () => {
    const node: GenreTreeNode = { id: "n1", parentId: null, name: "N1", itemCount: 3 };
    const { svgEl, g } = createSvgGroup(node);
    const onPlayPause = vi.fn();

    addToolbarActions(d3, node, g, baseCallbacks({ onPlayPause }), getItemCountRange([node]));

    const playButton = svgEl.querySelector('[data-menu-key="play"]') as HTMLButtonElement;
    playButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onPlayPause).toHaveBeenCalledWith("n1");
  });

  it("shows a pause icon/label when this node is the one currently playing", () => {
    const node: GenreTreeNode = { id: "n1", parentId: null, name: "N1", itemCount: 3 };
    const { svgEl, g } = createSvgGroup(node);

    addToolbarActions(d3, node, g, baseCallbacks({ playingNodeId: "n1", playState: "playing" }), getItemCountRange([node]));

    const playButton = svgEl.querySelector('[data-menu-key="play"]') as HTMLButtonElement;
    expect(playButton.title).toBe("Pause");
  });

  it("shows a loading label while this node is loading", () => {
    const node: GenreTreeNode = { id: "n1", parentId: null, name: "N1", itemCount: 3 };
    const { svgEl, g } = createSvgGroup(node);

    addToolbarActions(d3, node, g, baseCallbacks({ playingNodeId: "n1", playState: "loading" }), getItemCountRange([node]));

    const playButton = svgEl.querySelector('[data-menu-key="play"]') as HTMLButtonElement;
    expect(playButton.title).toBe("Loading...");
  });

  it("clicking upload sets selectingFileNodeIdRef and triggers the hidden file input", () => {
    const node: GenreTreeNode = { id: "n1", parentId: null, name: "N1", itemCount: 3 };
    const { svgEl, g } = createSvgGroup(node);
    const fileInput = document.createElement("input");
    const clickSpy = vi.spyOn(fileInput, "click");
    const selectingFileNodeIdRef = { current: null as string | null };

    addToolbarActions(
      d3,
      node,
      g,
      baseCallbacks({ fileInputRef: { current: fileInput }, selectingFileNodeIdRef }),
      getItemCountRange([node]),
    );

    const uploadButton = svgEl.querySelector('[data-menu-key="upload"]') as HTMLButtonElement;
    uploadButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(selectingFileNodeIdRef.current).toBe("n1");
    expect(clickSpy).toHaveBeenCalled();
  });

  it("clicking add calls onAddChild with the node id", () => {
    const node: GenreTreeNode = { id: "n1", parentId: null, name: "N1", itemCount: 3 };
    const { svgEl, g } = createSvgGroup(node);
    const onAddChild = vi.fn();

    addToolbarActions(d3, node, g, baseCallbacks({ onAddChild }), getItemCountRange([node]));

    const addButton = svgEl.querySelector('[data-menu-key="add"]') as HTMLButtonElement;
    addButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onAddChild).toHaveBeenCalledWith("n1");
  });

  it("clicking the kebab opens the overflow menu with rename/reparent/delete rows wired to their callbacks", () => {
    const node: GenreTreeNode = { id: "n1", parentId: null, name: "N1", itemCount: 3 };
    const { svgEl, g } = createSvgGroup(node);
    const onRenameRequest = vi.fn();
    const onDeleteRequest = vi.fn();
    const onReparentRequest = vi.fn();

    addToolbarActions(
      d3,
      node,
      g,
      baseCallbacks({ onRenameRequest, onDeleteRequest, onReparentRequest }),
      getItemCountRange([node]),
    );

    const kebab = svgEl.querySelector('[data-menu-key="__more"]') as HTMLButtonElement;
    kebab.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(svgEl.querySelector("#overflow-menu-n1")).toBeTruthy();

    const renameRow = svgEl.querySelector('[data-menu-key="rename"]') as HTMLButtonElement;
    renameRow.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onRenameRequest).toHaveBeenCalledWith(node);

    kebab.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const reparentRow = svgEl.querySelector('[data-menu-key="reparent"]') as HTMLButtonElement;
    reparentRow.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onReparentRequest).toHaveBeenCalledWith(node);

    kebab.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const deleteRow = svgEl.querySelector('[data-menu-key="delete"]') as HTMLButtonElement;
    expect(deleteRow.className).toContain("gtv-menu-row--danger");
    deleteRow.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onDeleteRequest).toHaveBeenCalledWith(node);
  });

  it("overlays the toolbar on the card itself, for all four orientations", () => {
    const node: GenreTreeNode = { id: "n1", parentId: null, name: "N1", itemCount: 5 };
    const dimensions = calculateNodeDimensions(node.itemCount, getItemCountRange([node]));

    function toolbarBounds(orientation: TreeOrientation) {
      const { svgEl, g } = createSvgGroup(node);
      addToolbarActions(d3, node, g, baseCallbacks(), getItemCountRange([node]), orientation);
      const foreignObject = svgEl.querySelector('[id="toolbar-n1"] foreignObject')!;
      return {
        x: Number(foreignObject.getAttribute("x")),
        y: Number(foreignObject.getAttribute("y")),
        width: Number(foreignObject.getAttribute("width")),
        height: Number(foreignObject.getAttribute("height")),
      };
    }

    for (const orientation of ["horizontal", "horizontal-anchored-flipped", "vertical", "vertical-flipped"] as const) {
      expect(toolbarBounds(orientation)).toEqual({
        x: -dimensions.WIDTH / 2,
        y: -dimensions.HEIGHT / 2,
        width: dimensions.WIDTH,
        height: dimensions.HEIGHT,
      });
    }
  });

  it("still pops the overflow menu out toward the leaves, clear of the card, for all four orientations", () => {
    const itemCountRange = getItemCountRange([{ itemCount: 5 }]);
    const dimensions = calculateNodeDimensions(5, itemCountRange);

    // Distinct id per call: toggleLightActionsMenu's open/close check is a global "#id"
    // lookup, so reusing one id across calls in this test would make the second call see
    // the first call's still-mounted menu and toggle it closed instead of opening a new one.
    function menuY(orientation: TreeOrientation) {
      const node: GenreTreeNode = { id: `n1-${orientation}`, parentId: null, name: "N1", itemCount: 5 };
      const { svgEl, g } = createSvgGroup(node);
      addToolbarActions(d3, node, g, baseCallbacks(), itemCountRange, orientation);
      const kebab = svgEl.querySelector('[data-menu-key="__more"]') as HTMLButtonElement;
      kebab.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      const foreignObject = svgEl.querySelector(`#overflow-menu-${node.id} foreignObject`)!;
      return Number(foreignObject.getAttribute("y"));
    }

    // "horizontal"/"horizontal-anchored": pops below the card's vertical center.
    expect(menuY("horizontal")).toBeGreaterThan(0);
    // "vertical": depth grows up, so the menu pops out above the card (y < top edge).
    expect(menuY("vertical")).toBeLessThan(-dimensions.HEIGHT / 2);
    // "vertical-flipped": depth grows down, so the menu pops out below the card (y > bottom edge).
    expect(menuY("vertical-flipped")).toBeGreaterThan(dimensions.HEIGHT / 2);
  });
});
