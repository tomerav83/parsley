import { describe, expect, it } from "vitest";

import {
  floatingErrorReducer,
  initFloatingError,
  type RetryInfo,
} from "./state.ts";

const paste: RetryInfo = { unexpected: true, canPaste: true, canEdit: false };
const dead: RetryInfo = { unexpected: true, canPaste: false, canEdit: false };
const rateLimited: RetryInfo = {
  unexpected: false,
  canPaste: false,
  canEdit: false,
};

describe("FloatingError state reducer", () => {
  it("a fresh error starts collapsed; terminal starts opened + failed", () => {
    expect(initFloatingError(false)).toMatchObject({
      open: false,
      failed: false,
    });
    expect(initFloatingError(true)).toMatchObject({ open: true, failed: true });
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

  it("a failed retry keeps paste offered and spends the retry (not failed)", () => {
    const next = floatingErrorReducer(initFloatingError(false), {
      type: "errorChanged",
      terminal: false,
      didRetry: true,
      retryInfo: paste,
    });
    expect(next.open).toBe(true);
    expect(next.retrying).toBe(false);
    expect(next.failed).toBe(false); // paste can still take over
    expect(next.retryUsed).toBe(true);
  });

  it("a failed retry with no fallback collapses to report-only", () => {
    const next = floatingErrorReducer(initFloatingError(false), {
      type: "errorChanged",
      terminal: false,
      didRetry: true,
      retryInfo: dead,
    });
    expect(next.failed).toBe(true);
    expect(next.retryUsed).toBe(false); // nothing else to fall back to
  });

  it("a failed retry on a repeatable-only error keeps retry available", () => {
    const next = floatingErrorReducer(initFloatingError(false), {
      type: "errorChanged",
      terminal: false,
      didRetry: true,
      retryInfo: rateLimited,
    });
    expect(next.failed).toBe(false);
    expect(next.retryUsed).toBe(false); // retry stays as the sole action
  });

  it("a fresh errorChanged resets to the collapsed corner sprite", () => {
    const messy = { ...initFloatingError(true), retryUsed: true };
    const next = floatingErrorReducer(messy, {
      type: "errorChanged",
      terminal: false,
      didRetry: false,
      retryInfo: paste,
    });
    expect(next).toMatchObject({
      open: false,
      failed: false,
      retryUsed: false,
    });
  });

  it("flyAway is idempotent", () => {
    const leaving = floatingErrorReducer(initFloatingError(false), {
      type: "flyAway",
    });
    expect(leaving.leaving).toBe(true);
    expect(floatingErrorReducer(leaving, { type: "flyAway" })).toBe(leaving);
  });
});
