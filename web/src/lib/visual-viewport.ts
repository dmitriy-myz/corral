// The soft keyboard is invisible to CSS. `dvh` tracks the browser's own chrome, so `h-[100dvh]` still
// measures the full screen once a keyboard covers the bottom third of it — the cursor line and the
// on-screen key bar end up underneath it. Only `window.visualViewport` reports the region that is
// actually visible, and only as a JS event.

export interface Viewport {
  readonly height: number;
  readonly offsetTop: number;
  /** `window.innerHeight` as read: stable under a keyboard on Safari and Chrome, shrunk by it on Firefox iOS. */
  readonly innerHeight: number;
  /** The height the terminal is laid out for; `innerHeight`, or a frozen earlier value while a keyboard may be up. */
  readonly layoutHeight: number;
}

// Structural, not `Window`: the repo bans type assertions, so a test needs to be able to hand these
// functions a plain object. The real `window` satisfies it as-is.
export interface VisualViewportLike {
  readonly height: number;
  readonly offsetTop: number;
  addEventListener: (type: "resize" | "scroll", cb: () => void) => void;
  removeEventListener: (type: "resize" | "scroll", cb: () => void) => void;
}

// Required key, union with undefined rather than `?:` — under exactOptionalPropertyTypes an optional
// property refuses an explicit `undefined`, which is exactly what a test for "no API here" passes.
export interface WindowLike {
  readonly visualViewport: VisualViewportLike | null | undefined;
  readonly innerHeight: number;
  addEventListener: (type: "resize", cb: () => void) => void;
  removeEventListener: (type: "resize", cb: () => void) => void;
}

/**
 * Inline overrides pinning a `fixed inset-0` overlay to the visible region, or undefined to leave the
 * stylesheet in charge (no visualViewport — every desktop browser predating it, and jsdom).
 *
 * `top` matters as much as `height`: iOS scrolls the visual viewport to keep the focused element in
 * view, and an overlay left at 0 would then start above the visible area. Both are set, so `bottom`
 * from `inset-0` is over-constrained and the browser drops it — which is what we want.
 */
export function overlayStyle(vp: Viewport | null): { height: string; top: string; paddingBottom: string } | undefined {
  if (vp === null) return undefined;
  // Padding reaches the layout viewport's bottom: Firefox iOS floats its keyboard accessory keys over
  // that strip, and without it the page shows through under them. Under Safari's keyboard it is unseen.
  const below = Math.max(0, vp.innerHeight - vp.offsetTop - vp.height);
  return { height: `${String(vp.height + below)}px`, top: `${String(vp.offsetTop)}px`, paddingBottom: `${String(below)}px` };
}

export interface LayoutMemo {
  readonly width: number;
  readonly height: number;
}

/** The layout height to size the terminal for: held at its pre-keyboard value while `frozen`, until the width changes. */
export function stableLayoutHeight(prev: LayoutMemo | null, width: number, innerHeight: number, frozen: boolean): number {
  if (!frozen || prev?.width !== width) return innerHeight;
  return Math.max(prev.height, innerHeight);
}

/** Height of the bottom-anchored terminal box: grown by what the keyboard covers, so the pty keeps its rows. */
export function terminalBoxStyle(vp: Viewport | null): { height: string } | undefined {
  if (vp === null) return undefined;
  const occluded = Math.max(0, vp.layoutHeight - vp.height);
  return { height: `calc(100% + ${String(occluded)}px)` };
}

/** Reads the current visual viewport, or null where the API is absent. */
export function readViewport(w: WindowLike): Viewport | null {
  const vv = w.visualViewport;
  if (vv === null || vv === undefined) return null;
  return { height: vv.height, offsetTop: vv.offsetTop, innerHeight: w.innerHeight, layoutHeight: w.innerHeight };
}

/** Subscribes to every event that can change the visible region. Returns an unsubscribe. */
export function observeViewport(w: WindowLike, onChange: () => void): () => void {
  const vv = w.visualViewport;
  if (vv === null || vv === undefined) return () => undefined;
  // `scroll` as well as `resize`: opening a keyboard resizes, but iOS scrolling the viewport to the
  // focused input only fires scroll, and that moves offsetTop.
  vv.addEventListener("resize", onChange);
  vv.addEventListener("scroll", onChange);
  w.addEventListener("resize", onChange); // a rotation changes innerHeight, which the layout height follows
  return () => {
    vv.removeEventListener("resize", onChange);
    vv.removeEventListener("scroll", onChange);
    w.removeEventListener("resize", onChange);
  };
}
