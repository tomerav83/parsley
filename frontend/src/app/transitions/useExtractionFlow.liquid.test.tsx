// useExtractionFlow's liquid-wave branches, with a real mounted overlay: every
// navigation entry point covered by a wave — the passage to the transition
// screen, the landing on the recipe, the paste passes — asserting the route
// swap happens under full cover and the overlay always clears. The player's
// frame-level behavior is celPlayer.test.ts; this file is about the orchestration.
//
// Waves run at real speed (~1.6s each), so assertions use generous timeouts.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Outlet, RouterProvider, createMemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RunResult } from "@/features/extract/recipeExtractor.ts";
import { LiquidTransition } from "../LiquidTransition/LiquidTransition.tsx";
import { useExtractionFlow } from "./useExtractionFlow.ts";

let nextResult: RunResult = "success";
// mirrors the real extractor: a failing run sets error state the moment the
// request settles — which the transition screen reads to morph in place
let mockError: { code: string; message: string } | null = null;
const run = async () => {
  if (nextResult === "error") mockError = { code: "unknown", message: "boom" };
  return nextResult;
};
const runUrl = vi.fn(run);
const runPaste = vi.fn(run);

vi.mock("@/features/extract/recipeExtractor.ts", () => ({
  useRecipeExtractor: () => ({
    recipe: null,
    error: mockError as never,
    loading: false,
    pasteFailed: false,
    runUrl,
    runPaste,
    dismiss: vi.fn(() => (mockError = null)),
    restore: vi.fn(),
  }),
}));

const URL = "https://example.com/soup";

function Layout() {
  const flow = useExtractionFlow();
  return (
    <div>
      <input aria-label="url" value={flow.url} readOnly />
      <button onClick={() => flow.setUrl(URL)}>seed</button>
      <button onClick={() => void flow.submitUrl()}>submit</button>
      <button onClick={() => void flow.submitPaste("<html/>")}>paste</button>
      <button onClick={() => void flow.retry()}>retry</button>
      <button onClick={() => flow.backToSearch()}>back</button>
      <button onClick={() => flow.openPaste()}>open-paste</button>
      <button onClick={() => flow.openPasteFor(URL)}>open-paste-for</button>
      <Outlet />
    </div>
  );
}

const overlay = () =>
  document.querySelector<HTMLDivElement>('div[aria-hidden="true"]')!;

function renderAt(initialEntries: string[]) {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        Component: Layout,
        children: [
          { index: true, Component: () => <p>home-screen</p> },
          { path: "extract", Component: () => <p>extract-screen</p> },
          { path: "paste", Component: () => <p>paste-screen</p> },
          { path: "recipe", Component: () => <p>recipe-screen</p> },
        ],
      },
    ],
    { initialEntries },
  );
  render(
    <>
      <RouterProvider router={router} />
      <LiquidTransition />
    </>,
  );
  return router;
}

const settled = () =>
  waitFor(() => expect(overlay().hasAttribute("data-stage")).toBe(false), {
    timeout: 5000,
  });

afterEach(() => {
  vi.clearAllMocks();
  mockError = null;
});

describe("useExtractionFlow liquid waves", () => {
  it("an empty url is a no-op — no wave, no request", async () => {
    renderAt(["/"]);
    await userEvent.click(screen.getByRole("button", { name: "submit" }));
    expect(runUrl).not.toHaveBeenCalled();
    expect(overlay().hasAttribute("data-stage")).toBe(false);
  });

  it("waves to the transition screen, then lands the recipe under full cover", async () => {
    nextResult = "success";
    const router = renderAt(["/"]);
    await userEvent.click(screen.getByRole("button", { name: "seed" }));
    await userEvent.click(screen.getByRole("button", { name: "submit" }));

    // the recipe swap happens while the wave still covers the screen
    await screen.findByText("recipe-screen", undefined, { timeout: 8000 });
    expect(overlay().hasAttribute("data-stage")).toBe(true);
    expect(runUrl).toHaveBeenCalledWith(URL);

    await settled();
    expect(router.state.location.pathname).toBe("/recipe");
  }, 15_000);

  it("a failure stays on the transition screen (no recipe, no drain home)", async () => {
    nextResult = "error";
    const router = renderAt(["/"]);
    await userEvent.click(screen.getByRole("button", { name: "seed" }));
    await userEvent.click(screen.getByRole("button", { name: "submit" }));

    await screen.findByText("extract-screen", undefined, { timeout: 8000 });
    await settled();
    // stays put — the transition screen holds the failure in place
    expect(router.state.location.pathname).toBe("/extract");
    expect(screen.queryByText("recipe-screen")).not.toBeInTheDocument();
    expect(screen.queryByText("home-screen")).not.toBeInTheDocument();
  }, 15_000);

  it("history keeps the transition screen out of the back stack (submit is the only push)", async () => {
    nextResult = "success";
    const router = renderAt(["/"]);
    await userEvent.click(screen.getByRole("button", { name: "seed" }));
    await userEvent.click(screen.getByRole("button", { name: "submit" }));
    await screen.findByText("recipe-screen", undefined, { timeout: 8000 });
    await settled();

    // Back from the recipe returns to home, never to /extract (it was replaced).
    void router.navigate(-1);
    await screen.findByText("home-screen", undefined, { timeout: 5000 });
    await settled();
    expect(router.state.location.pathname).toBe("/");
  }, 20_000);

  it("retry lands the recipe on success", async () => {
    nextResult = "success";
    const router = renderAt(["/extract"]);
    await userEvent.click(screen.getByRole("button", { name: "retry" }));
    await screen.findByText("recipe-screen", undefined, { timeout: 5000 });
    await settled();
    expect(router.state.location.pathname).toBe("/recipe");
  }, 15_000);

  it("a failed retry stays on the transition screen", async () => {
    nextResult = "error";
    const router = renderAt(["/extract"]);
    await userEvent.click(screen.getByRole("button", { name: "retry" }));
    // no navigation on failure — give any (wrong) wave a window to fire
    await new Promise((resolve) => setTimeout(resolve, 500));
    await settled();
    expect(router.state.location.pathname).toBe("/extract");
    expect(runUrl).toHaveBeenCalledWith("", { retry: true });
  }, 15_000);

  it("paste success lands on the recipe; paste failure stays on the paste screen", async () => {
    nextResult = "success";
    const okRouter = renderAt(["/paste"]);
    await userEvent.click(screen.getByRole("button", { name: "paste" }));
    await screen.findByText("recipe-screen", undefined, { timeout: 5000 });
    expect(runPaste).toHaveBeenCalled();
    await settled();
    expect(okRouter.state.location.pathname).toBe("/recipe");
  }, 15_000);

  it("paste failure returns to the transition screen (terminal, report-only)", async () => {
    nextResult = "error";
    const router = renderAt(["/paste"]);
    await userEvent.click(screen.getByRole("button", { name: "paste" }));
    await screen.findByText("extract-screen", undefined, { timeout: 8000 });
    await settled();
    expect(router.state.location.pathname).toBe("/extract");
  }, 15_000);

  it("an aborted paste reveals the paste screen it never left", async () => {
    nextResult = "aborted";
    renderAt(["/paste"]);
    await userEvent.click(screen.getByRole("button", { name: "paste" }));
    await new Promise((resolve) => setTimeout(resolve, 500));
    await settled();
    expect(screen.getByText("paste-screen")).toBeInTheDocument();
  }, 15_000);

  it("back-to-search and open-paste ride wave-only passes", async () => {
    renderAt(["/recipe"]);
    await userEvent.click(screen.getByRole("button", { name: "back" }));
    await screen.findByText("home-screen", undefined, { timeout: 5000 });
    expect(screen.getByLabelText("url")).toHaveValue("");
    await settled();

    await userEvent.click(screen.getByRole("button", { name: "open-paste" }));
    await screen.findByText("paste-screen", undefined, { timeout: 5000 });
    await settled();

    await userEvent.click(
      screen.getByRole("button", { name: "open-paste-for" }),
    );
    // already on /paste — the wave still runs, the route stays
    await settled();
    expect(screen.getByText("paste-screen")).toBeInTheDocument();
  }, 20_000);

  it("browser back rides a wave, swapping the route under full cover", async () => {
    const router = renderAt(["/", "/recipe"]);
    await screen.findByText("recipe-screen", undefined, { timeout: 5000 });

    // the browser back button is a POP, not one of our navigate() calls
    void router.navigate(-1);

    // the swap to the previous screen happens only once the wave covers it
    await screen.findByText("home-screen", undefined, { timeout: 5000 });
    expect(overlay().hasAttribute("data-stage")).toBe(true);

    await settled();
    expect(screen.getByText("home-screen")).toBeInTheDocument();
    expect(screen.queryByText("recipe-screen")).not.toBeInTheDocument();
  }, 15_000);
});
