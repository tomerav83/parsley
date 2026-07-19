import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useFitText } from "./useFitText.ts";

const BASE = 15.5;
const LONG = "word ".repeat(200);
const SHORT = "One line.";

// A <p> with a fixed height that the hook fits text into. overflow:hidden so
// scrollHeight can exceed clientHeight (that's the signal the hook shrinks on).
function Fit({
  text,
  height,
  hidden,
}: {
  text: string;
  height: number;
  hidden?: boolean;
}) {
  const ref = useFitText(text, BASE);
  return (
    <p
      ref={ref}
      data-testid="p"
      hidden={hidden}
      style={{
        height: `${height}px`,
        lineHeight: 1.5,
        overflow: "hidden",
        margin: 0,
      }}
    >
      {text}
    </p>
  );
}

const fontSize = () =>
  parseFloat(screen.getByTestId("p").style.fontSize) || null;

describe("useFitText", () => {
  it("shrinks long text below the base size to fit a short card", async () => {
    render(<Fit text={LONG} height={40} />);
    await vi.waitFor(() => expect(fontSize()).toBeLessThan(BASE));
  });

  it("leaves short text at the base size", async () => {
    render(<Fit text={SHORT} height={200} />);
    await vi.waitFor(() => expect(fontSize()).toBe(BASE));
  });

  it("leaves a hidden element (height 0) alone", async () => {
    render(<Fit text={LONG} height={40} hidden />);
    // hidden → clientHeight 0 → no shrink loop; base is never lowered.
    await vi.waitFor(() => expect(fontSize()).toBe(BASE));
  });
});
