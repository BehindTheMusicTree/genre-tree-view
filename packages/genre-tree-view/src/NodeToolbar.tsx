"use client";

import { useRef, useState } from "react";
import { MdMoreVert, MdModeEdit } from "react-icons/md";
import { FaPlus, FaTrashAlt, FaPlay, FaPause, FaSpinner, FaFileUpload } from "react-icons/fa";
import { PiGraphFill } from "react-icons/pi";

import { GenreTreeNode, GenreTreePlayState } from "./types";

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
  onUploadFiles?: (nodeId: string, files: File[]) => void;
  className?: string;
}

/** The same play/upload/add-child/rename/reparent/delete actions `addToolbarActions` renders
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
  onUploadFiles,
  className,
}: NodeToolbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isActionable = node.actionable !== false;
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

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) onUploadFiles?.(node.id, Array.from(files));
    event.target.value = "";
  };

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
          <input type="file" multiple ref={fileInputRef} style={{ display: "none" }} onChange={handleFileChange} />
          <button
            type="button"
            className="gtv-toolbar-btn"
            title="Upload files"
            aria-label="Upload files"
            onClick={() => fileInputRef.current?.click()}
          >
            <FaFileUpload className="gtv-icon" size={12} />
          </button>
          <button
            type="button"
            className="gtv-toolbar-btn"
            title="Add sub-genre"
            aria-label="Add sub-genre"
            onClick={() => onAddChild?.(node.id)}
          >
            <FaPlus className="gtv-icon" size={12} />
          </button>
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
