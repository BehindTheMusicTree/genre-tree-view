import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { GenreTreeViewSkeleton } from "./GenreTreeViewSkeleton";

describe("GenreTreeViewSkeleton", () => {
  it.each(["wheel", "pop-core"] as const)(
    "renders the wheel skeleton for viewMode=%s",
    (viewMode) => {
      const { container } = render(<GenreTreeViewSkeleton viewMode={viewMode} />);

      expect(screen.getByText("Loading genre tree…")).toBeInTheDocument();
      expect(container.querySelector(".tree-container")).not.toBeNull();
    },
  );

  it("renders the stacked skeleton for viewMode=stacked", () => {
    const { container } = render(<GenreTreeViewSkeleton viewMode="stacked" />);

    expect(screen.getByText("Loading genre tree…")).toBeInTheDocument();
    expect(container.querySelector(".tree-container")).toBeNull();
  });
});
