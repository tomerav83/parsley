import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Background } from "./Background.tsx";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

afterEach(() => {
  vi.restoreAllMocks();
});

// The sprig canvas is fixed to the viewport behind every screen and the routed
// screens don't cover all of it, so the drift is meant to be visible app-wide.
// Hidden-tab pausing is the browser's job (rAF suspends there natively), so the
// only check here is that the loop actually runs.
describe("Background", () => {
  it("drives an animation loop", async () => {
    const raf = vi.spyOn(window, "requestAnimationFrame");
    render(<Background />);
    await wait(80);
    // Many frames scheduled over ~80ms — the loop is running.
    expect(raf.mock.calls.length).toBeGreaterThan(1);
  });
});
