// Setup for the browser-mode (real Chromium) component-test project: register
// jest-dom matchers (toHaveAttribute, …) and unmount React trees between tests.
// ResizeObserver / matchMedia / layout are all real here — no stubs needed.
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
