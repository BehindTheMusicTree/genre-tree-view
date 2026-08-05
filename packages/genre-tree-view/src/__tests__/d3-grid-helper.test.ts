import { afterEach, describe, expect, it } from "vitest";
import * as d3 from "d3";
import { addGrid } from "../d3-helper/d3-grid-helper";

afterEach(() => {
  document.body.innerHTML = "";
});

function createSvg() {
  const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  document.body.appendChild(svgEl);
  return d3.select(svgEl).append("g") as unknown as d3.Selection<SVGGElement, unknown, null, undefined>;
}

describe("addGrid", () => {
  it("renders nothing when gridIsHidden is true", () => {
    const svg = createSvg();
    addGrid(svg, 100, 100, true);
    expect(svg.select("g.grid").empty()).toBe(true);
  });

  it("renders grid lines and labels when gridIsHidden is false", () => {
    const svg = createSvg();
    addGrid(svg, 100, 100, false);
    const grid = svg.select("g.grid");
    expect(grid.empty()).toBe(false);
    expect(grid.selectAll("line").size()).toBeGreaterThan(0);
    expect(grid.selectAll("text").size()).toBeGreaterThan(0);
  });
});
