// React Router runs `viewTransition: true` navigations through
// document.startViewTransition. When one navigation supersedes another before its
// transition finishes — our submit chains home → /extract → recipe — the browser
// rejects the skipped transition with an AbortError ("Transition was skipped")
// that React Router gives no handle to catch. It's benign: the superseding
// transition simply takes over. Swallow exactly that rejection so it doesn't log
// as unhandled (in prod for reduced-motion users, and in tests).
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
