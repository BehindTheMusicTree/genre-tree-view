import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useFocusHistory } from "../use-focus-history";

const always = () => true;

function setup(initial: string | null, isFocusable: (id: string) => boolean = always) {
  return renderHook(({ focus, ok }) => useFocusHistory(focus, ok), { initialProps: { focus: initial, ok: isFocusable } });
}

describe("useFocusHistory", () => {
  it("has no previous initially and for an unchanged id", () => {
    const { result, rerender } = setup("a");
    expect(result.current.previous).toBeUndefined();
    rerender({ focus: "a", ok: always });
    expect(result.current.previous).toBeUndefined();
  });

  it("pushes the old focus on every observed change, whoever caused it", () => {
    const { result, rerender } = setup(null);
    rerender({ focus: "a", ok: always });
    expect(result.current.previous).toBeNull();
    rerender({ focus: "b", ok: always });
    expect(result.current.previous).toBe("a");
  });

  it("pops back through the requested previous and walks back on chained requests", () => {
    const { result, rerender } = setup(null);
    rerender({ focus: "a", ok: always });
    rerender({ focus: "b", ok: always });
    act(() => result.current.markPreviousRequested("a"));
    rerender({ focus: "a", ok: always });
    expect(result.current.previous).toBeNull();
    act(() => result.current.markPreviousRequested(null));
    rerender({ focus: null, ok: always });
    expect(result.current.previous).toBeUndefined();
  });

  it("offers null as previous after going to the root view", () => {
    const { result, rerender } = setup("a");
    rerender({ focus: null, ok: always });
    expect(result.current.previous).toBe("a");
    rerender({ focus: "a", ok: always });
    expect(result.current.previous).toBeNull();
  });

  it("skips entries that are no longer focusable", () => {
    const { result, rerender } = setup(null);
    rerender({ focus: "a", ok: always });
    rerender({ focus: "b", ok: always });
    rerender({ focus: "c", ok: always });
    rerender({ focus: "c", ok: (id) => id !== "b" });
    expect(result.current.previous).toBe("a");
  });

  it("treats a requested previous that differs from the next focus as a normal change", () => {
    const { result, rerender } = setup("a");
    rerender({ focus: "b", ok: always });
    act(() => result.current.markPreviousRequested("a"));
    rerender({ focus: "c", ok: always });
    expect(result.current.previous).toBe("b");
  });
});
