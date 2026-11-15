import { expect, test } from "@playwright/test";
import { dragTarget, touch, viewportSelector } from "./gesture-geometry";

test("node hit areas provide a pinch target when decorative dots cannot receive input", async ({ page }) => {
  await page.goto("/");
  await page.locator(viewportSelector).scrollIntoViewIfNeeded();
  await expect(page.locator("g.node .gtv-hover-hit-area").first()).toBeAttached();
  await expect.poll(() => dragTarget(page, "g.node .gtv-hover-hit-area")).not.toBeNull();
  expect(await dragTarget(page, ".gtv-node-dot")).toBeNull();
});

test("CDP partial touch release keeps the other pointer available for movement", async ({ page, context, isMobile }) => {
  test.skip(!isMobile, "CDP touch gesture");
  await page.setContent('<div style="position:fixed;inset:0;touch-action:none"></div>');
  const state = await page.evaluateHandle(() => {
    const active = new Set<number>();
    const downs: number[] = [];
    const moves: { id: number; x: number }[] = [];
    window.addEventListener("pointerdown", (event) => { active.add(event.pointerId); downs.push(event.pointerId); });
    window.addEventListener("pointerup", (event) => active.delete(event.pointerId));
    window.addEventListener("pointermove", (event) => moves.push({ id: event.pointerId, x: event.clientX }));
    return { active, downs, moves };
  });
  const cdp = await context.newCDPSession(page);
  await touch(cdp, "touchStart", [{ x: 150, y: 200, id: 1 }, { x: 230, y: 200, id: 2 }]);
  await expect.poll(() => state.evaluate(({ downs }) => downs.length)).toBe(2);
  const survivor = await state.evaluate(({ downs }) => downs[0]);
  await touch(cdp, "touchEnd", [{ x: 230, y: 200, id: 2 }]);
  await expect.poll(() => state.evaluate(({ active }) => [...active])).toEqual([survivor]);
  await touch(cdp, "touchMove", [{ x: 180, y: 200, id: 1 }]);
  await expect.poll(() => state.evaluate(({ moves }) => moves.at(-1))).toEqual({ id: survivor, x: 180 });
  expect(await state.evaluate(({ downs }) => downs.length)).toBe(2);
  await touch(cdp, "touchEnd", []);
  await state.dispose();
});
