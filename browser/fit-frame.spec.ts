import { expect, test } from "@playwright/test";

for (const renderer of ["Genre wheel (radial, pop/core)", "Genre wheel (radial)", "Genre wheel", "Genre wheel (right)", "Stacked trees"]) {
  test(`${renderer} returns to its initial frame after zoom and repeated fits`, async ({ page }, info) => {
    await page.goto("/");
    await page.getByRole("button", { name: renderer, exact: true }).click();
    const viewport = page.locator('div[style*="touch-action"]').first();
    await viewport.scrollIntoViewIfNeeded();
    const stage = viewport.locator(":scope > div").first();
    const matrix = () => stage.evaluate((element) => {
      const m = new DOMMatrixReadOnly(getComputedStyle(element).transform);
      return { x: m.e, y: m.f, k: m.a };
    });
    await expect.poll(async () => (await matrix()).k).toBeGreaterThan(0);
    // Initial fit and deferred collision placement must both finish before the baseline.
    await page.waitForTimeout(700);
    const initial = await matrix();
    const frames = [initial];
    for (let cycle = 0; cycle < 2; cycle++) {
      await viewport.getByRole("button", { name: "Zoom in", exact: true }).click();
      await expect.poll(async () => (await matrix()).k).toBeGreaterThan(initial.k);
      await page.waitForTimeout(700);
      await viewport.getByRole("button", { name: "Fit to frame", exact: true }).click();
      await expect.poll(async () => {
        const fitted = await matrix();
        return Math.max(Math.abs(fitted.x - initial.x), Math.abs(fitted.y - initial.y), Math.abs(fitted.k - initial.k));
      }).toBeLessThan(0.001);
      await page.waitForTimeout(700);
      frames.push(await matrix());
      expect(frames.at(-1)?.k).toBeCloseTo(initial.k, 5);
    }
    await info.attach("fit-frames", { body: JSON.stringify(frames), contentType: "application/json" });
  });
}
