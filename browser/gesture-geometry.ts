import type { Page, CDPSession } from "@playwright/test";

export const viewportSelector = ".gtv-wheel-container";
const stageSelector = `${viewportSelector} > div:first-child`;
export const frame = (page: Page) => page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
export const matrix = (page: Page) => page.locator(stageSelector).evaluate((stage) => {
  const m = new DOMMatrixReadOnly(getComputedStyle(stage).transform);
  return { x: m.e, y: m.f, k: m.a };
});
export const touch = (cdp: CDPSession, type: "touchStart" | "touchMove" | "touchEnd" | "touchCancel", points: { x: number; y: number; id: number }[]) =>
  cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });

export const dragTarget = (page: Page, selector: string) => page.locator(selector).evaluateAll((elements) => {
  for (const element of elements) {
    const r = element.getBoundingClientRect();
    for (const fraction of [0.5, 0.25, 0.75]) {
      const x = r.left + r.width * fraction, y = r.top + r.height / 2;
      if (x > 70 && x < innerWidth - 100 && y > 100 && y < innerHeight - 100 && element.contains(document.elementFromPoint(x, y))) return { x, y };
    }
  }
  return null;
});

export async function background(page: Page) {
  return page.locator(viewportSelector).evaluate((viewport) => {
    const r = viewport.getBoundingClientRect();
    for (let y = Math.max(10, r.top + 45); y < Math.min(innerHeight - 100, r.bottom - 45); y += 20) {
      for (let x = r.left + 40; x < Math.min(innerWidth - 60, r.right - 60); x += 20) {
        const target = document.elementFromPoint(x, y);
        if (target && viewport.contains(target) && !target.closest("g.node, foreignObject, .gtv-zoom-controls, .gtv-wheel-chip, button")) return { x, y };
      }
    }
    throw new Error("No visible background available for a real drag");
  });
}

