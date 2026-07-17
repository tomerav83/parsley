// Exercises App as the layout route it is: real HomeScreen/PasteScreen (so
// submitting goes through the actual UrlForm/PasteHtmlForm and FloatingError,
// queried by role) inside a memory router. RecipeScreen is stubbed — its own
// deep-link/cache logic has its own test file — this one only needs to prove
// App navigated there and handed off the right outlet context.
//
// Mocked at the @/lib/api.ts boundary, same as recipeExtractor.test.tsx: App's
// job under test is its own nav/cache/focus orchestration, not the extraction
// request lifecycle (already covered there) or api.ts's response parsing
// (already covered in api.test.ts).
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createMemoryRouter,
  RouterProvider,
  useSearchParams,
} from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ExtractError, type Recipe } from "@/lib/api.ts";
import { appOutlet } from "@/app/router/appOutlet.ts";
import App from "./App.tsx";
import { HomeScreen } from "./screens/HomeScreen/HomeScreen.tsx";
import { PasteScreen } from "./screens/PasteScreen/PasteScreen.tsx";

vi.mock("@/lib/api.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api.ts")>();
  return {
    ...actual,
    extractRecipe: vi.fn(),
    extractRecipeFromHtml: vi.fn(),
  };
});

const { extractRecipe, extractRecipeFromHtml } = await import("@/lib/api.ts");
const mockedExtractRecipe = vi.mocked(extractRecipe);
const mockedExtractRecipeFromHtml = vi.mocked(extractRecipeFromHtml);

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
  source_url: "https://example.com/toast",
  site_name: null,
};

function StubRecipeScreen() {
  const { extract } = appOutlet();
  const [params] = useSearchParams();
  return (
    <div>
      <h1 data-route-heading tabIndex={-1}>
        Recipe: {extract.recipe?.name}
      </h1>
      <p data-testid="recipe-url">{params.get("url")}</p>
    </div>
  );
}

function renderApp() {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        Component: App,
        children: [
          { index: true, Component: HomeScreen },
          { path: "paste", Component: PasteScreen },
          { path: "recipe", Component: StubRecipeScreen },
        ],
      },
    ],
    { initialEntries: ["/"] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

async function submitUrl(url: string) {
  await userEvent.type(
    screen.getByRole("textbox", { name: /recipe url/i }),
    url,
  );
  await userEvent.click(screen.getByRole("button", { name: /^extract$/i }));
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("App — submit outcome drives navigation", () => {
  it("navigates to /recipe and caches the recipe only when the submit succeeds", async () => {
    mockedExtractRecipe.mockResolvedValueOnce(RECIPE);
    renderApp();

    await submitUrl(RECIPE.source_url);

    const heading = await screen.findByRole("heading", {
      name: /recipe: toast/i,
    });
    expect(screen.getByTestId("recipe-url")).toHaveTextContent(
      RECIPE.source_url,
    );
    // Moved by App on this navigation — contrast the initial-load test below.
    expect(heading).toHaveFocus();

    const cached = JSON.parse(
      sessionStorage.getItem("parsley:recipes") ?? "{}",
    );
    expect(cached[RECIPE.source_url]).toMatchObject({ name: "Toast" });
  });

  it("does not navigate when the submit fails, and surfaces the floating error", async () => {
    mockedExtractRecipe.mockRejectedValueOnce(
      new ExtractError("fetch_failed", "no answer"),
    );
    const router = renderApp();

    await submitUrl(RECIPE.source_url);

    // Assert on the router's own location, not just DOM presence — a
    // navigation that fires and is then raced away by a later assertion would
    // otherwise slip through a purely DOM-timing-based check.
    await screen.findByRole("button", { name: /show options/i });
    expect(router.state.location.pathname).toBe("/");
    expect(screen.queryByTestId("recipe-url")).toBeNull();
    expect(sessionStorage.getItem("parsley:recipes")).toBeNull();
  });

  it("does not steal focus on the initial load", () => {
    renderApp();
    expect(document.activeElement).toBe(document.body);
  });
});

describe("App — error recovery wiring", () => {
  it("dismissing the error returns focus to the URL field", async () => {
    mockedExtractRecipe.mockRejectedValueOnce(
      new ExtractError("network", "down"),
    );
    renderApp();
    const input = screen.getByRole("textbox", { name: /recipe url/i });
    await submitUrl(RECIPE.source_url);

    await userEvent.click(
      screen.getByRole("button", { name: /show options/i }),
    );
    const dialog = screen.getByRole("alertdialog");
    await userEvent.keyboard("{Escape}");
    await vi.waitFor(() => expect(dialog).not.toBeInTheDocument());

    expect(input).toHaveFocus();
  });

  it("retry re-submits the last URL and navigates to /recipe on a successful retry", async () => {
    mockedExtractRecipe.mockRejectedValueOnce(
      new ExtractError("fetch_failed", "no answer"),
    );
    renderApp();
    await submitUrl(RECIPE.source_url);
    await userEvent.click(
      screen.getByRole("button", { name: /show options/i }),
    );

    mockedExtractRecipe.mockResolvedValueOnce(RECIPE);
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));

    await screen.findByTestId("recipe-url");
    expect(mockedExtractRecipe).toHaveBeenLastCalledWith(
      RECIPE.source_url,
      expect.any(AbortSignal),
    );
  });

  it("a failed paste returns home", async () => {
    // site_blocked makes paste the primary (focused) action.
    mockedExtractRecipe.mockRejectedValueOnce(
      new ExtractError("site_blocked", "shut the door"),
    );
    renderApp();
    await submitUrl(RECIPE.source_url);

    await userEvent.click(
      screen.getByRole("button", { name: /show options/i }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /paste the page/i }),
    );

    const textarea = await screen.findByRole("textbox", {
      name: /page html source/i,
    });
    await userEvent.type(textarea, "<html>pasted</html>");
    mockedExtractRecipeFromHtml.mockRejectedValueOnce(
      new ExtractError("no_recipe", "nothing found"),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /extract from html/i }),
    );

    await screen.findByRole("textbox", { name: /recipe url/i }); // back home
    expect(screen.queryByTestId("recipe-url")).toBeNull();
  });
});
