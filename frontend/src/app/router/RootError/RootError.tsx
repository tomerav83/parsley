import { useRouteError } from "react-router";

/**
 * Last-resort ErrorBoundary on the root route, in place of React Router's
 * built-in error page. Renders instead of App, so App's chrome and outlet
 * context aren't available. Logs the route error to the console on every render.
 */
// Eagerly bundled: a lazy boundary can't catch its own chunk failing to load.
export function RootError() {
  console.error(useRouteError());
  return (
    <main role="alert">
      <h1>Something went wrong.</h1>
      {/* A full page load, not a <Link>: if a stale chunk is what failed, this
          also picks up the current build. */}
      <a href="/">Back to Parsley</a>
    </main>
  );
}
