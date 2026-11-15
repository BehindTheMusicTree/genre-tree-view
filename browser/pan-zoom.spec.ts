import { expect, test, type Page, type CDPSession } from "@playwright/test";

const viewportSelector = ".gtv-wheel-container";
const stageSelector = `${viewportSelector} > div:first-child`;
const frame = (page: Page) => page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
const matrix = (page: Page) => page.locator(stageSelector).evaluate((stage) => {
  const m = new DOMMatrixReadOnly(getComputedStyle(stage).transform);
  return { x: m.e, y: m.f, k: m.a };
});
const touch = (cdp: CDPSession, type: "touchStart" | "touchMove" | "touchEnd" | "touchCancel", points: { x: number; y: number; id: number }[]) =>
  cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });

async function background(page: Page) {
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

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.locator(viewportSelector).scrollIntoViewIfNeeded();
  await expect(page.locator(".gtv-node-dot").first()).toBeAttached();
  await expect.poll(async () => (await matrix(page)).k).toBeGreaterThan(0);
  // Let initial fitting and debounced label placement finish before measuring input.
  await page.waitForTimeout(700);
});

test("real drag preserves its transform through a pause and commits on release", async ({ page, context, isMobile }, info) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  const metrics = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map(({ name, value }) => [name, value]));
  const phases: Record<string, Record<string, number>> = {};
  const point = await background(page);
  const before = await matrix(page);
  phases.before = await metrics();
  if (isMobile) await touch(cdp, "touchStart", [{ ...point, id: 1 }]);
  else { await page.mouse.move(point.x, point.y); await page.mouse.down(); }
  for (let step = 1; step <= 12; step++) {
    const next = { x: point.x + step * 3, y: point.y + step * 2 };
    if (isMobile) await touch(cdp, "touchMove", [{ ...next, id: 1 }]);
    else await page.mouse.move(next.x, next.y);
    await frame(page);
    if (step === 1) phases.start = await metrics();
  }
  await expect(page.locator(".gtv-gesture-shield")).toBeVisible();
  // The hit-test shield must not disable thousands of SVG descendants as a side effect.
  expect(await page.locator(".gtv-hover-hit-area").first().evaluate((element) => getComputedStyle(element).pointerEvents)).toBe("all");
  const moved = await matrix(page);
  expect(moved.x).toBeGreaterThan(before.x + 20);
  expect(moved.k).toBeCloseTo(before.k);
  phases.moving = await metrics();
  await page.waitForTimeout(500);
  expect(await matrix(page)).toEqual(moved);
  await expect(page.locator(".gtv-stage--moving")).toHaveCount(1);
  phases.pause = await metrics();
  expect(await page.locator(".node:hover, .gtv-wheel-chip:hover").count()).toBe(0);
  if (isMobile) await touch(cdp, "touchEnd", []);
  else await page.mouse.up();
  await frame(page);
  await expect(page.locator(".gtv-stage--moving")).toHaveCount(0);
  expect(await matrix(page)).toEqual(moved);
  phases.release = await metrics();
  await page.waitForTimeout(700);
  phases.settled = await metrics();
  expect(new URL(page.url()).searchParams.get("genre")).toBeNull();
  await info.attach("gesture-metrics", { body: JSON.stringify({ browser: context.browser()?.version(), before, moved, phases }, null, 2), contentType: "application/json" });
});

for (const selector of [".gtv-wheel-chip", "g.node .gtv-node-label"]) {
  test(`${selector} drag pans without selecting and the next tap still selects`, async ({ page, context, isMobile }) => {
    if (selector.includes("node")) {
      const nodePoint = await page.locator(".gtv-node-dot").evaluateAll((dots) => {
        for (const dot of dots) {
          const r = dot.getBoundingClientRect();
          const x = r.left + r.width / 2, y = r.top + r.height / 2;
          if (x > 70 && x < innerWidth - 100 && y > 100 && y < innerHeight - 100) return { x, y };
        }
        throw new Error("No visible node to magnify");
      });
      await page.mouse.move(nodePoint.x, nodePoint.y);
      for (let tick = 0; tick < 6; tick++) {
        await page.mouse.wheel(0, -50);
        await page.waitForTimeout(100);
      }
      await expect(page.locator(".gtv-gesture-shield")).toBeHidden();
    }
    const point = await page.locator(selector).evaluateAll((chips) => {
      for (const chip of chips) {
        const r = chip.getBoundingClientRect();
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        if (x > 60 && x < innerWidth - 100 && y > 70 && y < innerHeight - 100 && (chip.closest("g.node") ?? chip).contains(document.elementFromPoint(x, y))) return { x, y };
      }
      throw new Error("No visible drag target");
    });
    const before = await matrix(page);
    const cdp = await context.newCDPSession(page);
    if (isMobile) await touch(cdp, "touchStart", [{ ...point, id: 1 }]);
    else { await page.mouse.move(point.x, point.y); await page.mouse.down(); }
    for (let step = 1; step <= 8; step++) {
      const next = { x: point.x + step * 5, y: point.y + step * 3 };
      if (isMobile) await touch(cdp, "touchMove", [{ ...next, id: 1 }]);
      else await page.mouse.move(next.x, next.y);
      await frame(page);
    }
    if (isMobile) await touch(cdp, "touchEnd", []);
    else await page.mouse.up();
    expect((await matrix(page)).x).toBeGreaterThan(before.x);
    await page.waitForTimeout(500);
    expect(new URL(page.url()).searchParams.get("genre")).toBeNull();
    if (isMobile) {
      await touch(cdp, "touchStart", [{ x: point.x + 40, y: point.y + 24, id: 1 }]);
      await touch(cdp, "touchEnd", []);
    } else await page.mouse.click(point.x + 40, point.y + 24);
    await expect.poll(() => new URL(page.url()).searchParams.get("genre")).not.toBeNull();
  });
}

test("pinch starting on content captures both fingers and cancellation ends the gesture", async ({ page, context, isMobile }) => {
  test.skip(!isMobile, "CDP touch gesture");
  const cdp = await context.newCDPSession(page);
  const point = await page.locator(".gtv-wheel-chip").evaluateAll((chips) => {
    for (const chip of chips) {
      const r = chip.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      if (x > 60 && x < innerWidth - 60 && y > 70 && y < innerHeight - 70 && chip.contains(document.elementFromPoint(x, y))) return { x, y };
    }
    throw new Error("No visible chip for content-start pinch");
  });
  const before = await matrix(page);
  await touch(cdp, "touchStart", [{ ...point, id: 1 }]);
  await touch(cdp, "touchStart", [{ ...point, id: 1 }, { x: point.x + 30, y: point.y + 30, id: 2 }]);
  for (const offset of [35, 45, 55]) {
    await touch(cdp, "touchMove", [{ ...point, id: 1 }, { x: point.x + offset, y: point.y + offset, id: 2 }]);
    await frame(page);
  }
  expect((await matrix(page)).k).toBeGreaterThan(before.k);
  await touch(cdp, "touchEnd", [{ x: point.x + 55, y: point.y + 55, id: 2 }]);
  const oneFinger = await matrix(page);
  await touch(cdp, "touchMove", [{ x: point.x + 35, y: point.y + 35, id: 1 }]);
  await frame(page);
  // Content-start pinch resumes as a pan when one finger remains.
  expect(await matrix(page)).not.toEqual(oneFinger);
  await touch(cdp, "touchCancel", []);
  await expect(page.locator(".gtv-stage--moving")).toHaveCount(0);
  await expect(page.locator(".gtv-gesture-shield")).toBeHidden();
  await page.waitForTimeout(500);
  expect(new URL(page.url()).searchParams.get("genre")).toBeNull();
});


test("wheel input shields hover, then restores node taps", async ({ page }) => {
  const point = await background(page);
  await page.mouse.move(point.x, point.y);
  const before = await matrix(page);
  await page.mouse.wheel(0, -50);
  await expect.poll(async () => (await matrix(page)).k).toBeGreaterThan(before.k);
  await expect(page.locator(".gtv-gesture-shield")).toBeHidden();
  const chip = await page.locator(".gtv-wheel-chip").evaluateAll((chips) => {
    for (const chip of chips) {
      const r = chip.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      if (x > 0 && x < innerWidth && y > 0 && y < innerHeight && chip.contains(document.elementFromPoint(x, y))) return { x, y };
    }
    throw new Error("No visible chip after wheel zoom");
  });
  await page.mouse.click(chip.x, chip.y);
  await expect.poll(() => new URL(page.url()).searchParams.get("genre")).not.toBeNull();
});

test("pen drag captures the pointer and commits without selecting a node", async ({ page, context }) => {
  const cdp = await context.newCDPSession(page);
  const point = await background(page);
  const before = await matrix(page);
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", buttons: 1, clickCount: 1, pointerType: "pen" });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x + 35, y: point.y + 20, buttons: 1, pointerType: "pen" });
  await frame(page);
  expect((await matrix(page)).x).toBeGreaterThan(before.x + 20);
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x + 35, y: point.y + 20, button: "left", buttons: 0, clickCount: 1, pointerType: "pen" });
  await expect(page.locator(".gtv-gesture-shield")).toBeHidden();
  expect(new URL(page.url()).searchParams.get("genre")).toBeNull();
});
