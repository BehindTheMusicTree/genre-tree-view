import ReactDOMServer from "react-dom/server";
import { MdMoreVert, MdModeEdit } from "react-icons/md";
import { FaPlus, FaTrashAlt, FaPlay, FaPause, FaSpinner, FaFileUpload } from "react-icons/fa";
import { PiGraphFill } from "react-icons/pi";
import * as d3 from "d3";

import { GenreTreeNode, GenreTreePlayState } from "./types";
import {
  MORE_ICON_WIDTH,
  ACTIONS_CONTAINER_X_OFFSET,
  ACTIONS_CONTAINER_DIMENSIONS_MAX,
  ACTION_CONTAINER_DIMENSIONS,
  ACTION_ICON_SIZE,
  ACTION_ICON_CONTAINER_DIMENSIONS,
  ACTION_LABEL_CONTAINER_DIMENSIONS,
  SPINNER_ICON_SIZE,
  calculateNodeDimensions,
} from "./constants";

type D3Node = d3.HierarchyNode<GenreTreeNode>;

export interface NodeActionCallbacks {
  handleMoreActionEnterMouse: (event: MouseEvent, d: D3Node, node: GenreTreeNode) => void;
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

/** Adds the "more" icon container to a node. */
export function addMoreIconContainer(
  d3Lib: typeof import("d3"),
  node: GenreTreeNode,
  group: d3.Selection<SVGGElement, unknown, HTMLElement, unknown>,
  handleMoreActionEnterMouse: (event: MouseEvent, d: D3Node, node: GenreTreeNode) => void,
  rootColor: string,
) {
  const moreIconContainer = group.select("#more-icon-container-" + node.id);
  const dimensions = calculateNodeDimensions(node.itemCount);

  if (moreIconContainer.empty()) {
    const container = group.append("g").attr("id", "more-icon-container-" + node.id);

    container
      .append("rect")
      .attr("x", dimensions.WIDTH / 2)
      .attr("y", -dimensions.HEIGHT / 2)
      .attr("width", MORE_ICON_WIDTH)
      .attr("height", dimensions.HEIGHT)
      .attr("fill", rootColor);

    container
      .append("foreignObject")
      .attr("x", dimensions.WIDTH / 2)
      .attr("y", -dimensions.HEIGHT / 2)
      .attr("width", MORE_ICON_WIDTH)
      .attr("height", dimensions.HEIGHT)
      .html(() =>
        ReactDOMServer.renderToString(
          <div className="gtv-more-icon">
            <MdMoreVert size={20} color="white" />
          </div>,
        ),
      )
      .on("mouseenter", function (event: MouseEvent, d: unknown) {
        handleMoreActionEnterMouse(event, d as D3Node, node);
      })
      .on("mouseleave", function (this: SVGForeignObjectElement) {
        const actionsContainer = d3Lib.select<SVGGElement, unknown>("#actions-container-" + node.id);

        if (actionsContainer.empty()) {
          const parent = this.parentNode as Element;
          if (parent) {
            d3Lib.select(parent).remove();
          }
          d3Lib.select<SVGGElement, unknown>("#select-as-new-parent-group-" + node.id).remove();
        }
      });
  }
}

/** Adds a single action row (icon + label) to the actions group. */
export function addActionContainer(
  d3Lib: typeof import("d3"),
  actionsContainerHeight: number,
  actionsContainerGroup: d3.Selection<SVGGElement, unknown, HTMLElement, unknown>,
  position: number,
  className: string,
  onclick: (event: MouseEvent, d: D3Node) => void,
  iconFunction: (d: D3Node) => React.ReactNode,
  labelFunction: (d: D3Node) => string,
  enabledFunction: (d: D3Node) => boolean = () => true,
  actionsContainerX: number = ACTIONS_CONTAINER_X_OFFSET,
) {
  const actionContainerGroup = actionsContainerGroup
    .append("g")
    .attr("class", `${className}`)
    .style("cursor", "pointer")
    .on("click", function (event: MouseEvent, d: unknown) {
      if (enabledFunction(d as D3Node)) {
        onclick(event, d as D3Node);
      }
    })
    .on("mouseover", function (event: MouseEvent, d: unknown) {
      if (enabledFunction(d as D3Node)) {
        d3Lib.select(this).classed("gtv-action-row--hovered", true);
      }
    })
    .on("mouseout", function () {
      d3Lib.select(this).classed("gtv-action-row--hovered", false);
    });

  actionContainerGroup
    .append("foreignObject")
    .attr("x", actionsContainerX)
    .attr("y", -actionsContainerHeight / 2 + ACTION_CONTAINER_DIMENSIONS.HEIGHT * (position - 1))
    .attr("width", ACTION_ICON_CONTAINER_DIMENSIONS.WIDTH)
    .attr("height", ACTION_ICON_CONTAINER_DIMENSIONS.HEIGHT)
    .html(function (d: unknown) {
      const enabled = enabledFunction(d as D3Node);
      return ReactDOMServer.renderToString(
        <div className={`gtv-action-icon-container${!enabled ? " gtv-action-icon-container--disabled" : ""}`}>
          {iconFunction(d as D3Node)}
        </div>,
      );
    });

  actionContainerGroup
    .append("foreignObject")
    .attr("x", actionsContainerX + ACTION_ICON_CONTAINER_DIMENSIONS.WIDTH)
    .attr("y", -actionsContainerHeight / 2 + ACTION_CONTAINER_DIMENSIONS.HEIGHT * (position - 1))
    .attr("width", ACTION_LABEL_CONTAINER_DIMENSIONS.WIDTH)
    .attr("height", ACTION_LABEL_CONTAINER_DIMENSIONS.HEIGHT)
    .html(function (d: unknown) {
      const enabled = enabledFunction(d as D3Node);
      return ReactDOMServer.renderToString(
        <div className={`gtv-action-label-container${!enabled ? " gtv-action-label-container--disabled" : ""}`}>
          {labelFunction(d as D3Node)}
        </div>,
      );
    });

  const datum =
    actionContainerGroup.datum && typeof actionContainerGroup.datum === "function"
      ? actionContainerGroup.datum()
      : undefined;
  if (datum !== undefined && !enabledFunction(datum as D3Node)) {
    actionContainerGroup.style("cursor", "not-allowed");
  }

  return actionContainerGroup;
}

/** Adds the actions group (play/pause, upload, add-child, rename, change-parent, delete) to a node. */
export function addActionsGroup(
  d3Lib: typeof import("d3"),
  node: GenreTreeNode,
  nodeGroup: d3.Selection<SVGGElement, unknown, HTMLElement, unknown>,
  callbacks: NodeActionCallbacks,
  rootColor: string,
) {
  const {
    onPlayPause,
    fileInputRef,
    selectingFileNodeIdRef,
    onAddChild,
    onRenameRequest,
    onDeleteRequest,
    playingNodeId,
    playState,
    handleMoreActionEnterMouse,
  } = callbacks;

  const actionsGroup = nodeGroup.append("g").attr("id", "actions-container-" + node.id);
  const dimensions = calculateNodeDimensions(node.itemCount);
  const actionsContainerX = dimensions.WIDTH / 2 + MORE_ICON_WIDTH;

  const isActionable = node.actionable !== false;
  const actionsContainerHeight = isActionable
    ? ACTIONS_CONTAINER_DIMENSIONS_MAX.HEIGHT
    : ACTION_CONTAINER_DIMENSIONS.HEIGHT * 2;
  const actionsContainerY = -actionsContainerHeight / 2;

  actionsGroup
    .append("rect")
    .attr("id", "actions-background")
    .attr("x", actionsContainerX)
    .attr("y", actionsContainerY)
    .attr("width", ACTIONS_CONTAINER_DIMENSIONS_MAX.WIDTH)
    .attr("height", actionsContainerHeight)
    .attr("fill", rootColor);

  actionsGroup
    .append("path")
    .attr(
      "d",
      "M " +
        dimensions.WIDTH / 2 +
        " -" +
        dimensions.HEIGHT / 2 +
        " L " +
        actionsContainerX +
        " -" +
        actionsContainerHeight / 2 +
        " L " +
        actionsContainerX +
        " -" +
        dimensions.HEIGHT / 2 +
        " Z",
    )
    .attr("fill", "RGBA(0, 0, 0, 0)");

  actionsGroup
    .append("path")
    .attr(
      "d",
      "M " +
        dimensions.WIDTH / 2 +
        " " +
        dimensions.HEIGHT / 2 +
        " L " +
        actionsContainerX +
        " " +
        actionsContainerHeight / 2 +
        " L " +
        actionsContainerX +
        " " +
        dimensions.HEIGHT / 2 +
        " Z",
    )
    .attr("fill", "RGBA(0, 0, 0, 0)");

  if (isActionable) {
    const addChildActionOnclick = (_event: MouseEvent, d: D3Node) => {
      nodeGroup.dispatch("mouseleave");
      onAddChild?.(d.data.id);
    };

    addActionContainer(
      d3Lib,
      actionsContainerHeight,
      actionsGroup,
      5,
      "add-child-container",
      addChildActionOnclick,
      () => <FaPlus className="gtv-icon" size={ACTION_ICON_SIZE} color="white" />,
      () => "Add sub-genre",
      () => true,
      actionsContainerX,
    );

    const changeParentActionOnclick = (_event: MouseEvent, d: D3Node) => {
      nodeGroup.dispatch("mouseleave");
      callbacks.onReparentRequest?.(d.data);
    };

    addActionContainer(
      d3Lib,
      actionsContainerHeight,
      actionsGroup,
      6,
      "change-parent-container",
      changeParentActionOnclick,
      () => <PiGraphFill className="gtv-icon" size={ACTION_ICON_SIZE} color="white" />,
      () => "Change parent",
      () => true,
      actionsContainerX,
    );

    const renameActionOnclick = (_event: MouseEvent, d: D3Node) => {
      nodeGroup.dispatch("mouseleave");
      onRenameRequest?.(d.data);
    };

    addActionContainer(
      d3Lib,
      actionsContainerHeight,
      actionsGroup,
      4,
      "rename-container",
      renameActionOnclick,
      () => <MdModeEdit className="gtv-icon" size={ACTION_ICON_SIZE} color="white" />,
      () => "Rename",
      () => true,
      actionsContainerX,
    );

    const deleteActionOnclick = (_event: MouseEvent, d: D3Node) => {
      nodeGroup.dispatch("mouseleave");
      onDeleteRequest?.(d.data);
    };

    addActionContainer(
      d3Lib,
      actionsContainerHeight,
      actionsGroup,
      7,
      "delete-container",
      deleteActionOnclick,
      () => <FaTrashAlt className="gtv-icon" size={ACTION_ICON_SIZE} color="white" />,
      () => "Delete",
      () => true,
      actionsContainerX,
    );
  }

  const playPauseActionOnclick = (_event: MouseEvent, d: D3Node) => {
    onPlayPause?.(d.data.id);
  };

  addActionContainer(
    d3Lib,
    actionsContainerHeight,
    actionsGroup,
    1,
    "track-count-container",
    () => {},
    () => (
      <span className="gtv-hash-icon" style={{ width: ACTION_ICON_SIZE, height: ACTION_ICON_SIZE }}>
        #
      </span>
    ),
    (d) => `${d.data.itemCount ?? 0} items`,
    () => true,
    actionsContainerX,
  );

  addActionContainer(
    d3Lib,
    actionsContainerHeight,
    actionsGroup,
    2,
    "play-pause-container",
    playPauseActionOnclick,
    (d) => {
      if (playingNodeId && playingNodeId === d.data.id) {
        if (playState === "playing") {
          return <FaPause className="gtv-icon" size={ACTION_ICON_SIZE} color="white" />;
        } else if (playState === "loading") {
          return <FaSpinner className="gtv-icon gtv-icon--spin" size={SPINNER_ICON_SIZE} color="white" />;
        }
      }
      return <FaPlay className="gtv-icon" size={ACTION_ICON_SIZE} color="white" />;
    },
    (d) => {
      if (playingNodeId && playingNodeId === d.data.id) {
        return playState === "playing" ? "Pause" : playState === "loading" ? "Loading" : "Play";
      }
      return "Play";
    },
    (d) => d.data.itemCount > 0,
    actionsContainerX,
  );

  const uploadActionOnclick = (event: MouseEvent, d: D3Node) => {
    event.stopPropagation();
    selectingFileNodeIdRef.current = d.data.id;
    fileInputRef.current?.click();
    nodeGroup.dispatch("mouseleave");
  };

  addActionContainer(
    d3Lib,
    actionsContainerHeight,
    actionsGroup,
    3,
    "upload-files-container",
    uploadActionOnclick,
    () => <FaFileUpload className="gtv-icon" size={ACTION_ICON_SIZE} color="white" />,
    () => "Upload files",
    () => true,
    actionsContainerX,
  );

  actionsGroup.on("mouseenter", function () {
    addMoreIconContainer(d3Lib, node, nodeGroup, handleMoreActionEnterMouse, rootColor);
  });

  actionsGroup.on("mouseleave", function () {
    d3Lib.select<SVGGElement, unknown>("#actions-container-" + node.id).remove();
    d3Lib.select<SVGGElement, unknown>("#more-icon-container-" + node.id).remove();
    d3Lib.select<SVGGElement, unknown>("#select-as-new-parent-group-" + node.id).remove();
  });

  return actionsGroup;
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
      .attr("fill", "green");

    overlayGroup
      .append("foreignObject")
      .attr("width", dimensions.WIDTH)
      .attr("height", dimensions.HEIGHT)
      .attr("x", -dimensions.WIDTH / 2)
      .attr("y", -dimensions.HEIGHT / 2)
      .html(() =>
        ReactDOMServer.renderToString(
          <div className="gtv-reparent-target">
            <PiGraphFill size={20} color="white" />
            <div className="gtv-reparent-target-label">Select as new parent</div>
          </div>,
        ),
      )
      .on("click", function (_event: MouseEvent, d: unknown) {
        onReparentTargetSelect((d as D3Node).data.id);
      });
  }

  return overlayGroup;
}
