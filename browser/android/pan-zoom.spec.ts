import type { Page, CDPSession } from "@playwright/test";
import { test, expect } from "./fixture";
import { viewportSelector, frame, matrix, touch, dragTarget, background } from "../gesture-geometry";

async function stable(page: Page) {
  let previous = await matrix(page);
  await expect.poll(async () => {
    for (let i = 0; i < 12; i++) await frame(page);
    const current = await matrix(page);
    const same = JSON.stringify(current) === JSON.stringify(previous);
    previous = current;
    return same;
  }).toBe(true);
  return previous;
}
async function drag(page: Page, cdp: CDPSession, point: { x: number; y: number }) {
  await touch(cdp, "touchStart", [{ ...point, id: 1 }]);
  for (let step = 1; step <= 8; step++) {
    await touch(cdp, "touchMove", [{ x: point.x + step * 5, y: point.y + step * 3, id: 1 }]);
    await frame(page);
  }
}
async function pinch(page: Page, cdp: CDPSession, point: { x: number; y: number }) {
  await touch(cdp, "touchStart", [{ x: point.x - 20, y: point.y, id: 1 }, { x: point.x + 20, y: point.y, id: 2 }]);
  for (const offset of [30, 40, 50, 60]) {
    await touch(cdp, "touchMove", [{ x: point.x - offset, y: point.y, id: 1 }, { x: point.x + offset, y: point.y, id: 2 }]);
    await frame(page);
  }
}
const selected = (page: Page) => new URL(page.url()).searchParams.get("genre");

test.beforeEach(async ({ androidPage: page }) => {
  await page.goto("http://127.0.0.1:4173/");
  await page.locator(viewportSelector).scrollIntoViewIfNeeded();
  await expect(page.locator(".gtv-node-dot").first()).toBeAttached();
  await expect.poll(async () => (await matrix(page)).k).toBeGreaterThan(0);
  await stable(page);
});

test("background drag preserves scale and transform through pause and release", async ({ androidPage: page, cdp }) => {
  const before = await matrix(page);
  await drag(page, cdp, await background(page));
  await expect(page.locator(".gtv-gesture-shield")).toBeVisible();
  const moved = await stable(page);
  expect(moved.x).toBeGreaterThan(before.x + 20);
  expect(moved.k).toBeCloseTo(before.k);
  for (let i = 0; i < 30; i++) { await frame(page); expect(await matrix(page)).toEqual(moved); }
  await touch(cdp, "touchEnd", []);
  await expect(page.locator(".gtv-gesture-shield")).toBeHidden();
  expect(await stable(page)).toEqual(moved);
  expect(selected(page)).toBeNull();
  const zoomBefore = await matrix(page);
  await page.getByRole("button", { name: "Zoom in", exact: true }).tap();
  await expect.poll(async () => (await matrix(page)).k).toBeGreaterThan(zoomBefore.k);
  await stable(page);
  await page.getByRole("button", { name: "Fit to frame", exact: true }).tap();
  await expect.poll(async () => (await matrix(page)).k).toBeCloseTo(before.k);
  await stable(page);
});

for (const selector of [".gtv-wheel-chip[id]", "g.node .gtv-node-label:not(.gtv-node-label--hidden)"]) {
  test(`${selector} drag suppresses selection then tap selects the same genre`, async ({ androidPage: page, cdp }) => {
    for (let attempt = 0; attempt < 8 && !(await dragTarget(page, selector)); attempt++) {
      const point = await dragTarget(page, "g.node .gtv-hover-hit-area");
      if (!point) throw new Error("No visible node for touch pinch label preparation");
      await pinch(page, cdp, point);
      await touch(cdp, "touchEnd", []);
      await expect(page.locator(".gtv-gesture-shield")).toBeHidden();
      await stable(page);
    }
    await expect.poll(() => dragTarget(page, selector)).not.toBeNull();
    const point = (await dragTarget(page, selector))!;
    const id = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest("[id^='group-']")?.id.slice(6), point);
    expect(id).toBeTruthy();
    const before = await matrix(page);
    await drag(page, cdp, point);
    await touch(cdp, "touchEnd", []);
    await expect(page.locator(".gtv-gesture-shield")).toBeHidden();
    expect((await stable(page)).x).toBeGreaterThan(before.x);
    expect(selected(page)).toBeNull();
    const destination = { x: point.x + 40, y: point.y + 24 };
    expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest("[id^='group-']")?.id.slice(6), destination)).toBe(id);
    await touch(cdp, "touchStart", [{ ...destination, id: 1 }]);
    await touch(cdp, "touchEnd", []);
    await expect.poll(() => selected(page)).toBe(id);
  });
}

test("pinch continues with one finger; cancellation permits the next gesture", async ({ androidPage: page, cdp }) => {
  const point = await dragTarget(page, ".gtv-wheel-chip");
  if (!point) throw new Error("No visible chip for pinch");
  const before = await matrix(page);
  await pinch(page, cdp, point);
  expect((await matrix(page)).k).toBeGreaterThan(before.k);
  // CDP touchEnd lists the finger being released, leaving finger 1 available to pan.
  await touch(cdp, "touchEnd", [{ x: point.x + 60, y: point.y, id: 2 }]);
  const one = await stable(page);
  await touch(cdp, "touchMove", [{ x: point.x - 30, y: point.y + 20, id: 1 }]);
  await expect.poll(async () => (await matrix(page)).x).toBeGreaterThan(one.x);
  expect((await matrix(page)).k).toBeCloseTo(one.k);
  await touch(cdp, "touchCancel", []);
  await expect(page.locator(".gtv-gesture-shield")).toBeHidden();
  await expect(page.locator(".gtv-stage--moving")).toHaveCount(0);
  const cancelled = await stable(page);
  await drag(page, cdp, await background(page));
  await touch(cdp, "touchEnd", []);
  expect((await stable(page)).x).toBeGreaterThan(cancelled.x);
  expect(selected(page)).toBeNull();
  const zoomBefore = await matrix(page);
  await page.getByRole("button", { name: "Zoom in", exact: true }).tap();
  await expect.poll(async () => (await matrix(page)).k).toBeGreaterThan(zoomBefore.k);
  await stable(page);
  await page.getByRole("button", { name: "Fit to frame", exact: true }).tap();
  await expect.poll(async () => (await matrix(page)).k).toBeCloseTo(before.k);
  await stable(page);
});
