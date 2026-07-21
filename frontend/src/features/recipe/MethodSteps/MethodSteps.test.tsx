import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { MethodSteps } from "./MethodSteps";

const STEPS = [
  "First, preheat the oven.",
  "Then roast for 18–20 minutes.",
  "Finally, serve straight from the pan.",
];

// Real Chromium's TouchEvent constructor (unlike jsdom) rejects plain objects —
// it needs actual Touch instances.
function touch(target: EventTarget, x: number, y: number) {
  return new Touch({ identifier: 0, target, clientX: x, clientY: y });
}

// MethodSteps is controlled; a tiny harness owns the index like RecipeSections does.
function Harness() {
  const [i, setI] = useState(0);
  return <MethodSteps steps={STEPS} index={i} onIndex={setI} />;
}

describe("MethodSteps", () => {
  it("keeps every step in the DOM but shows only the current one", () => {
    render(<Harness />);
    const items = screen.getAllByRole("listitem", { hidden: true });
    expect(items).toHaveLength(3);
    expect(items[0]).not.toHaveAttribute("hidden"); // current step visible
    expect(items[1]).toHaveAttribute("hidden");
    expect(items[2]).toHaveAttribute("hidden");
  });

  it("walks the steps with the Prev/Next buttons and clamps at the ends", async () => {
    render(<Harness />);
    const next = screen.getByRole("button", { name: /next step/i });
    const prev = screen.getByRole("button", { name: /previous step/i });

    expect(prev).toBeDisabled(); // clamped at the first step
    expect(screen.getByText(/preheat/)).toBeVisible();

    await userEvent.click(next);
    expect(screen.getByText(/roast/)).toBeVisible();
    expect(prev).not.toBeDisabled();

    await userEvent.click(next);
    expect(screen.getByText(/serve/)).toBeVisible();
    expect(next).toBeDisabled(); // clamped at the last step

    await userEvent.click(prev);
    expect(screen.getByText(/roast/)).toBeVisible();
  });

  it("walks the steps with ArrowRight/ArrowLeft while the widget is focused", async () => {
    render(<Harness />);
    screen.getByRole("group", { name: /method steps/i }).focus();

    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByText(/roast/)).toBeVisible();

    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByText(/preheat/)).toBeVisible();
  });

  it("ignores keys other than the arrows", async () => {
    render(<Harness />);
    screen.getByRole("group", { name: /method steps/i }).focus();

    await userEvent.keyboard("{Enter}");
    expect(screen.getByText(/preheat/)).toBeVisible();
  });

  it("surfaces a parsed cooking duration as a timer chip", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: /next step/i }));
    expect(screen.getByText("⏱ 18–20 minutes")).toBeVisible();
  });

  it("does not show a timer chip for a step with no duration", () => {
    render(
      <MethodSteps
        steps={["Finally, serve straight from the pan."]}
        index={0}
        onIndex={() => {}}
      />,
    );
    expect(screen.queryByText(/⏱/)).not.toBeInTheDocument();
  });

  it("walks to the next step on a leftward horizontal swipe, ignores vertical drags", () => {
    render(<Harness />);
    const group = screen.getByRole("group", { name: /method steps/i });

    fireEvent.touchStart(group, { touches: [touch(group, 200, 100)] });
    fireEvent.touchEnd(group, { changedTouches: [touch(group, 100, 100)] });
    expect(screen.getByText(/roast/)).toBeVisible();

    fireEvent.touchStart(group, { touches: [touch(group, 100, 100)] });
    fireEvent.touchEnd(group, { changedTouches: [touch(group, 100, 200)] });
    expect(screen.getByText(/roast/)).toBeVisible(); // vertical drag: no navigation
  });

  it("walks to the previous step on a rightward horizontal swipe", () => {
    render(<Harness />);
    const group = screen.getByRole("group", { name: /method steps/i });

    fireEvent.touchStart(group, { touches: [touch(group, 100, 100)] });
    fireEvent.touchEnd(group, { changedTouches: [touch(group, 200, 100)] });
    expect(screen.getByText(/preheat/)).toBeVisible(); // clamped: already first
  });

  it("ignores a touchend or touchmove with no matching touchstart", () => {
    render(<Harness />);
    const group = screen.getByRole("group", { name: /method steps/i });

    fireEvent.touchEnd(group, { changedTouches: [touch(group, 100, 100)] });
    expect(screen.getByText(/preheat/)).toBeVisible(); // no-op, not a crash

    const move = fireEvent.touchMove(group, {
      touches: [touch(group, 100, 100)],
    });
    expect(move).toBe(true); // nothing to compare against — never prevented
  });

  it("claims a horizontal drag via touchmove so the browser doesn't treat it as an unclaimed pan", () => {
    // Regression: without preventDefault() on the horizontal touchmove, Android
    // Chrome's gesture recognizer treats an unclaimed drag as an ambiguous pan
    // and swallows the *next* tap anywhere just to settle it — surfacing as
    // "swipe steps, then need to tap twice on whatever's tapped next."
    render(<Harness />);
    const group = screen.getByRole("group", { name: /method steps/i });

    fireEvent.touchStart(group, { touches: [touch(group, 200, 100)] });
    const horizontalMove = fireEvent.touchMove(group, {
      touches: [touch(group, 150, 102)],
    });
    expect(horizontalMove).toBe(false); // false === preventDefault() was called

    fireEvent.touchStart(group, { touches: [touch(group, 200, 100)] });
    const verticalMove = fireEvent.touchMove(group, {
      touches: [touch(group, 202, 150)],
    });
    expect(verticalMove).toBe(true); // vertical scroll stays native
  });

  it("opens the full step in a lightbox for an overflowing card, and closes on tap", async () => {
    // MethodSteps is `flex: 1 1 auto; min-height: 0` — it takes its height from
    // the pane around it. Rendered bare it has no constraint, so the card grows
    // to fit the text and never overflows (see MethodSteps.vrt.tsx for the same
    // fixed-height host).
    const longStep = "Roast for 18–20 minutes. ".repeat(40);
    render(
      <div style={{ display: "flex", flexDirection: "column", height: 320 }}>
        <MethodSteps steps={[longStep]} index={0} onIndex={() => {}} />
      </div>,
    );

    const openButton = await screen.findByRole("button", {
      name: /read the full step/i,
    });
    await userEvent.click(openButton);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("open");

    await userEvent.click(dialog);
    expect(dialog).not.toHaveAttribute("open");
  });

  it("does not let key or touch events inside the open lightbox reach the carousel behind it", async () => {
    const longStep = "Roast for 18–20 minutes. ".repeat(40);
    render(
      <div style={{ display: "flex", flexDirection: "column", height: 320 }}>
        <MethodSteps
          steps={[longStep, "Serve."]}
          index={0}
          onIndex={() => {}}
        />
      </div>,
    );

    await userEvent.click(
      await screen.findByRole("button", { name: /read the full step/i }),
    );
    const dialog = screen.getByRole("dialog");

    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    fireEvent.touchStart(dialog, { touches: [touch(dialog, 200, 100)] });
    fireEvent.touchEnd(dialog, { changedTouches: [touch(dialog, 100, 100)] });

    // still on step 1 — the carousel behind the dialog never saw these events.
    // (toBeInTheDocument, not toBeVisible: the open native dialog's top-layer
    // backdrop makes Playwright report covered elements as not visible.)
    expect(screen.getByText(/step 01 of 02/i)).toBeInTheDocument();
  });
});
