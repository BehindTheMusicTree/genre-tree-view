import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { OverlayPanel } from "../OverlayPanel";

afterEach(() => {
  cleanup();
});

describe("OverlayPanel", () => {
  it("renders its title and content", () => {
    render(<OverlayPanel title="About" content={<p>Hello</p>} onClose={() => {}} />);
    expect(screen.getByText("About")).toBeTruthy();
    expect(screen.getByText("Hello")).toBeTruthy();
  });

  it("carries the overlay class that lets the host reserve room on the right", () => {
    const { container } = render(<OverlayPanel title="About" content="x" onClose={() => {}} />);
    expect(container.firstElementChild?.classList.contains("gtv-info-panel--overlay")).toBe(true);
  });

  it("calls onClose from the close button", () => {
    const onClose = vi.fn();
    render(<OverlayPanel title="About" content="x" onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on Escape", () => {
    const onClose = vi.fn();
    render(<OverlayPanel title="About" content="x" onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignores Escape owned elsewhere and other keys", () => {
    const onClose = vi.fn();
    render(<OverlayPanel title="About" content={<input aria-label="field" />} onClose={onClose} />);
    fireEvent.keyDown(screen.getByLabelText("field"), { key: "Escape" });
    fireEvent.keyDown(document, { key: "Enter" });
    expect(onClose).not.toHaveBeenCalled();
  });
});
