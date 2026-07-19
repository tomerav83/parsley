import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Recipe } from "@/lib/api";
import { TimingRow } from "./TimingRow";

const BASE: Recipe = {
  name: "Toast",
  source_url: "u",
  prep_time_minutes: null,
  cook_time_minutes: null,
  total_time_minutes: null,
  yields: null,
} as Recipe;

describe("TimingRow", () => {
  it("renders nothing when the recipe has no timings", () => {
    const { container } = render(<TimingRow recipe={BASE} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("formats minutes under an hour as plain minutes", () => {
    render(<TimingRow recipe={{ ...BASE, prep_time_minutes: 15 }} />);
    expect(screen.getByText("15m")).toBeInTheDocument();
  });

  it("formats an exact hour without a remainder", () => {
    render(<TimingRow recipe={{ ...BASE, cook_time_minutes: 60 }} />);
    expect(screen.getByText("1h")).toBeInTheDocument();
  });

  it("formats hours with a remainder", () => {
    render(<TimingRow recipe={{ ...BASE, total_time_minutes: 90 }} />);
    expect(screen.getByText("1h 30")).toBeInTheDocument();
  });

  it("renders the yield as-is and switches to the chips variant", () => {
    render(
      <TimingRow recipe={{ ...BASE, yields: "4 servings" }} variant="chips" />,
    );
    expect(screen.getByText("4 servings")).toBeInTheDocument();
    expect(screen.getByText("Yield")).toBeInTheDocument();
  });
});
