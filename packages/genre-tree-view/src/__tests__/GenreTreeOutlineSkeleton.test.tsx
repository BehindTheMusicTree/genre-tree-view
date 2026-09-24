import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { GenreTreeOutlineSkeleton } from "../GenreTreeOutlineSkeleton";

describe("GenreTreeOutlineSkeleton", () => {
  it("renders an accessible loading label and placeholder rows", () => {
    const { container } = render(<GenreTreeOutlineSkeleton />);

    expect(screen.getByText("Loading genre tree…")).toBeInTheDocument();
    expect(container.querySelectorAll(".gtv-outline-skeleton-row").length).toBeGreaterThan(0);
  });
});
