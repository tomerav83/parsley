import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Background } from "./Background";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

afterEach(() => {
  vi.restoreAllMocks();
});

// F1: the sprig canvas is mounted at the app root and never unmounts, so before
// this fix it drove requestAnimationFrame on every screen — including while a
// recipe is read. It should animate only when it's actually on screen (active).
describe("Background (F1 — pause off-home)", () => {
  it("drives an animation loop while active", async () => {
    const raf = vi.spyOn(window, "requestAnimationFrame");
    render(<Background active />);
    await wait(80);
    // Many frames scheduled over ~80ms — the loop is running.
    expect(raf.mock.calls.length).toBeGreaterThan(1);
  });

  it("never starts the loop when mounted inactive", async () => {
    const raf = vi.spyOn(window, "requestAnimationFrame");
    render(<Background active={false} />);
    await wait(80);
    // No frames of its own — nothing to draw off-home.
    expect(raf).not.toHaveBeenCalled();
  });

  it("stops scheduling frames once it goes inactive", async () => {
    const raf = vi.spyOn(window, "requestAnimationFrame");
    const { rerender } = render(<Background active />);
    await wait(80);
    expect(raf.mock.calls.length).toBeGreaterThan(1);

    rerender(<Background active={false} />);
    await wait(40); // let the in-flight frame settle out
    const paused = raf.mock.calls.length;
    await wait(120);
    // Frame count is frozen — the loop has genuinely stopped, not just slowed.
    expect(raf.mock.calls.length).toBe(paused);
  });

  it("resumes the loop when it becomes active again", async () => {
    const raf = vi.spyOn(window, "requestAnimationFrame");
    const { rerender } = render(<Background active={false} />);
    await wait(40);
    expect(raf).not.toHaveBeenCalled();

    rerender(<Background active />);
    await wait(80);
    expect(raf.mock.calls.length).toBeGreaterThan(1);
  });
});
