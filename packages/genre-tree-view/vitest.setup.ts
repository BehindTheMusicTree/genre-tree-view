import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement ResizeObserver — usePanZoom observes the viewport element's size, so
// anything rendering it needs at least a no-op stand-in to avoid a ReferenceError.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = MockResizeObserver;

afterEach(() => {
  cleanup();
});
