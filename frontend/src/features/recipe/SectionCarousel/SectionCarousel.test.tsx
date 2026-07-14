import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { SectionCarousel, type CarouselSection } from "./SectionCarousel";

const sections: CarouselSection[] = [
  {
    key: "ingredients",
    label: "Ingredients",
    badge: "1 item",
    content: <p>ing</p>,
  },
  { key: "method", label: "Method", badge: "1 step", content: <p>method</p> },
];

describe("SectionCarousel arrow-key gating", () => {
  it("switches sections with Arrow keys when on-screen", async () => {
    render(<SectionCarousel sections={sections} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");

    await userEvent.keyboard("{ArrowRight}");
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");

    await userEvent.keyboard("{ArrowLeft}");
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
  });

  // Regression: off-screen screens are hidden with `inert` (no aria-hidden
  // attribute), so the global arrow-key listener used to stay live on Home while
  // a recipe was still mounted behind it. It must now bail inside an inert tree.
  it("ignores Arrow keys when inside an inert (off-screen) subtree", async () => {
    render(
      <div inert>
        <SectionCarousel sections={sections} />
      </div>,
    );
    const tabs = screen.getAllByRole("tab");
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");

    await userEvent.keyboard("{ArrowRight}");
    // still on the first section — the off-screen carousel didn't grab the key
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
  });
});
