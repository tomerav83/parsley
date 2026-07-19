// RecipeScreen no longer fetches — the route loader (recipeLoader) resolves the
// recipe before this renders, so the screen's whole job is to paint the loader's
// data. These tests drive it through a real memory router with a stub loader
// (exercising useLoaderData for real) and mock only useAppOutlet, whose sole use
// here is the back button's handler.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Recipe } from "@/lib/api.ts";
import type { AppOutletContext } from "@/app/router/useAppOutlet.ts";
import type { RecipeLoaderData } from "./recipeLoader.ts";
import { RecipeScreen } from "./RecipeScreen.tsx";

vi.mock("@/app/router/useAppOutlet.ts", () => ({
  useAppOutlet: vi.fn(),
}));

const { useAppOutlet } = await import("@/app/router/useAppOutlet.ts");
const mockedAppOutlet = vi.mocked(useAppOutlet);

afterEach(() => vi.clearAllMocks());

const RECIPE: Recipe = {
  name: "Toast",
  image: null,
  author: null,
  ingredients: ["bread"],
  steps: ["Toast the bread."],
  prep_time_minutes: null,
  cook_time_minutes: null,
  total_time_minutes: null,
  yields: null,
  source_url: "https://www.example.com/toast",
  site_name: null,
};

// Render RecipeScreen behind a loader that returns the given data, so
// useLoaderData resolves for real.
function renderWithLoaderData(
  data: RecipeLoaderData,
  outlet: Partial<AppOutletContext> = {},
) {
  mockedAppOutlet.mockReturnValue(outlet as AppOutletContext);
  const router = createMemoryRouter(
    [{ path: "/recipe", loader: () => data, Component: RecipeScreen }],
    { initialEntries: ["/recipe?url=https://www.example.com/toast"] },
  );
  render(<RouterProvider router={router} />);
}

describe("RecipeScreen", () => {
  it("renders the card from the loader's recipe", async () => {
    renderWithLoaderData({ recipe: RECIPE });
    expect(
      await screen.findByRole("heading", { name: "Toast" }),
    ).toBeInTheDocument();
  });

  it("labels the source with the bare host when the backend gave no site name", async () => {
    renderWithLoaderData({ recipe: RECIPE });
    // hostOf strips the leading www.
    expect(await screen.findByText("example.com")).toBeInTheDocument();
  });

  it("prefers the backend's site name over the host in the source bar", async () => {
    renderWithLoaderData({
      recipe: { ...RECIPE, site_name: "Example Kitchen" },
    });
    await screen.findByRole("heading", { name: "Toast" }); // wait for render
    // The bar shows the site name, so the bare host never appears (the card
    // byline also prints the site name, hence getAllByText, not a single match).
    expect(screen.getAllByText("Example Kitchen").length).toBeGreaterThan(0);
    expect(screen.queryByText("example.com")).not.toBeInTheDocument();
  });

  it("renders no card when the loader has no recipe (empty deep link)", async () => {
    renderWithLoaderData({ recipe: null });
    // the back button still mounts; only the card is absent
    expect(
      await screen.findByRole("button", { name: /new search/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });

  it("routes the back button through the outlet's backToSearch", async () => {
    const backToSearch = vi.fn();
    renderWithLoaderData({ recipe: RECIPE }, { backToSearch });
    await userEvent.click(
      await screen.findByRole("button", { name: /new search/i }),
    );
    expect(backToSearch).toHaveBeenCalledTimes(1);
  });
});
