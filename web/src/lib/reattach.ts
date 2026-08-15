// When a backgrounded tab comes back, decide whether its attach needs re-establishing.
//
// WHY THIS IS NEEDED: iOS Safari freezes a backgrounded tab — no JS, no timers, nothing servicing the
// socket. Meanwhile the server's ping/pong heartbeat (server/pty-bridge.ts, WS_HEARTBEAT_MS = 30 s)
// finds the previous ping unanswered on the next tick and calls ws.terminate(), which destroys the TCP
// socket without a close frame. The client sees code 1006 with an empty reason, which closeMessage
// renders through its fallback as "connection closed". So anything over ~30–60 s in the background
// comes back dead, and the reap is deliberate: a frozen browser must not hold the herdr --takeover
// input lock or one of the WS_MAX_CONCURRENT slots.
//
// Nothing recovered from that. shouldRetryAttach (lib/attach.ts) covers only the post-spawn boot race
// — code 4001, inside the awaitAgent window — so a heartbeat reap was never retried, and the modal sat
// on the banner until the operator closed and reopened it.
//
// Deliberately NOT paired with a close-on-hide: tearing the socket down every time the tab blurs would
// churn `herdr --takeover` on a two-second glance at another tab, and buys only the 30–60 s before the
// server reaps it anyway.

/** The socket's `readyState`, as the four names rather than the numbers, so this stays DOM-free. */
export type SocketState = "connecting" | "open" | "closing" | "closed";

/** Maps a WebSocket.readyState to SocketState. Unknown values read as "closed" — the safe direction. */
export function socketState(readyState: number): SocketState {
  if (readyState === 0) return "connecting";
  if (readyState === 1) return "open";
  if (readyState === 2) return "closing";
  return "closed";
}

/**
 * Whether becoming visible should start a fresh attach.
 *
 * Three gates, each load-bearing:
 *  - `visible`: the event fires on both transitions, and re-attaching on the way OUT is pointless work
 *    that the freeze would interrupt anyway.
 *  - a socket still `open` (short trip, no reap yet) or `connecting` (an attach already in flight, e.g.
 *    the boot-race retry) is left alone — reconnecting either one would abandon a working link and burn
 *    a concurrency slot.
 *  - `closeCode === 1000` means the pty exited: the session is over and there is nothing on the other
 *    end to attach to. Every other code is worth one attempt, including the failures — the operator
 *    coming back to the tab is as good a moment to retry as any, and the trigger is an event, not a
 *    loop, so a repeated failure cannot spin.
 */
export function shouldReattachOnVisible(s: {
  readonly visible: boolean;
  readonly socket: SocketState;
  readonly closeCode: number | null;
}): boolean {
  if (!s.visible) return false;
  if (s.socket === "open" || s.socket === "connecting") return false;
  return s.closeCode !== 1000;
}
