// @vitest-environment jsdom
//
// jsdom (already a devDependency) gives real window event dispatch so we can
// exercise the guard's predicate directly, no Chromium needed — same per-file
// override pattern as recipeCache.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ignoreSkippedViewTransitions } from "./viewTransitionGuard.ts";

// Fire an unhandledrejection-shaped event with the given reason and report
// whether the guard called preventDefault on it.
function dispatch(reason: unknown): boolean {
  const event = new Event("unhandledrejection", { cancelable: true });
  Object.defineProperty(event, "reason", { value: reason });
  const prevented = vi.spyOn(event, "preventDefault");
  window.dispatchEvent(event);
  return prevented.mock.calls.length > 0;
}

describe("ignoreSkippedViewTransitions", () => {
  beforeEach(() => ignoreSkippedViewTransitions());
  afterEach(() => vi.restoreAllMocks());

  it("swallows the skipped-transition AbortError", () => {
    const err = new Error("Transition was skipped");
    err.name = "AbortError";
    expect(dispatch(err)).toBe(true);
  });

  it("leaves other AbortErrors alone", () => {
    const err = new Error("user aborted the request");
    err.name = "AbortError";
    expect(dispatch(err)).toBe(false);
  });

  it("leaves unrelated rejections alone", () => {
    expect(dispatch(new Error("Transition was skipped"))).toBe(false); // wrong name
    expect(dispatch("just a string")).toBe(false);
  });
});
