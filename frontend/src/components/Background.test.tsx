import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Background } from "./Background";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

afterEach(() => {
  vi.restoreAllMocks();
});

// The sprig canvas is fixed to the viewport behind every screen and the routed
// screens don't cover all of it, so the drift is meant to be visible app-wide.
// An earlier pass gated it to Home for battery; that just froze it everywhere
// else, in view. The only pauses left are ones the user can't see through.
describe("Background", () => {
  it("drives an animation loop while the tab is visible", async () => {
    const raf = vi.spyOn(window, "requestAnimationFrame");
    render(<Background />);
    await wait(80);
    // Many frames scheduled over ~80ms — the loop is running.
    expect(raf.mock.calls.length).toBeGreaterThan(1);
  });

  it("stops scheduling frames once the tab is hidden", async () => {
    const raf = vi.spyOn(window, "requestAnimationFrame");
    render(<Background />);
    await wait(80);
    expect(raf.mock.calls.length).toBeGreaterThan(1);

    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    document.dispatchEvent(new Event("visibilitychange"));
    await wait(40); // let the in-flight frame settle out
    const paused = raf.mock.calls.length;
    await wait(120);
    // Frame count is frozen — the loop has genuinely stopped, not just slowed.
    expect(raf.mock.calls.length).toBe(paused);
  });

  it("resumes the loop when the tab becomes visible again", async () => {
    const raf = vi.spyOn(window, "requestAnimationFrame");
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    render(<Background />);
    await wait(40);
    expect(raf).not.toHaveBeenCalled();

    hidden.mockReturnValue(false);
    document.dispatchEvent(new Event("visibilitychange"));
    await wait(80);
    expect(raf.mock.calls.length).toBeGreaterThan(1);
  });
});
