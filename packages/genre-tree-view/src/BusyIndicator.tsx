/** Spinner shown in the floating controls while the host marks the tree `busy`. */
export function BusyIndicator() {
  return (
    <div className="gtv-busy" role="status" aria-live="polite">
      <span className="gtv-busy-ring" aria-hidden="true" />
      <span className="gtv-skeleton-sr-only">Updating genre tree…</span>
    </div>
  );
}
