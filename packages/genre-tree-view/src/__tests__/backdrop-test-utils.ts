import { afterEach, beforeEach, vi } from "vitest";

/** happy-dom does no layout, so the backdrop's pivot measurement and viewport size need stubs. Call
 * inside a describe: installs them per test and restores afterwards. Every element reports a
 * 100×100 box at the origin, i.e. the pivot sits at (0, 0) in an unscaled stage. */
export function stubBackdropLayout(viewport = { width: 800, height: 600 }) {
  const originals: Array<() => void> = [];
  beforeEach(() => {
    const proto = HTMLElement.prototype;
    const offsetWidth = Object.getOwnPropertyDescriptor(proto, "offsetWidth");
    const offsetParent = Object.getOwnPropertyDescriptor(proto, "offsetParent");
    Object.defineProperty(proto, "offsetWidth", { configurable: true, get: () => 100 });
    Object.defineProperty(proto, "offsetParent", {
      configurable: true,
      get(this: HTMLElement) {
        return this.parentElement;
      },
    });
    const rect = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue({ left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100, x: 0, y: 0, toJSON: () => ({}) });
    const original = global.ResizeObserver;
    global.ResizeObserver = vi.fn().mockImplementation(function (callback: ResizeObserverCallback) {
      callback([{ contentRect: viewport } as ResizeObserverEntry], {} as ResizeObserver);
      return { observe: vi.fn(), disconnect: vi.fn(), unobserve: vi.fn() };
    }) as unknown as typeof ResizeObserver;
    originals.push(() => {
      rect.mockRestore();
      global.ResizeObserver = original;
      if (offsetWidth) Object.defineProperty(proto, "offsetWidth", offsetWidth);
      else delete (proto as unknown as Record<string, unknown>).offsetWidth;
      if (offsetParent) Object.defineProperty(proto, "offsetParent", offsetParent);
      else delete (proto as unknown as Record<string, unknown>).offsetParent;
    });
  });
  afterEach(() => {
    originals.splice(0).forEach((restore) => restore());
  });
}
