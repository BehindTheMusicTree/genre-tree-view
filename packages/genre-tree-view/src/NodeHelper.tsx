import ReactDOMServer from "react-dom/server";
import { MdMoreVert, MdModeEdit } from "react-icons/md";
import { FaPlus, FaTrashAlt, FaPlay, FaPause, FaSpinner, FaFileUpload } from "react-icons/fa";
import { PiGraphFill } from "react-icons/pi";
import * as d3 from "d3";

import { GenreTreeNode, GenreTreePlayState } from "./types";
import {
  ACCENT_COLOR,
  ACCENT_TEXT_COLOR,
  CORNER_RADIUS,
  TOOLBAR_BUTTON_SIZE,
  TOOLBAR_GAP,
  MENU_ROW_HEIGHT,
  MENU_WIDTH,
  calculateNodeDimensions,
} from "./constants";

type D3Node = d3.HierarchyNode<GenreTreeNode>;

export interface NodeActionCallbacks {
  onPlayPause?: (nodeId: string) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  selectingFileNodeIdRef: React.MutableRefObject<string | null>;
  onAddChild?: (parentId: string) => void;
  onRenameRequest?: (node: GenreTreeNode) => void;
  onDeleteRequest?: (node: GenreTreeNode) => void;
  onReparentRequest?: (node: GenreTreeNode) => void;
  playingNodeId?: string | null;
  playState?: GenreTreePlayState;
}

/** Builds the hierarchical tree structure from a flat node list. */
export function buildTreeHierarchyStructure(d3Lib: typeof import("d3"), nodes: GenreTreeNode[]) {
  return d3Lib
    .stratify<GenreTreeNode>()
    .id((d) => d.id)
    .parentId((d) => d.parentId)(nodes);
}

/** Adds the "select as new parent" overlay to a node while a reparent is in progress. */
export function addReparentTargetOverlay(
  d3Lib: typeof import("d3"),
  parentNode: d3.Selection<SVGGElement, unknown, HTMLElement, unknown>,
  onReparentTargetSelect: (newParentId: string) => void,
) {
  const nodeId = (parentNode.datum() as D3Node).data.id;
  const nodeData = (parentNode.datum() as D3Node).data;
  const dimensions = calculateNodeDimensions(nodeData.itemCount);

  let overlayGroup = parentNode.select<SVGGElement>("#select-as-new-parent-group-" + nodeId);
  if (overlayGroup.empty()) {
    overlayGroup = parentNode
      .append("g")
      .attr("id", "select-as-new-parent-group-" + nodeId)
      .style("cursor", "pointer")
      .on("mouseleave", function () {
        d3Lib.select(this).remove();
      });

    overlayGroup
      .append("rect")
      .attr("width", dimensions.WIDTH)
      .attr("height", dimensions.HEIGHT)
      .attr("x", -dimensions.WIDTH / 2)
      .attr("y", -dimensions.HEIGHT / 2)
      .attr("rx", CORNER_RADIUS)
      .attr("ry", CORNER_RADIUS)
      .attr("fill", ACCENT_COLOR);

    overlayGroup
      .append("foreignObject")
      .attr("width", dimensions.WIDTH)
      .attr("height", dimensions.HEIGHT)
      .attr("x", -dimensions.WIDTH / 2)
      .attr("y", -dimensions.HEIGHT / 2)
      .html(() =>
        ReactDOMServer.renderToString(
          <div className="gtv-reparent-target">
            <PiGraphFill size={20} color={ACCENT_TEXT_COLOR} />
            <div className="gtv-reparent-target-label" style={{ color: ACCENT_TEXT_COLOR }}>
              Select as new parent
            </div>
          </div>,
        ),
      )
      .on("click", function (_event: MouseEvent, d: unknown) {
        onReparentTargetSelect((d as D3Node).data.id);
      });
  }

  return overlayGroup;
}

// The toolbar's inline icon row and its overflow menu render into a single HTML subtree
// per widget (one foreignObject) and wire click handlers afterwards with D3, instead of
// one foreignObject per icon/label pair — simpler to lay out since the content is a plain
// flex box.

export interface MenuActionItem {
  key: string;
  icon: (d: D3Node) => React.ReactNode;
  label: (d: D3Node) => string;
  onClick: (event: MouseEvent, d: D3Node) => void;
  enabled?: (d: D3Node) => boolean;
  danger?: boolean;
  dividerBefore?: boolean;
}

const MENU_DIVIDER_SPACE = 9;

function menuItemsHeight(items: MenuActionItem[]): number {
  return items.reduce((height, item) => height + MENU_ROW_HEIGHT + (item.dividerBefore ? MENU_DIVIDER_SPACE : 0), 0);
}

function renderMenuItemsHtml(items: MenuActionItem[], d: D3Node): string {
  return items
    .map((item) => {
      const enabled = item.enabled ? item.enabled(d) : true;
      const classes = [
        "gtv-menu-row",
        item.danger ? "gtv-menu-row--danger" : "",
        !enabled ? "gtv-menu-row--disabled" : "",
      ]
        .filter(Boolean)
        .join(" ");
      const divider = item.dividerBefore ? '<div class="gtv-menu-divider"></div>' : "";
      return (
        divider +
        ReactDOMServer.renderToString(
          <button type="button" className={classes} disabled={!enabled} data-menu-key={item.key}>
            <span className="gtv-menu-row-icon">{item.icon(d)}</span>
            <span className="gtv-menu-row-label">{item.label(d)}</span>
          </button>,
        )
      );
    })
    .join("");
}

/** Closes a menu opened by toggleLightActionsMenu and detaches its outside-click listener. */
export function closeLightActionsMenu(d3Lib: typeof import("d3"), menuId: string) {
  d3Lib.select<SVGGElement, unknown>("#" + menuId).remove();
  d3Lib.select(window).on(`click.${menuId}`, null);
}

/** Opens (or, if already open, closes) a light card menu of `items` at (x, y) within `parentGroup`. */
export function toggleLightActionsMenu(
  d3Lib: typeof import("d3"),
  parentGroup: d3.Selection<SVGGElement, unknown, HTMLElement, unknown>,
  menuId: string,
  x: number,
  y: number,
  items: MenuActionItem[],
) {
  const existing = d3Lib.select<SVGGElement, unknown>("#" + menuId);
  if (!existing.empty()) {
    closeLightActionsMenu(d3Lib, menuId);
    return;
  }

  const datum = (parentGroup.datum && typeof parentGroup.datum === "function" ? parentGroup.datum() : undefined) as D3Node;

  // SVG has no z-index: a menu nested under its own node's <g> can be visually clipped by
  // whichever sibling <g> happens to be later in DOM order. Re-parent it to the shared root
  // layer (paints last => always on top) and copy the node's transform so the caller's local
  // (x, y) still lands in the right place.
  const rootLayer = d3Lib.select<SVGGElement, unknown>(parentGroup.node()!.parentNode as SVGGElement);
  const nodeTransform = (parentGroup.node() as SVGGElement).getAttribute("transform");
  const menuGroup = rootLayer.append("g").attr("id", menuId).attr("class", "gtv-menu-group");
  if (nodeTransform) menuGroup.attr("transform", nodeTransform);

  menuGroup
    .append("foreignObject")
    .attr("x", x)
    .attr("y", y)
    .attr("width", MENU_WIDTH)
    .attr("height", menuItemsHeight(items))
    .html(() => `<div class="gtv-menu-card">${renderMenuItemsHtml(items, datum)}</div>`)
    .selectAll<HTMLButtonElement, unknown>(".gtv-menu-row")
    .each(function () {
      const key = this.getAttribute("data-menu-key");
      const item = items.find((i) => i.key === key);
      if (!item) return;
      d3Lib.select(this).on("click", (event: MouseEvent) => {
        event.stopPropagation();
        const enabled = item.enabled ? item.enabled(datum) : true;
        if (!enabled) return;
        closeLightActionsMenu(d3Lib, menuId);
        item.onClick(event, datum);
      });
    });

  menuGroup.on("click", (event: MouseEvent) => event.stopPropagation());
  // Deferred: listeners added while an event is dispatching aren't invoked for that same
  // dispatch, so this doesn't immediately close the menu the opening click just opened.
  d3Lib.select(window).on(`click.${menuId}`, () => closeLightActionsMenu(d3Lib, menuId));

  return menuGroup;
}

/** The common actions as an inline icon row on the node itself (single hover stage, no
 *  menu at all), with a kebab overflow for the rest. */
export function addToolbarActions(
  d3Lib: typeof import("d3"),
  node: GenreTreeNode,
  nodeGroup: d3.Selection<SVGGElement, unknown, HTMLElement, unknown>,
  callbacks: NodeActionCallbacks,
) {
  if (!nodeGroup.select("#toolbar-" + node.id).empty()) return;

  const { onPlayPause, fileInputRef, selectingFileNodeIdRef, onAddChild, onRenameRequest, onDeleteRequest } =
    callbacks;
  const dimensions = calculateNodeDimensions(node.itemCount);
  const isActionable = node.actionable !== false;
  const datum = nodeGroup.datum() as D3Node;

  const primaryItems: MenuActionItem[] = [
    {
      key: "play",
      icon: (d) => {
        if (callbacks.playingNodeId && callbacks.playingNodeId === d.data.id) {
          if (callbacks.playState === "playing") return <FaPause className="gtv-icon" size={12} />;
          if (callbacks.playState === "loading") return <FaSpinner className="gtv-icon gtv-icon--spin" size={12} />;
        }
        return <FaPlay className="gtv-icon" size={12} />;
      },
      label: (d) => (callbacks.playingNodeId === d.data.id && callbacks.playState === "playing" ? "Pause" : "Play"),
      onClick: (_event, d) => onPlayPause?.(d.data.id),
      enabled: (d) => d.data.itemCount > 0,
    },
  ];

  if (isActionable) {
    primaryItems.push(
      {
        key: "upload",
        icon: () => <FaFileUpload className="gtv-icon" size={12} />,
        label: () => "Upload files",
        onClick: (event, d) => {
          event.stopPropagation();
          selectingFileNodeIdRef.current = d.data.id;
          fileInputRef.current?.click();
        },
      },
      {
        key: "add",
        icon: () => <FaPlus className="gtv-icon" size={12} />,
        label: () => "Add sub-genre",
        onClick: (_event, d) => onAddChild?.(d.data.id),
      },
    );
  }

  const overflowItems: MenuActionItem[] = isActionable
    ? [
        {
          key: "rename",
          icon: () => <MdModeEdit className="gtv-icon" size={13} />,
          label: () => "Rename",
          onClick: (_event, d) => onRenameRequest?.(d.data),
        },
        {
          key: "reparent",
          icon: () => <PiGraphFill className="gtv-icon" size={13} />,
          label: () => "Change parent",
          onClick: (_event, d) => callbacks.onReparentRequest?.(d.data),
        },
        {
          key: "delete",
          icon: () => <FaTrashAlt className="gtv-icon" size={13} />,
          label: () => "Delete",
          danger: true,
          dividerBefore: true,
          onClick: (_event, d) => onDeleteRequest?.(d.data),
        },
      ]
    : [];

  const buttonCount = primaryItems.length + (overflowItems.length > 0 ? 1 : 0);
  const toolbarWidth = buttonCount * TOOLBAR_BUTTON_SIZE + (buttonCount - 1) * TOOLBAR_GAP + 6;
  const x = dimensions.WIDTH / 2 + 4;
  const y = -TOOLBAR_BUTTON_SIZE / 2 - 3;

  const group = nodeGroup.append("g").attr("id", "toolbar-" + node.id).attr("class", "gtv-actions-panel");

  const buttonsHtml = primaryItems
    .map((item) => {
      const enabled = item.enabled ? item.enabled(datum) : true;
      return ReactDOMServer.renderToString(
        <button
          type="button"
          className={`gtv-toolbar-btn${!enabled ? " gtv-toolbar-btn--disabled" : ""}`}
          title={item.label(datum)}
          data-menu-key={item.key}
        >
          {item.icon(datum)}
        </button>,
      );
    })
    .join("");

  const kebabHtml =
    overflowItems.length > 0
      ? ReactDOMServer.renderToString(
          <button type="button" className="gtv-toolbar-btn" title="More actions" data-menu-key="__more">
            <MdMoreVert size={14} />
          </button>,
        )
      : "";

  group
    .append("foreignObject")
    .attr("x", x)
    .attr("y", y)
    .attr("width", toolbarWidth)
    .attr("height", TOOLBAR_BUTTON_SIZE + 6)
    .html(() => `<div class="gtv-toolbar">${buttonsHtml}${kebabHtml}</div>`)
    .selectAll<HTMLButtonElement, unknown>(".gtv-toolbar-btn")
    .each(function () {
      const key = this.getAttribute("data-menu-key");
      if (key === "__more") {
        d3Lib.select(this).on("click", (event: MouseEvent) => {
          event.stopPropagation();
          toggleLightActionsMenu(
            d3Lib,
            nodeGroup,
            "overflow-menu-" + node.id,
            x,
            y + TOOLBAR_BUTTON_SIZE + 8,
            overflowItems,
          );
        });
        return;
      }
      const item = primaryItems.find((i) => i.key === key);
      if (!item) return;
      d3Lib.select(this).on("click", (event: MouseEvent) => {
        event.stopPropagation();
        const enabled = item.enabled ? item.enabled(datum) : true;
        if (!enabled) return;
        item.onClick(event, datum);
      });
    });

  return group;
}
