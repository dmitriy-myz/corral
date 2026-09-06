import { useEffect, useState, type JSX } from "react";

import { ARROW_KEYS, arrowSequence, BAR_KEYS } from "../lib/key-bar";
import { readTerminalPrefs, writeTerminalPrefs } from "../lib/terminal-prefs";

interface Props {
  /** Sends one keystroke into the pane. Same channel as typed input. */
  readonly onKey: (seq: string) => void;
  /** DECCKM, read live from the terminal — arrows change spelling under it. */
  readonly applicationCursorKeys: () => boolean;
  /** Arms/disarms Ctrl for the next character typed on the soft keyboard. */
  readonly onCtrlArmedChange: (armed: boolean) => void;
  /** Cleared by the owner once a typed character consumed the modifier. */
  readonly ctrlArmed: boolean;
  /** Puts focus back on the terminal after a press — see `press` for why that is not automatic. */
  readonly refocus: () => void;
  /** Reads the clipboard and injects it. iOS offers no paste menu over the terminal — see the button. */
  readonly onPaste: () => void;
}

// touch-manipulation is load-bearing, not polish: without it a quick second tap is a double-tap
// gesture, and Safari answers that by zooming and dropping focus — which closes the keyboard mid-way
// through arrowing down a list. Declaring the element has no double-tap meaning removes the gesture
// (and the 300ms wait with it).
const BTN = "min-w-9 h-9 px-2 rounded border border-border bg-muted/60 text-foreground text-xs " +
  "font-mono leading-none flex items-center justify-center active:bg-muted select-none touch-manipulation";

/**
 * On-screen keys for touch devices. A phone's soft keyboard has no arrows, Esc, Tab or Ctrl, so every
 * TUI that asks a question with a list is unanswerable without this.
 *
 * Ctrl is STICKY rather than held: there is no chord on a touchscreen. Armed, it applies to the next
 * key from this bar or the next character from the soft keyboard, then clears itself — the owner
 * clears it for the typed case, which is why `ctrlArmed` is a prop and not local state.
 *
 * Collapsing is remembered per device, next to the scroll speed: the bar costs a row of a phone
 * screen, and someone reading long output wants that row back without losing it for good.
 *
 * Paste is here for the same reason the arrows are. iOS raises its paste callout over an editable or
 * selectable element, and the terminal is neither: xterm's helper textarea sits off-screen at
 * left:-9999em and `.xterm` is user-select:none, so a long press finds nothing to offer a menu for.
 * A button reading the clipboard itself is the only path that does not fight that layout.
 */
export function KeyBar({
  onKey, applicationCursorKeys, onCtrlArmedChange, ctrlArmed, refocus, onPaste,
}: Props): JSX.Element | null {
  // Pointer, not width: a tablet in landscape is wide and still has no arrow keys, and a narrow
  // desktop window has both. `matchMedia` is read in an effect so the first render is stable and a
  // device that changes pointer (a tablet gaining a keyboard) re-evaluates.
  const [coarse, setCoarse] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setHidden(readTerminalPrefs().keyBarHidden);
    // Feature-detected exactly like ThemeProvider does it: matchMedia is absent under jsdom, and a
    // bar that throws would take the whole modal down with it. Absent means "assume a real pointer" —
    // hiding the bar is the safe default, since a device with arrow keys loses nothing.
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(pointer: coarse)");
    const sync = (): void => { setCoarse(mq.matches); };
    sync();
    mq.addEventListener("change", sync);
    return () => { mq.removeEventListener("change", sync); };
  }, []);

  if (!coarse) return null;

  function setHiddenPref(next: boolean): void {
    setHidden(next);
    writeTerminalPrefs({ keyBarHidden: next });
    refocus();
  }

  function press(seq: string): void {
    onKey(seq);
    if (ctrlArmed) onCtrlArmedChange(false);
    // preventDefault on pointerdown keeps focus in the common case, but a rapid sequence of taps can
    // still lose it — a synthesized click, a cancelled gesture, Safari deciding the tap belongs to
    // the page. Asking for focus back after every press is the only thing that holds the keyboard
    // open through fast arrowing; it is a no-op when focus never left.
    refocus();
  }

  if (hidden) {
    // ABSOLUTE, so it occupies no height at all: the whole point of collapsing is to hand those rows
    // to the terminal, and a button left in the flex column would keep most of them. It floats over
    // the output in the corner instead, dimmed until touched, and the terminal's ResizeObserver
    // refits into the space the bar gave up.
    return (
      <button
        type="button"
        title="Show keys"
        aria-label="Show keys"
        aria-expanded={false}
        className="absolute bottom-1 right-1 z-10 h-7 w-7 rounded border border-border bg-card/70
          text-foreground text-xs leading-none flex items-center justify-center opacity-60
          active:opacity-100 select-none touch-manipulation"
        onPointerDown={(e) => { e.preventDefault(); setHiddenPref(false); }}
      >⌨</button>
    );
  }

  return (
    // shrink-0 so the bar never gets squeezed to nothing by the terminal's flex-1 above it.
    <div className="shrink-0 flex items-center gap-1 px-1 py-1 border-t border-border overflow-x-auto">
      {BAR_KEYS.map((k) => (
        <button
          key={k.id}
          type="button"
          title={k.title}
          aria-label={k.title}
          className={BTN}
          // onPointerDown, not onClick: the terminal's textarea must not lose focus, or the soft
          // keyboard closes on every tap. preventDefault keeps focus where it is.
          onPointerDown={(e) => { e.preventDefault(); press(k.seq); }}
        >{k.label}</button>
      ))}
      <button
        type="button"
        title="Ctrl (applies to the next key)"
        aria-label="Ctrl"
        aria-pressed={ctrlArmed}
        className={`${BTN} ${ctrlArmed ? "bg-primary text-primary-foreground border-primary" : ""}`}
        onPointerDown={(e) => { e.preventDefault(); onCtrlArmedChange(!ctrlArmed); refocus(); }}
      >ctrl</button>
      <button
        type="button"
        title="Paste"
        aria-label="Paste"
        className={BTN}
        onPointerDown={(e) => { e.preventDefault(); onPaste(); }}
      >paste</button>
      {ARROW_KEYS.map((a) => (
        <button
          key={a.id}
          type="button"
          title={a.title}
          aria-label={a.title}
          className={BTN}
          onPointerDown={(e) => {
            e.preventDefault();
            press(arrowSequence(a.id, { applicationCursorKeys: applicationCursorKeys(), ctrl: ctrlArmed }));
          }}
        >{a.label}</button>
      ))}
      <button
        type="button"
        title="Hide keys"
        aria-label="Hide keys"
        aria-expanded
        className={`${BTN} ml-auto`}
        onPointerDown={(e) => { e.preventDefault(); setHiddenPref(true); }}
      >▾</button>
    </div>
  );
}
