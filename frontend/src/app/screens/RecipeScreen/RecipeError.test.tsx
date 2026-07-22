// RecipeError is the recipe route's ErrorBoundary: a thin adapter that reads the
// loader's thrown error (useRouteError) and renders the shared ErrorWindow. The
// one bit of real logic is the ExtractError guard — anything that isn't one
// becomes a generic "something went wrong" so the window never renders a raw
// stack. Driven through a memory router whose loader throws, so useRouteError
// resolves for real; useAppOutlet's handlers are stubbed.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRoutesStub } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ExtractError } from "@/lib/api.ts";
import type { Recipe } from "@/lib/api.ts";
import type { AppOutletContext } from "@/app/router/useAppOutlet.ts";
import { RecipeError } from "./RecipeError.tsx";

vi.mock("@/app/router/useAppOutlet.ts", () => ({
  useAppOutlet: vi.fn(),
}));
vi.mock("@/lib/api.ts", async (importOriginal) => ({
  ...(await importOriginal()),
  extractRecipe: vi.fn(),
}));
vi.mock("@/lib/recipeCache.ts", () => ({ cacheRecipe: vi.fn() }));

const { useAppOutlet } = await import("@/app/router/useAppOutlet.ts");
const { extractRecipe } = await import("@/lib/api.ts");
const { cacheRecipe } = await import("@/lib/recipeCache.ts");
const mockedAppOutlet = vi.mocked(useAppOutlet);
const mockedExtract = vi.mocked(extractRecipe);
const mockedCache = vi.mocked(cacheRecipe);

afterEach(() => vi.clearAllMocks());

// Render RecipeError as a route ErrorBoundary behind a loader that throws `thrown`.
function renderWithThrown(
  thrown: unknown,
  outlet: Partial<AppOutletContext> = {},
) {
  mockedAppOutlet.mockReturnValue({
    setUrl: vi.fn(),
    openPasteFor: vi.fn(),
    backToSearch: vi.fn(),
    ...outlet,
  } as AppOutletContext);
  const Stub = createRoutesStub([
    { path: "/", Component: () => <div>Home</div> },
    {
      path: "/recipe",
      loader: () => {
        throw thrown;
      },
      Component: () => null,
      HydrateFallback: () => null,
      ErrorBoundary: RecipeError,
    },
  ]);
  render(<Stub initialEntries={["/recipe?url=https://x.com/toast"]} />);
}

// The window opens centered and focused — the alertdialog is queryable at once.
async function findDialog() {
  return await screen.findByRole("alertdialog");
}

describe("RecipeError", () => {
  it("passes a thrown ExtractError through unchanged (its code drives the copy)", async () => {
    renderWithThrown(new ExtractError("site_blocked", "blocked"));
    expect(await findDialog()).toHaveAccessibleName(
      /that site blocked our reader/i,
    );
  });

  it("wraps a non-ExtractError in the generic 'unknown' error instead of leaking it", async () => {
    renderWithThrown(new TypeError("undefined is not a function"));
    const dialog = await findDialog();
    expect(dialog).toHaveAccessibleName(/something went wrong/i);
    expect(dialog).not.toHaveAccessibleName(/undefined is not a function/i);
  });

  it("routes the paste fallback through openPasteFor with the failed url", async () => {
    const openPasteFor = vi.fn();
    renderWithThrown(new ExtractError("site_blocked", "blocked"), {
      openPasteFor,
    });
    await findDialog();
    await userEvent.click(screen.getByRole("button", { name: /paste/i }));
    expect(openPasteFor).toHaveBeenCalledWith("https://x.com/toast");
  });

  it("routes edit through setUrl + navigate back to search", async () => {
    const setUrl = vi.fn();
    renderWithThrown(new ExtractError("invalid_url", "not a link"), {
      setUrl,
    });
    await findDialog();
    await userEvent.click(screen.getByRole("button", { name: /edit link/i }));
    expect(setUrl).toHaveBeenCalledWith("https://x.com/toast");
    expect(await screen.findByText("Home")).toBeInTheDocument();
  });

  it("retries by re-extracting and caching before revalidating", async () => {
    const recipe = { name: "Toast", source_url: "u" } as Recipe;
    mockedExtract.mockResolvedValue(recipe);
    renderWithThrown(new ExtractError("network", "offline"));
    await findDialog();
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(mockedExtract).toHaveBeenCalledWith("https://x.com/toast");
    await vi.waitFor(() =>
      expect(mockedCache).toHaveBeenCalledWith("https://x.com/toast", recipe),
    );
  });
});
