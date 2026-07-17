// RecipeScreen's own job — deciding whether a deep-linked /recipe?url=… target
// is already on screen, cached, or needs a network request — is independent of
// which concrete recipeExtractor/App wiring sits behind the outlet context. So
// `appOutlet` is mocked directly (a controllable AppOutletContext, not the real
// hook) rather than rendering the real App: it isolates exactly the decision
// logic under test (RecipeScreen's `requestedFor` guard) from App's own
// nav/cache/focus behavior, already covered in App.test.tsx.
import { act, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Recipe } from "@/lib/api.ts";
import type { AppOutletContext } from "@/app/router/appOutlet.ts";
import { RecipeScreen } from "./RecipeScreen.tsx";

vi.mock("@/app/router/appOutlet.ts", () => ({
  appOutlet: vi.fn(),
}));
vi.mock("@/lib/recipeCache.ts", () => ({
  readCachedRecipe: vi.fn(),
}));

const { appOutlet } = await import("@/app/router/appOutlet.ts");
const { readCachedRecipe } = await import("@/lib/recipeCache.ts");
const mockedAppOutlet = vi.mocked(appOutlet);
const mockedReadCachedRecipe = vi.mocked(readCachedRecipe);

afterEach(() => {
  vi.clearAllMocks();
});

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

function makeContext(
  overrides: Partial<AppOutletContext> = {},
): AppOutletContext {
  return {
    extract: {
      recipe: null,
      error: null,
      loading: false,
      pasteFailed: false,
      runUrl: vi.fn(),
      runPaste: vi.fn(),
      dismiss: vi.fn(),
      restore: vi.fn(),
    },
    url: "",
    setUrl: vi.fn(),
    lastUrl: "",
    urlFieldRef: { current: null },
    submitUrl: vi.fn(),
    submitPaste: vi.fn(),
    requestRecipe: vi.fn(),
    backToSearch: vi.fn(),
    ...overrides,
  };
}

function renderRecipeScreen(path: string, context: AppOutletContext) {
  mockedAppOutlet.mockReturnValue(context);
  const router = createMemoryRouter(
    [{ path: "/recipe", Component: RecipeScreen }],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

// Re-renders RecipeScreen against a new mocked outlet context, without
// changing the `url` search param the tests care about. A plain RTL
// `rerender()` of the *same* router instance is NOT enough here: React
// Router memoizes the matched route element by its own location state, so
// re-rendering the outer tree with an unchanged location skips re-invoking
// RecipeScreen entirely — silently turning a "does the guard hold across a
// real second pass" test into one that never took a second pass at all. A
// genuine navigation (even to a location differing only in an inert marker
// param) is what actually forces react-router to recompute state and
// re-render the matched component.
async function rerenderWithContext(
  router: ReturnType<typeof createMemoryRouter>,
  url: string,
  context: AppOutletContext,
) {
  mockedAppOutlet.mockReturnValue(context);
  await act(async () => {
    await router.navigate(`/recipe?url=${encodeURIComponent(url)}&_poke=1`);
  });
}

describe("RecipeScreen — deep-link target resolution", () => {
  it("prefers a cached recipe over a network request", () => {
    const restore = vi.fn();
    const requestRecipe = vi.fn();
    mockedReadCachedRecipe.mockReturnValue(RECIPE);

    renderRecipeScreen(
      "/recipe?url=https://example.com/toast",
      makeContext({
        requestRecipe,
        extract: { ...makeContext().extract, restore },
      }),
    );

    expect(mockedReadCachedRecipe).toHaveBeenCalledWith(
      "https://example.com/toast",
    );
    expect(restore).toHaveBeenCalledWith(RECIPE);
    expect(requestRecipe).not.toHaveBeenCalled();
  });

  it("falls back to a network request when nothing is cached", () => {
    const requestRecipe = vi.fn();
    const restore = vi.fn();
    mockedReadCachedRecipe.mockReturnValue(null);

    renderRecipeScreen(
      "/recipe?url=https://example.com/toast",
      makeContext({
        requestRecipe,
        extract: { ...makeContext().extract, restore },
      }),
    );

    expect(requestRecipe).toHaveBeenCalledWith("https://example.com/toast");
    expect(restore).not.toHaveBeenCalled();
  });

  it("does nothing when the on-screen recipe already matches the target", () => {
    const requestRecipe = vi.fn();
    const restore = vi.fn();

    renderRecipeScreen(
      "/recipe?url=https://example.com/toast",
      makeContext({
        requestRecipe,
        extract: { ...makeContext().extract, recipe: RECIPE, restore },
      }),
    );

    expect(requestRecipe).not.toHaveBeenCalled();
    expect(restore).not.toHaveBeenCalled();
    expect(mockedReadCachedRecipe).not.toHaveBeenCalled();
  });

  it("shows the skeleton while loading and the card once the recipe lands", async () => {
    mockedReadCachedRecipe.mockReturnValue(null);
    const router = renderRecipeScreen(
      "/recipe?url=https://example.com/toast",
      makeContext({ extract: { ...makeContext().extract, loading: true } }),
    );
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();

    await rerenderWithContext(
      router,
      "https://example.com/toast",
      makeContext({ extract: { ...makeContext().extract, recipe: RECIPE } }),
    );

    expect(screen.getByRole("heading", { name: "Toast" })).toBeInTheDocument();
  });
});

// The reason `requestedFor` exists at all: without it, a backend that
// canonicalises the requested URL (redirect, trailing slash) — making the
// landed recipe's source_url differ from what was asked for — would fail the
// simple "already have it" check on every subsequent render and re-request
// forever.
describe("RecipeScreen — the one-shot request guard", () => {
  it("acts on a given target at most once, surviving a URL-canonicalising backend", async () => {
    const requestRecipe = vi.fn();
    mockedReadCachedRecipe.mockReturnValue(null);

    const router = renderRecipeScreen(
      "/recipe?url=https://example.com/toast",
      makeContext({ requestRecipe }),
    );
    expect(requestRecipe).toHaveBeenCalledTimes(1);

    // The backend answers with a canonicalised source_url that differs from
    // the requested target — recipe.source_url !== target — so the
    // already-have-it check alone would not stop a second call here; only
    // the one-shot guard does.
    await rerenderWithContext(
      router,
      "https://example.com/toast",
      makeContext({
        requestRecipe,
        extract: {
          ...makeContext().extract,
          recipe: { ...RECIPE, source_url: "https://example.com/toast/" },
        },
      }),
    );

    expect(requestRecipe).toHaveBeenCalledTimes(1); // still just the once
  });
});
