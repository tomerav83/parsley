import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ThemeToggle } from "./ThemeToggle";

// A controllable MediaQueryList double for `(prefers-color-scheme: dark)` —
// real Chromium's own OS preference isn't something a test can flip, and this
// file's job is exercising both states of it plus a live "change" event.
function fakeMediaQueryList(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<(event: { matches: boolean }) => void>();
  return {
    get matches() {
      return matches;
    },
    addEventListener: (
      _type: string,
      fn: (event: { matches: boolean }) => void,
    ) => listeners.add(fn),
    removeEventListener: (
      _type: string,
      fn: (event: { matches: boolean }) => void,
    ) => listeners.delete(fn),
    setMatches(next: boolean) {
      matches = next;
      listeners.forEach((fn) => fn({ matches: next }));
    },
  };
}

afterEach(() => {
  document.documentElement.removeAttribute("data-theme");
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("ThemeToggle — initial theme", () => {
  it("uses the explicit data-theme attribute over the OS preference", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    vi.spyOn(window, "matchMedia").mockReturnValue(
      fakeMediaQueryList(false) as unknown as MediaQueryList, // OS says light — ignored
    );
    render(<ThemeToggle />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  });

  it("falls back to the OS preference when there is no explicit choice", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue(
      fakeMediaQueryList(true) as unknown as MediaQueryList, // OS prefers dark
    );
    render(<ThemeToggle />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  });
});

describe("ThemeToggle — toggling", () => {
  it("sets data-theme, persists the choice, and flips the label/icon", async () => {
    vi.spyOn(window, "matchMedia").mockReturnValue(
      fakeMediaQueryList(false) as unknown as MediaQueryList,
    );
    render(<ThemeToggle />);

    await userEvent.click(
      screen.getByRole("button", { name: /switch to dark/i }),
    );

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(
      screen.getByRole("button", { name: /switch to light/i }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("still flips the theme in-session even if persisting the choice throws", async () => {
    vi.spyOn(window, "matchMedia").mockReturnValue(
      fakeMediaQueryList(false) as unknown as MediaQueryList,
    );
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    render(<ThemeToggle />);

    await userEvent.click(screen.getByRole("button"));

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  });
});

describe("ThemeToggle — following the OS after mount", () => {
  it("follows an OS-preference change when there is no explicit choice", () => {
    const mql = fakeMediaQueryList(false); // starts light
    vi.spyOn(window, "matchMedia").mockReturnValue(
      mql as unknown as MediaQueryList,
    );
    render(<ThemeToggle />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false");

    act(() => mql.setMatches(true));
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  });

  it("ignores a later OS-preference change once an explicit choice is stored", async () => {
    const mql = fakeMediaQueryList(false); // starts light
    vi.spyOn(window, "matchMedia").mockReturnValue(
      mql as unknown as MediaQueryList,
    );
    render(<ThemeToggle />);
    await userEvent.click(screen.getByRole("button")); // explicit choice: now dark
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");

    act(() => mql.setMatches(false)); // OS flips to light — should be ignored
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  });

  it("treats a blocked storage read as no explicit choice, so it still follows the OS", () => {
    const mql = fakeMediaQueryList(false);
    vi.spyOn(window, "matchMedia").mockReturnValue(
      mql as unknown as MediaQueryList,
    );
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked (e.g. private mode)");
    });
    render(<ThemeToggle />);

    act(() => mql.setMatches(true));
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  });
});
