/**
 * Swallow the AbortError the browser raises when one view transition supersedes
 * another, which our submit chain (home → /extract → recipe) does constantly.
 *
 * It's benign — the newer transition takes over — but React Router gives no handle
 * to catch it, so without this it logs as an unhandled rejection in tests and for
 * reduced-motion users in production.
 */
export function ignoreSkippedViewTransitions(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("unhandledrejection", (event) => {
    const reason: unknown = event.reason;
    if (
      reason instanceof Error &&
      reason.name === "AbortError" &&
      /transition was skipped/i.test(reason.message)
    ) {
      event.preventDefault();
    }
  });
}
