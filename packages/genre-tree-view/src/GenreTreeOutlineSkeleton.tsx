"use client";

// Indent level and relative width per placeholder row — a few roots, one expanded, so it reads
// as a nested outline rather than a flat list.
const ROWS: { depth: number; width: number }[] = [
  { depth: 0, width: 38 },
  { depth: 0, width: 26 },
  { depth: 1, width: 18 },
  { depth: 2, width: 30 },
  { depth: 2, width: 24 },
  { depth: 1, width: 16 },
  { depth: 0, width: 32 },
  { depth: 0, width: 22 },
];

export function GenreTreeOutlineSkeleton() {
  return (
    <div className="gtv-skeleton gtv-outline-skeleton">
      <span className="gtv-skeleton-sr-only">Loading genre tree…</span>
      {ROWS.map((row, i) => (
        <div
          key={i}
          className="gtv-outline-skeleton-row"
          aria-hidden="true"
          style={{ marginLeft: `${row.depth * 1.25}rem`, width: `${row.width}%` }}
        />
      ))}
    </div>
  );
}
