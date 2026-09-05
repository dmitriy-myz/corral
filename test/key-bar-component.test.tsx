// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { KeyBar } from "../web/src/components/KeyBar";

// jsdom ships no matchMedia. Stub it per test so both pointer kinds are reachable.
function stubPointer(coarse: boolean): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: coarse && query.includes("coarse"),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function renderBar(opts: { coarse: boolean; ctrlArmed?: boolean }) {
  stubPointer(opts.coarse);
  const onKey = vi.fn();
  const onCtrlArmedChange = vi.fn();
  render(
    <KeyBar
      onKey={onKey}
      applicationCursorKeys={() => false}
      onCtrlArmedChange={onCtrlArmedChange}
      ctrlArmed={opts.ctrlArmed ?? false}
    />,
  );
  return { onKey, onCtrlArmedChange };
}

describe("KeyBar", () => {
  it("stays out of the way on a device that has real keys", () => {
    renderBar({ coarse: false });
    expect(screen.queryByLabelText("Up arrow")).toBeNull();
  });

  it("offers exactly the keys a soft keyboard lacks", () => {
    renderBar({ coarse: true });
    for (const name of ["Escape", "Tab", "Ctrl", "Left arrow", "Down arrow", "Up arrow", "Right arrow"]) {
      expect(screen.getByLabelText(name)).toBeTruthy();
    }
  });

  it("sends the arrow that unblocks a select prompt", () => {
    const { onKey } = renderBar({ coarse: true });
    fireEvent.pointerDown(screen.getByLabelText("Down arrow"));
    expect(onKey).toHaveBeenCalledWith("\x1b[B");
  });

  it("sends Escape and Tab verbatim", () => {
    const { onKey } = renderBar({ coarse: true });
    fireEvent.pointerDown(screen.getByLabelText("Escape"));
    fireEvent.pointerDown(screen.getByLabelText("Tab"));
    expect(onKey).toHaveBeenNthCalledWith(1, "\x1b");
    expect(onKey).toHaveBeenNthCalledWith(2, "\t");
  });

  it("arms Ctrl rather than sending anything", () => {
    const { onKey, onCtrlArmedChange } = renderBar({ coarse: true });
    fireEvent.pointerDown(screen.getByLabelText("Ctrl"));
    expect(onCtrlArmedChange).toHaveBeenCalledWith(true);
    expect(onKey).not.toHaveBeenCalled();
  });

  it("applies an armed Ctrl to the next arrow and then releases it", () => {
    const { onKey, onCtrlArmedChange } = renderBar({ coarse: true, ctrlArmed: true });
    fireEvent.pointerDown(screen.getByLabelText("Right arrow"));
    expect(onKey).toHaveBeenCalledWith("\x1b[1;5C");
    expect(onCtrlArmedChange).toHaveBeenCalledWith(false);
  });

  it("shows the armed state, so the modifier is never invisibly stuck", () => {
    renderBar({ coarse: true, ctrlArmed: true });
    expect(screen.getByLabelText("Ctrl").getAttribute("aria-pressed")).toBe("true");
  });
});
