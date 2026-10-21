import { Fragment, useState } from "react";
import { MdHome } from "react-icons/md";

import type { GenreTreeNode } from "./types";

const MAX_VISIBLE_ANCESTORS = 3;
const ANCESTORS_KEPT_WHEN_COLLAPSED = 2;

interface WheelBreadcrumbProps {
  /** Zoomable ancestors of the focused view, root first. */
  ancestors: readonly GenreTreeNode[];
  currentName: string | undefined;
  onHome: () => void;
  onAncestor: (id: string) => void;
}

/** The focused wheel's trail: Home, its zoomable ancestor views, then the current view. A long trail
 * collapses its middle into a "…" button that expands it inline. */
export function WheelBreadcrumb({ ancestors, currentName, onHome, onAncestor }: WheelBreadcrumbProps) {
  const [expanded, setExpanded] = useState(false);
  const collapsed = !expanded && ancestors.length > MAX_VISIBLE_ANCESTORS;
  const visibleAncestors = collapsed ? ancestors.slice(-ANCESTORS_KEPT_WHEN_COLLAPSED) : ancestors;
  const separator = <span aria-hidden="true">›</span>;

  return (
    <nav className="gtv-wheel-breadcrumb" aria-label="Breadcrumb">
      <button
        type="button"
        className="gtv-wheel-breadcrumb-crumb gtv-wheel-breadcrumb-home"
        aria-label="All genres"
        title="All genres"
        onClick={onHome}
      >
        <MdHome className="gtv-icon" size={14} />
      </button>
      {separator}
      {collapsed && (
        <>
          <button
            type="button"
            className="gtv-wheel-breadcrumb-crumb"
            aria-label="Show full path"
            aria-expanded={false}
            onClick={() => setExpanded(true)}
          >
            …
          </button>
          {separator}
        </>
      )}
      {visibleAncestors.map((ancestor) => (
        <Fragment key={ancestor.id}>
          <button type="button" className="gtv-wheel-breadcrumb-crumb" onClick={() => onAncestor(ancestor.id)}>
            {ancestor.name}
          </button>
          {separator}
        </Fragment>
      ))}
      <span className="gtv-wheel-breadcrumb-current" aria-current="page">
        {currentName}
      </span>
    </nav>
  );
}
