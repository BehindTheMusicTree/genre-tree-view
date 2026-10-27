import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { GenreTreeWheelSkeleton, buildMaskSvgMarkup } from "../GenreTreeWheelSkeleton";

describe("GenreTreeWheelSkeleton", () => {
  it("renders an accessible loading label and a hidden svg wheel", () => {
    render(<GenreTreeWheelSkeleton />);

    expect(screen.getByText("Loading genre tree…")).toBeInTheDocument();
    const svg = document.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  it("draws small circular dots and curved links instead of card rects", () => {
    render(<GenreTreeWheelSkeleton />);

    expect(document.querySelectorAll("rect").length).toBe(0);
    expect(document.querySelectorAll("circle").length).toBeGreaterThan(100);
    expect(document.querySelectorAll("path[stroke]").length).toBeGreaterThan(100);
  });

  it("renders identically on every mount so it can SSR without a hydration mismatch", () => {
    const { container: containerA } = render(<GenreTreeWheelSkeleton />);
    const { container: containerB } = render(<GenreTreeWheelSkeleton />);

    const normalize = (html: string) => html.replace(/[a-zA-Z0-9_-]*genre-tree-wheel-skeleton[a-zA-Z0-9_-]*/g, "id");
    expect(normalize(containerA.innerHTML)).toBe(normalize(containerB.innerHTML));
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
    expect(gradientLayer.style.opacity).toBe("0.22");
  });

  it("renders unique shape/gradient ids across multiple mounted instances", () => {
    const { container: containerA } = render(<GenreTreeWheelSkeleton />);
    const { container: containerB } = render(<GenreTreeWheelSkeleton />);

    const gradientIdA = containerA.querySelector("radialGradient")?.id;
    const gradientIdB = containerB.querySelector("radialGradient")?.id;
    expect(gradientIdA).toBeTruthy();
    expect(gradientIdB).toBeTruthy();
    expect(gradientIdA).not.toBe(gradientIdB);
  });

  it("animates the sweep in an HTML layer, not as an SVG mask or style inside the svg", () => {
    const { container } = render(<GenreTreeWheelSkeleton />);

    const svg = container.querySelector("svg") as SVGSVGElement;
    expect(svg.querySelector("mask")).toBeNull();
    expect(svg.querySelector("style")).toBeNull();

    const shimmer = container.querySelector(".gtv-wheel-skeleton-shimmer");
    expect(shimmer).toHaveAttribute("aria-hidden", "true");
    expect(shimmer?.querySelector(".gtv-wheel-skeleton-shimmer-wedge")).not.toBeNull();
  });

  it("masks the sweep with the wheel shapes once mounted", () => {
    const { container } = render(<GenreTreeWheelSkeleton />);

    const shimmer = container.querySelector(".gtv-wheel-skeleton-shimmer") as HTMLElement;
    expect(shimmer.style.maskImage).toMatch(/^url\("data:image\/svg\+xml/);
  });
});

describe("GenreTreeWheelSkeleton sweep animation", () => {
  const originalAnimate = Element.prototype.animate;

  afterEach(() => {
    Element.prototype.animate = originalAnimate;
    vi.unstubAllGlobals();
  });

  function stubAnimate() {
    const cancel = vi.fn();
    const animation = { cancel, startTime: null as number | null };
    const animate = vi.fn(() => animation);
    Element.prototype.animate = animate as unknown as typeof Element.prototype.animate;
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    return { animate, animation, cancel };
  }

  it("rotates the wedge a full turn on the document timeline so remounts resume in phase", () => {
    const { animate, animation } = stubAnimate();
    render(<GenreTreeWheelSkeleton />);

    expect(animate).toHaveBeenCalledWith(
      [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }],
      { duration: 2400, iterations: Infinity },
    );
    expect(animation.startTime).toBe(0);
  });

  it("cancels the animation on unmount", () => {
    const { cancel } = stubAnimate();
    const { unmount } = render(<GenreTreeWheelSkeleton />);

    unmount();

    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("does not animate under prefers-reduced-motion", () => {
    const { animate } = stubAnimate();
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    render(<GenreTreeWheelSkeleton />);

    expect(animate).not.toHaveBeenCalled();
  });

  it("reuses the same mask image across mounts", () => {
    const { container: containerA } = render(<GenreTreeWheelSkeleton />);
    const { container: containerB } = render(<GenreTreeWheelSkeleton />);

    const maskOf = (container: HTMLElement) =>
      (container.querySelector(".gtv-wheel-skeleton-shimmer") as HTMLElement).style.maskImage;
    expect(maskOf(containerA)).toBeTruthy();
    expect(maskOf(containerA)).toBe(maskOf(containerB));
  });
});

describe("buildMaskSvgMarkup", () => {
  it("serializes every dot and link into a white svg sharing the component's viewBox", () => {
    const markup = buildMaskSvgMarkup();
    const { container } = render(<GenreTreeWheelSkeleton />);
    const svg = container.querySelector("svg") as SVGSVGElement;

    expect(markup.startsWith("<svg ")).toBe(true);
    expect(markup).toContain(`viewBox="${svg.getAttribute("viewBox")}"`);
    expect(markup.split("<circle").length - 1).toBe(container.querySelectorAll("defs circle").length);
    expect(markup.split("<path").length - 1).toBe(container.querySelectorAll("defs path").length);
  });
});
