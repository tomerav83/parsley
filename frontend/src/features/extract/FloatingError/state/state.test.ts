import { describe, expect, it } from "vitest";

import { floatingErrorReducer, initFloatingError } from "./state.ts";

describe("FloatingError state reducer", () => {
  it("a fresh error starts collapsed; terminal starts opened", () => {
    expect(initFloatingError(false)).toMatchObject({
      open: false,
      retryFailed: false,
    });
    expect(initFloatingError(true)).toMatchObject({
      open: true,
      retryFailed: false,
    });
  });

  it("toggle flips the bubble open/closed", () => {
    const closed = initFloatingError(false);
    const opened = floatingErrorReducer(closed, { type: "toggle" });
    expect(opened.open).toBe(true);
    expect(floatingErrorReducer(opened, { type: "toggle" }).open).toBe(false);
  });

  it("retryStart marks a retry in flight", () => {
    const next = floatingErrorReducer(initFloatingError(false), {
      type: "retryStart",
    });
    expect(next.retrying).toBe(true);
  });

  it("retryFailed opens the bubble, clears in-flight, and records the failure", () => {
    const inFlight = floatingErrorReducer(initFloatingError(false), {
      type: "retryStart",
    });
    const next = floatingErrorReducer(inFlight, { type: "retryFailed" });
    expect(next.retrying).toBe(false);
    expect(next.retryFailed).toBe(true);
    expect(next.open).toBe(true);
  });

  it("flyAway is idempotent", () => {
    const leaving = floatingErrorReducer(initFloatingError(false), {
      type: "flyAway",
    });
    expect(leaving.leaving).toBe(true);
    expect(floatingErrorReducer(leaving, { type: "flyAway" })).toBe(leaving);
  });
});
