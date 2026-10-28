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

  it("hides its title and close button on request, and Escape still closes", () => {
    const onClose = vi.fn();
    render(<OverlayPanel title="Artist" content="x" onClose={onClose} hideTitle hideClose />);
    expect(screen.getByText("Artist").classList.contains("gtv-info-panel-title--hidden")).toBe(true);
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
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

  describe("expandable", () => {
    it("has no expand button without onExpandedChange", () => {
      render(<OverlayPanel title="About" content="x" onClose={() => {}} />);
      expect(screen.queryByRole("button", { name: /expand panel|collapse panel/i })).toBeNull();
    });

    it("sits in the compact left slot until expanded", () => {
      const props = { title: "Artist", content: "x", onClose: () => {}, onExpandedChange: () => {} };
      const { container, rerender } = render(<OverlayPanel {...props} />);
      const panel = container.firstElementChild;
      expect(panel?.classList.contains("gtv-info-panel--left")).toBe(true);
      expect(panel?.classList.contains("gtv-info-panel--overlay")).toBe(false);
      expect(panel?.classList.contains("gtv-info-panel--expanded")).toBe(false);
      rerender(<OverlayPanel {...props} expanded />);
      expect(panel?.classList.contains("gtv-info-panel--expanded")).toBe(true);
      expect(panel?.classList.contains("gtv-info-panel--expanded-solo")).toBe(true);
    });

    it("toggles via Expand panel / Collapse panel", () => {
      const onExpandedChange = vi.fn();
      const props = { title: "Artist", content: "x", onClose: () => {}, onExpandedChange };
      const { rerender } = render(<OverlayPanel {...props} />);
      fireEvent.click(screen.getByRole("button", { name: "Expand panel" }));
      expect(onExpandedChange).toHaveBeenLastCalledWith(true);
      rerender(<OverlayPanel {...props} expanded />);
      fireEvent.click(screen.getByRole("button", { name: "Collapse panel" }));
      expect(onExpandedChange).toHaveBeenLastCalledWith(false);
    });

    it("drops the expand button with hideExpandButton", () => {
      render(<OverlayPanel title="Artist" content="x" onClose={() => {}} onExpandedChange={() => {}} hideExpandButton />);
      expect(screen.queryByRole("button", { name: /expand panel|collapse panel/i })).toBeNull();
    });

    it("collapses on Escape while expanded, closes on Escape while compact", () => {
      const onClose = vi.fn();
      const onExpandedChange = vi.fn();
      const props = { title: "Artist", content: "x", onClose, onExpandedChange };
      const { rerender } = render(<OverlayPanel {...props} expanded />);
      fireEvent.keyDown(document, { key: "Escape" });
      expect(onExpandedChange).toHaveBeenCalledWith(false);
      expect(onClose).not.toHaveBeenCalled();
      rerender(<OverlayPanel {...props} />);
      fireEvent.keyDown(document, { key: "Escape" });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("renders extraContent and drops the solo layout when expanded", () => {
      const { container } = render(
        <OverlayPanel title="Artist" content="main" extraContent={<p>Discography</p>} onClose={() => {}} onExpandedChange={() => {}} expanded />,
      );
      expect(screen.getByText("Discography")).toBeTruthy();
      expect(container.firstElementChild?.classList.contains("gtv-info-panel--expanded-solo")).toBe(false);
    });

    it("is inert and slid away when collapsed", () => {
      const { container } = render(<OverlayPanel title="Artist" content="x" onClose={() => {}} onExpandedChange={() => {}} collapsed />);
      const panel = container.firstElementChild;
      expect(panel?.classList.contains("gtv-info-panel--collapsed")).toBe(true);
      expect(panel?.hasAttribute("inert")).toBe(true);
    });
  });
});
