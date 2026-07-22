// useExtractionFlow's liquid-wave branches, with a real mounted overlay:
// every navigation entry point covered by a wave — forward landings, failure
// drains, wave-only passes — asserting the route swap happens under full
// cover and the overlay always clears. The player's frame-level behavior is
// celPlayer.test.ts; this file is about the orchestration.
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
// request settles — which is what the surfacing gate must hold back
let mockError: { code: string; message: string } | null = null;
const run = async () => {
  if (nextResult === "error") mockError = { code: "unknown", message: "boom" };
  return nextResult;
};
const runUrl = vi.fn(run);
const runPaste = vi.fn(run);
// whether the wave was still on screen when retry()'s promise resolved — the
// floating error folds the outcome into its button state at that moment, so
// it must land before the drain uncovers the widget
let retrySettledUnderWave: boolean | null = null;

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
      <button
        onClick={() =>
          void flow.retry().then(() => {
            retrySettledUnderWave = overlay().hasAttribute("data-stage");
          })
        }
      >
        retry
      </button>
      <button onClick={() => flow.backToSearch()}>back</button>
      <button onClick={() => flow.openPaste()}>open-paste</button>
      <button onClick={() => flow.openPasteFor(URL)}>open-paste-for</button>
      {flow.extract.error !== null && flow.errorSurfaced && <p>surfaced</p>}
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
  retrySettledUnderWave = null;
  mockError = null;
});

describe("useExtractionFlow liquid waves", () => {
  it("an empty url is a no-op — no wave, no request", async () => {
    renderAt(["/"]);
    await userEvent.click(screen.getByRole("button", { name: "submit" }));
    expect(runUrl).not.toHaveBeenCalled();
    expect(overlay().hasAttribute("data-stage")).toBe(false);
  });

  it("lands a successful extraction on the recipe under full cover", async () => {
    nextResult = "success";
    renderAt(["/"]);
    await userEvent.click(screen.getByRole("button", { name: "seed" }));
    await userEvent.click(screen.getByRole("button", { name: "submit" }));

    // the swap happens while the wave still covers the screen
    await screen.findByText("recipe-screen", undefined, { timeout: 5000 });
    expect(overlay().hasAttribute("data-stage")).toBe(true);
    expect(runUrl).toHaveBeenCalledWith(URL);

    await settled();
    expect(screen.getByText("recipe-screen")).toBeInTheDocument();
  }, 15_000);

  it("drains back on failure and stays on home", async () => {
    nextResult = "error";
    renderAt(["/"]);
    await userEvent.click(screen.getByRole("button", { name: "seed" }));
    await userEvent.click(screen.getByRole("button", { name: "submit" }));

    await waitFor(
      () => expect(overlay().hasAttribute("data-stage")).toBe(true),
      { timeout: 3000 },
    );
    await settled();
    expect(screen.getByText("home-screen")).toBeInTheDocument();
    expect(screen.queryByText("recipe-screen")).not.toBeInTheDocument();
  }, 15_000);

  it("a fresh failure surfaces only under the wave, never beside it", async () => {
    nextResult = "error"; // the mock fails instantly — well before cover
    renderAt(["/"]);
    await userEvent.click(screen.getByRole("button", { name: "seed" }));
    await userEvent.click(screen.getByRole("button", { name: "submit" }));

    // the wave is up and the request has already failed, yet nothing surfaces
    await waitFor(
      () => expect(overlay().hasAttribute("data-stage")).toBe(true),
      { timeout: 3000 },
    );
    expect(screen.queryByText("surfaced")).not.toBeInTheDocument();

    // it surfaces while the wave still covers the screen (mount-under-cover)
    await screen.findByText("surfaced", undefined, { timeout: 6000 });
    expect(overlay().hasAttribute("data-stage")).toBe(true);

    await settled();
    expect(screen.getByText("surfaced")).toBeInTheDocument();
  }, 15_000);

  it("retry follows the same covered run, settling before the drain uncovers it", async () => {
    nextResult = "success";
    renderAt(["/"]);
    await userEvent.click(screen.getByRole("button", { name: "seed" }));
    await userEvent.click(screen.getByRole("button", { name: "retry" }));
    await screen.findByText("recipe-screen", undefined, { timeout: 5000 });
    await settled();
    // the widget's spinner state must resolve while the wave still covers it
    expect(retrySettledUnderWave).toBe(true);
  }, 15_000);

  it("a failed retry's outcome also lands before the wave uncovers the widget", async () => {
    nextResult = "error";
    renderAt(["/"]);
    await userEvent.click(screen.getByRole("button", { name: "seed" }));
    await userEvent.click(screen.getByRole("button", { name: "retry" }));
    await waitFor(() => expect(retrySettledUnderWave).not.toBeNull(), {
      timeout: 5000,
    });
    expect(retrySettledUnderWave).toBe(true);
    await settled();
    expect(screen.getByText("home-screen")).toBeInTheDocument();
  }, 15_000);

  it("paste success lands on the recipe; paste failure returns home", async () => {
    nextResult = "success";
    renderAt(["/paste"]);
    await userEvent.click(screen.getByRole("button", { name: "paste" }));
    await screen.findByText("recipe-screen", undefined, { timeout: 5000 });
    expect(runPaste).toHaveBeenCalled();
    await settled();
  }, 15_000);

  it("paste failure drains home (the terminal-error surface)", async () => {
    nextResult = "error";
    renderAt(["/paste"]);
    await userEvent.click(screen.getByRole("button", { name: "paste" }));
    await screen.findByText("home-screen", undefined, { timeout: 5000 });
    await settled();
  }, 15_000);

  it("an aborted paste reveals the paste screen it never left", async () => {
    nextResult = "aborted";
    renderAt(["/paste"]);
    await userEvent.click(screen.getByRole("button", { name: "paste" }));
    await waitFor(
      () => expect(overlay().hasAttribute("data-stage")).toBe(true),
      { timeout: 3000 },
    );
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
