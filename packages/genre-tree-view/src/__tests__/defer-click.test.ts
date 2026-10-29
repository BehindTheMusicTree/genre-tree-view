import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DOUBLE_CLICK_DELAY_MS } from "../constants";
import { createDeferredClick } from "../defer-click";

describe("createDeferredClick", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs the action once no second click follows", () => {
    const action = vi.fn();
    createDeferredClick().schedule(action);
    vi.advanceTimersByTime(DOUBLE_CLICK_DELAY_MS - 1);
    expect(action).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("runs onDouble instead for a second click on the same key, then skips the native dblclick", () => {
    const deferred = createDeferredClick();
    const action = vi.fn();
    const onDouble = vi.fn();
    deferred.schedule(action, onDouble, "a");
    deferred.schedule(action, onDouble, "a");
    expect(onDouble).toHaveBeenCalledTimes(1);
    deferred.doubleClick(onDouble);
    vi.advanceTimersByTime(DOUBLE_CLICK_DELAY_MS);
    expect(onDouble).toHaveBeenCalledTimes(1);
    expect(action).not.toHaveBeenCalled();
  });

  it("treats a second click on another key as a fresh click", () => {
    const deferred = createDeferredClick();
    const first = vi.fn();
    const second = vi.fn();
    const onDouble = vi.fn();
    deferred.schedule(first, onDouble, "a");
    deferred.schedule(second, onDouble, "b");
    vi.advanceTimersByTime(DOUBLE_CLICK_DELAY_MS);
    expect(onDouble).not.toHaveBeenCalled();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("runs a native dblclick's onDouble and cancels the pending click", () => {
    const deferred = createDeferredClick();
    const action = vi.fn();
    const onDouble = vi.fn();
    deferred.schedule(action);
    deferred.doubleClick(onDouble);
    vi.advanceTimersByTime(DOUBLE_CLICK_DELAY_MS);
    expect(onDouble).toHaveBeenCalledTimes(1);
    expect(action).not.toHaveBeenCalled();
  });
});
