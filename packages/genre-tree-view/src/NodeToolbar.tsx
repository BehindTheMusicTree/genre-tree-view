"use client";

import { useState } from "react";
import { MdMoreVert, MdModeEdit } from "react-icons/md";
import { FaPlus, FaTrashAlt, FaPlay, FaPause, FaSpinner } from "react-icons/fa";
import { PiGraphFill } from "react-icons/pi";

import { GenreTreeAction, GenreTreeNode, GenreTreePlayState } from "./types";

export interface NodeToolbarProps {
  node: GenreTreeNode;
  /** Overrides `node.itemCount` for the play button's enabled check — callers that scale a root
   * chip off an aggregated subtree total (see WheelCore's `aggregatedRootItemCountById`) pass
   * that same total here so "Play" reflects whether the subtree has anything playable, not just
   * the root's own unrolled-up count. */
  itemCount?: number;
  playingNodeId?: string | null;
  playState?: GenreTreePlayState;
  onPlayPause?: (nodeId: string) => void;
  onAddChild?: (parentId: string) => void;
  onRenameRequest?: (node: GenreTreeNode) => void;
  onDeleteRequest?: (node: GenreTreeNode) => void;
  onReparentRequest?: (node: GenreTreeNode) => void;
  additionalActions?: (node: GenreTreeNode) => GenreTreeAction[];
  className?: string;
}

/** The same play/add-child/rename/reparent/delete/extra actions `addToolbarActions` renders
 * onto a tree node's SVG card, as a plain React widget — for surfaces outside the SVG tree (the
 * wheel's root chips) that don't carry a mounted node for `addToolbarActions` to attach to. */
export function NodeToolbar({
  node,
  itemCount = node.itemCount,
  playingNodeId,
  playState,
  onPlayPause,
  onAddChild,
  onRenameRequest,
  onDeleteRequest,
  onReparentRequest,
  additionalActions,
  className,
}: NodeToolbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isActionable = node.actionable !== false;
  const extraActions = additionalActions?.(node) ?? [];
  const primaryExtraActions = extraActions.filter((a) => a.placement === "primary");
  const overflowExtraActions = extraActions.filter((a) => a.placement !== "primary");
  const isPlayable = itemCount > 0;
  const isThisPlaying = playingNodeId === node.id;
  const playLabel = isThisPlaying && playState === "playing" ? "Pause" : isThisPlaying && playState === "loading" ? "Loading..." : "Play";
  const playIcon =
    isThisPlaying && playState === "playing" ? (
      <FaPause className="gtv-icon" size={12} />
    ) : isThisPlaying && playState === "loading" ? (
      <FaSpinner className="gtv-icon gtv-icon--spin" size={12} />
    ) : (
      <FaPlay className="gtv-icon" size={12} />
    );

  return (
    <div className={["gtv-toolbar", className].filter(Boolean).join(" ")}>
      <button
        type="button"
        className={`gtv-toolbar-btn${!isPlayable ? " gtv-toolbar-btn--disabled" : ""}`}
        title={playLabel}
        aria-label={playLabel}
        disabled={!isPlayable}
        onClick={() => onPlayPause?.(node.id)}
      >
        {playIcon}
      </button>

      {isActionable && (
        <>
          <button
            type="button"
            className="gtv-toolbar-btn"
            title="Add sub-genre"
            aria-label="Add sub-genre"
            onClick={() => onAddChild?.(node.id)}
          >
            <FaPlus className="gtv-icon" size={12} />
          </button>
          {primaryExtraActions.map((action) => {
            const enabled = action.enabled ? action.enabled(node) : true;
            const label = action.label(node);
            return (
              <button
                key={action.key}
                type="button"
                className={`gtv-toolbar-btn${!enabled ? " gtv-toolbar-btn--disabled" : ""}`}
                title={label}
                aria-label={label}
                disabled={!enabled}
                onClick={(event) => action.onClick(event, node)}
              >
                {action.icon(node)}
              </button>
            );
          })}
          <div className="gtv-toolbar-overflow">
            <button
              type="button"
              className="gtv-toolbar-btn"
              title="More actions"
              aria-label="More actions"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <MdMoreVert size={14} />
            </button>
            {menuOpen && (
              <div className="gtv-menu-card gtv-toolbar-overflow-menu">
                <button
                  type="button"
                  className="gtv-menu-row"
                  onClick={() => {
                    setMenuOpen(false);
                    onRenameRequest?.(node);
                  }}
                >
                  <span className="gtv-menu-row-icon">
                    <MdModeEdit className="gtv-icon" size={13} />
                  </span>
                  <span className="gtv-menu-row-label">Rename</span>
                </button>
                <button
                  type="button"
                  className="gtv-menu-row"
                  onClick={() => {
                    setMenuOpen(false);
                    onReparentRequest?.(node);
                  }}
                >
                  <span className="gtv-menu-row-icon">
                    <PiGraphFill className="gtv-icon" size={13} />
                  </span>
                  <span className="gtv-menu-row-label">Change parent</span>
                </button>
                {overflowExtraActions.map((action) => {
                  const enabled = action.enabled ? action.enabled(node) : true;
                  return (
                    <button
                      key={action.key}
                      type="button"
                      className={`gtv-menu-row${action.danger ? " gtv-menu-row--danger" : ""}${!enabled ? " gtv-menu-row--disabled" : ""}`}
                      disabled={!enabled}
                      onClick={(event) => {
                        setMenuOpen(false);
                        action.onClick(event, node);
                      }}
                    >
                      <span className="gtv-menu-row-icon">{action.icon(node)}</span>
                      <span className="gtv-menu-row-label">{action.label(node)}</span>
                    </button>
                  );
                })}
                <div className="gtv-menu-divider" />
                <button
                  type="button"
                  className="gtv-menu-row gtv-menu-row--danger"
                  onClick={() => {
                    setMenuOpen(false);
                    onDeleteRequest?.(node);
                  }}
                >
                  <span className="gtv-menu-row-icon">
                    <FaTrashAlt className="gtv-icon" size={13} />
                  </span>
                  <span className="gtv-menu-row-label">Delete</span>
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
