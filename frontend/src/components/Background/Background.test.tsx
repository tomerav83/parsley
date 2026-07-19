import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Background } from "./Background.tsx";

// Decoration only: hidden from assistive tech, and the rise animation really
// attached — a broken CSS-module import would leave animationName "none" and a
// frozen, empty-looking background.
describe("Background", () => {
  it("renders an animated, aria-hidden sprig field", () => {
    const { container } = render(<Background />);
    const bg = container.firstElementChild!;
    expect(bg).toHaveAttribute("aria-hidden", "true");
    expect(bg.childElementCount).toBeGreaterThan(0);

    const sprig = bg.firstElementChild!;
    expect(getComputedStyle(sprig).animationName).not.toBe("none");
  });
});
