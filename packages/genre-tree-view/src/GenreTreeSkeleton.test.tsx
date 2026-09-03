import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { GenreTreeSkeleton } from "./GenreTreeSkeleton";

describe("GenreTreeSkeleton", () => {
  it("renders an accessible loading label and a hidden svg tree", () => {
    render(<GenreTreeSkeleton />);

    expect(screen.getByText("Loading genre tree…")).toBeInTheDocument();
    const svg = document.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  it("renders exactly one root accent circle for the root card", () => {
    render(<GenreTreeSkeleton />);

    expect(document.querySelectorAll("circle").length).toBe(1);
  });

  it("renders skeleton cards and connector paths for every level", () => {
    render(<GenreTreeSkeleton />);

    expect(document.querySelectorAll("rect").length).toBeGreaterThan(1);
    expect(document.querySelectorAll("path").length).toBeGreaterThan(0);
  });

  it("renders unique gradient/mask ids across multiple mounted instances", () => {
    const { container: containerA } = render(<GenreTreeSkeleton />);
    const { container: containerB } = render(<GenreTreeSkeleton />);

    const maskIdA = containerA.querySelector("mask")?.id;
    const maskIdB = containerB.querySelector("mask")?.id;
    expect(maskIdA).toBeTruthy();
    expect(maskIdB).toBeTruthy();
    expect(maskIdA).not.toBe(maskIdB);
  });
});
