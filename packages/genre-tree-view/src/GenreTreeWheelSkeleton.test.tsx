import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { GenreTreeWheelSkeleton } from "./GenreTreeWheelSkeleton";

describe("GenreTreeWheelSkeleton", () => {
  it("renders an accessible loading label and a hidden svg wheel", () => {
    render(<GenreTreeWheelSkeleton />);

    expect(screen.getByText("Loading genre tree…")).toBeInTheDocument();
    const svg = document.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  it("renders the wheel ring guide, hub circle, and accent dot", () => {
    render(<GenreTreeWheelSkeleton />);

    expect(document.querySelectorAll("circle").length).toBe(4);
  });

  it("renders chip/branch rects and connector paths", () => {
    render(<GenreTreeWheelSkeleton />);

    expect(document.querySelectorAll("rect").length).toBeGreaterThan(1);
    expect(document.querySelectorAll("path").length).toBeGreaterThan(0);
  });

  it("fills the container corners via a CSS conic-gradient layer independent of the content viewBox", () => {
    render(<GenreTreeWheelSkeleton />);

    // The color fill must cover the full box regardless of its aspect ratio, while the wheel
    // content itself (rendered in the sibling <svg>) must never be cropped to achieve that — so
    // the two are rendered as separate layers instead of sharing one viewBox/preserveAspectRatio.
    const svg = document.querySelector("svg") as SVGSVGElement;
    expect(svg).toHaveAttribute("preserveAspectRatio", "xMidYMid meet");
    expect(document.querySelector('path[fill^="#"]')).toBeNull();

    const gradientLayer = svg.parentElement?.querySelector(
      ":scope > div",
    ) as HTMLElement;
    expect(gradientLayer).not.toBeNull();
    expect(gradientLayer.style.background).toMatch(/^conic-gradient\(/);
    expect(gradientLayer.style.opacity).toBe("0.16");
  });

  it("renders unique gradient/mask ids across multiple mounted instances", () => {
    const { container: containerA } = render(<GenreTreeWheelSkeleton />);
    const { container: containerB } = render(<GenreTreeWheelSkeleton />);

    const maskIdA = containerA.querySelector("mask")?.id;
    const maskIdB = containerB.querySelector("mask")?.id;
    expect(maskIdA).toBeTruthy();
    expect(maskIdB).toBeTruthy();
    expect(maskIdA).not.toBe(maskIdB);
  });
});
