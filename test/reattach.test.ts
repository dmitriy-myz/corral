import { describe, expect, it } from "vitest";

import { shouldReattachOnVisible, socketState } from "../web/src/lib/reattach";

describe("socketState", () => {
  it("names the four WebSocket.readyState values", () => {
    expect(socketState(0)).toBe("connecting");
    expect(socketState(1)).toBe("open");
    expect(socketState(2)).toBe("closing");
    expect(socketState(3)).toBe("closed");
  });

  it("reads anything unexpected as closed — the direction that reconnects rather than gives up", () => {
    expect(socketState(-1)).toBe("closed");
    expect(socketState(99)).toBe("closed");
  });
});

describe("shouldReattachOnVisible", () => {
  // The case this exists for: iOS froze the tab, the server's heartbeat reaped the socket as half-open
  // and terminate()d it, so the client holds a 1006 with no reason.
  const REAPED = { visible: true, socket: "closed", closeCode: 1006 } as const;

  it("re-attaches after a heartbeat reap", () => {
    expect(shouldReattachOnVisible(REAPED)).toBe(true);
  });

  it("does nothing on the way out — visibilitychange fires on both transitions", () => {
    expect(shouldReattachOnVisible({ ...REAPED, visible: false })).toBe(false);
  });

  it("leaves a surviving socket alone (short trip, reaped by nobody)", () => {
    expect(shouldReattachOnVisible({ ...REAPED, socket: "open", closeCode: null })).toBe(false);
  });

  it("leaves an attach already in flight alone — e.g. the boot-race retry", () => {
    expect(shouldReattachOnVisible({ ...REAPED, socket: "connecting", closeCode: null })).toBe(false);
  });

  it("re-attaches while a dying socket is still closing", () => {
    expect(shouldReattachOnVisible({ ...REAPED, socket: "closing" })).toBe(true);
  });

  it("does NOT re-attach after a normal exit — the pty is gone, there is nothing to attach to", () => {
    expect(shouldReattachOnVisible({ ...REAPED, closeCode: 1000 })).toBe(false);
  });

  it("re-attaches after a failure the operator may have returned to retry", () => {
    for (const code of [4000, 4001, 1013, 1009]) {
      expect(shouldReattachOnVisible({ ...REAPED, closeCode: code })).toBe(true);
    }
  });

  it("re-attaches when the socket died before any close was recorded", () => {
    expect(shouldReattachOnVisible({ ...REAPED, closeCode: null })).toBe(true);
  });
});
