import { createBrowserRouter, Navigate } from "react-router";
import App from "@/app/App.tsx";
import { HomeScreen } from "@/app/screens/HomeScreen/HomeScreen";
import { ExtractScreen } from "@/app/screens/ExtractScreen/ExtractScreen";

// Data-mode router (REDESIGN D6): real URLs, browser back/forward, and
// deep-linkable recipes (/recipe?url=…). Data mode — createBrowserRouter, not
// <BrowserRouter> — is the minimum mode that supports the route `lazy` property
// and `viewTransition` navigations (https://reactrouter.com/start/modes).
//
// Home stays eagerly bundled: it's the landing screen, so lazy-loading it would
// delay first paint for everyone. Paste and Recipe are split into route chunks
// fetched during navigation — before render, so there's no Suspense flicker
// (https://remix.run/blog/lazy-loading-routes).
//
// The recipe view being off Home's first paint (REDESIGN F2) is an invariant
// enforced by lint: `.oxlintrc.json`'s no-restricted-imports bans static imports
// of the recipe view (@/features/recipe/** and the RecipeScreen) from eager code,
// so it can be reached only through the dynamic import() below. This file is
// exempted there — it's the one designated loader.
export const router = createBrowserRouter([
  {
    path: "/",
    Component: App,
    // Rendered while a lazy route chunk loads on a hard (deep-link) page load.
    // Null keeps it a quiet blank instead of a flash of fallback chrome.
    HydrateFallback: () => null,
    children: [
      { index: true, Component: HomeScreen },
      // The transition screen: work orb while extracting, the failure panel in
      // place on error. Eager (not lazy) — a submit navigates here immediately, so
      // it must paint the work orb without waiting on a chunk fetch. It imports no
      // recipe code, so it stays clear of the F2 "recipe off first paint" invariant.
      { path: "extract", Component: ExtractScreen },
      {
        path: "paste",
        lazy: {
          Component: async () =>
            (await import("@/app/screens/PasteScreen/PasteScreen")).PasteScreen,
        },
      },
      {
        path: "recipe",
        lazy: {
          // The loader resolves /recipe?url=… before the screen renders (cache-first,
          // network only for a cold deep-link); a failed extract throws and the
          // ErrorBoundary shows the sad-parsley in place. All three are code-split,
          // so the recipe view stays off Home's first paint (REDESIGN F2).
          Component: async () =>
            (await import("@/app/screens/RecipeScreen/RecipeScreen"))
              .RecipeScreen,
          loader: async () =>
            (await import("@/app/screens/RecipeScreen/recipeLoader"))
              .recipeLoader,
          ErrorBoundary: async () =>
            (await import("@/app/screens/RecipeScreen/RecipeError"))
              .RecipeError,
        },
      },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);
