import { describe, expect, it, vi } from "vitest";

import {
  observeViewport, overlayStyle, readViewport, terminalBoxStyle,
  type VisualViewportLike, type WindowLike,
} from "../web/src/lib/visual-viewport";

const noop = (): void => undefined;

function viewport(over: Partial<VisualViewportLike> = {}): VisualViewportLike {
  return { height: 300, offsetTop: 12, addEventListener: noop, removeEventListener: noop, ...over };
}

const win = (visualViewport: WindowLike["visualViewport"], over: Partial<WindowLike> = {}): WindowLike => ({
  visualViewport, innerHeight: 800, addEventListener: noop, removeEventListener: noop, ...over,
});

describe("overlayStyle", () => {
  it("pins the overlay to the region the keyboard leaves visible", () => {
    expect(overlayStyle({ height: 420, offsetTop: 0, layoutHeight: 800 })).toEqual({ height: "420px", top: "0px" });
  });

  it("follows the viewport when iOS scrolls it to the focused element", () => {
    // Without `top` the overlay would start above the visible area and the cursor line stay hidden.
    expect(overlayStyle({ height: 420, offsetTop: 96, layoutHeight: 800 })).toEqual({ height: "420px", top: "96px" });
  });

  it("leaves the stylesheet in charge where the API is absent", () => {
    expect(overlayStyle(null)).toBeUndefined();
  });
});

describe("terminalBoxStyle", () => {
  it("grows the box by what the keyboard covers, so the terminal keeps its rows", () => {
    // Overlay 420 of an 800 layout: the clipping parent lost 380px, the box wins them back.
    expect(terminalBoxStyle({ height: 420, offsetTop: 0, layoutHeight: 800 })).toEqual({ height: "calc(100% + 380px)" });
  });

  it("adds nothing with the keyboard closed", () => {
    expect(terminalBoxStyle({ height: 800, offsetTop: 0, layoutHeight: 800 })).toEqual({ height: "calc(100% + 0px)" });
  });

  it("never shrinks the box when the visual viewport outgrows the layout one", () => {
    // Seen transiently on rotation, when visualViewport updates a frame before innerHeight.
    expect(terminalBoxStyle({ height: 900, offsetTop: 0, layoutHeight: 800 })).toEqual({ height: "calc(100% + 0px)" });
  });

  it("leaves the stylesheet in charge where the API is absent", () => {
    expect(terminalBoxStyle(null)).toBeUndefined();
  });
});

describe("readViewport", () => {
  it("reads height, offset and the layout height", () => {
    expect(readViewport(win(viewport()))).toEqual({ height: 300, offsetTop: 12, layoutHeight: 800 });
  });

  it("returns null without visualViewport, rather than throwing", () => {
    expect(readViewport(win(undefined))).toBeNull();
    expect(readViewport(win(null))).toBeNull();
  });
});

describe("observeViewport", () => {
  it("listens for resize AND scroll — a keyboard resizes, iOS then scrolls", () => {
    const add = vi.fn<(type: "resize" | "scroll", cb: () => void) => void>();
    const remove = vi.fn<(type: "resize" | "scroll", cb: () => void) => void>();
    const off = observeViewport(win(viewport({ addEventListener: add, removeEventListener: remove })), noop);

    expect(add.mock.calls.map((c) => c[0]).sort()).toEqual(["resize", "scroll"]);
    off();
    expect(remove.mock.calls.map((c) => c[0]).sort()).toEqual(["resize", "scroll"]);
  });

  it("listens for the window's resize too — a rotation changes the layout height", () => {
    const add = vi.fn<(type: "resize", cb: () => void) => void>();
    const remove = vi.fn<(type: "resize", cb: () => void) => void>();
    const off = observeViewport(win(viewport(), { addEventListener: add, removeEventListener: remove }), noop);

    expect(add.mock.calls.map((c) => c[0])).toEqual(["resize"]);
    off();
    expect(remove.mock.calls.map((c) => c[0])).toEqual(["resize"]);
  });

  it("is a safe no-op where the API is absent", () => {
    expect(() => { observeViewport(win(undefined), noop)(); }).not.toThrow();
  });
});
