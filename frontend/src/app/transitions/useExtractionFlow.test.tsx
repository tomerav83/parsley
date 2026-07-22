// Regression coverage for the url-reset effect: it must clear the field when
// the browser's own back/forward buttons ("POP") land on Home, but leave it
// alone on our own push/replace navigations — those already set `url`
// themselves (backToSearch clears it, RecipeError's "Edit link" pre-fills
// it), and re-clearing on any arrival at "/" would stomp on the latter.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Outlet, RouterProvider, createMemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { useExtractionFlow } from "./useExtractionFlow.ts";

vi.mock("@/features/extract/recipeExtractor.ts", () => ({
  useRecipeExtractor: () => ({
    recipe: null,
    error: null,
    loading: false,
    pasteFailed: false,
    runUrl: vi.fn(),
    runPaste: vi.fn(),
    dismiss: vi.fn(),
    restore: vi.fn(),
  }),
}));

const STALE = "https://example.com/stale";

// Mirrors App: useExtractionFlow lives once in the layout route, not per-screen.
function Layout() {
  const flow = useExtractionFlow();
  return (
    <div>
      <input aria-label="url" value={flow.url} readOnly />
      <button onClick={() => flow.setUrl(STALE)}>seed</button>
      <Outlet />
    </div>
  );
}

function renderAt(initialEntries: string[], initialIndex?: number) {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        Component: Layout,
        children: [
          { index: true, Component: () => <p>home</p> },
          { path: "recipe", Component: () => <p>recipe</p> },
        ],
      },
    ],
    { initialEntries, initialIndex },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe("useExtractionFlow url reset on navigation", () => {
  it("clears url when browser back (POP) lands on Home", async () => {
    const router = renderAt(["/", "/recipe"], 1);
    await userEvent.click(screen.getByRole("button", { name: "seed" }));
    expect(screen.getByLabelText("url")).toHaveValue(STALE);

    router.navigate(-1); // simulates the browser's back button
    await waitFor(() => expect(screen.getByLabelText("url")).toHaveValue(""));
  });

  it("does not clear a url just set before our own push to Home", async () => {
    const router = renderAt(["/recipe"]);
    await userEvent.click(screen.getByRole("button", { name: "seed" }));

    router.navigate("/"); // mirrors RecipeError's "Edit link": setUrl then push
    await screen.findByText("home");
    // The POP-clearing effect (if it were unscoped) doesn't fire synchronously
    // with the route settling — give it a real window to (wrongly) fire before
    // asserting the value held, so this isn't a false-pass from checking early.
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(screen.getByLabelText("url")).toHaveValue(STALE);
  });
});
