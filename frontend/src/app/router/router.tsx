import { createBrowserRouter, Navigate } from "react-router";
import App from "@/app/App.tsx";
import { HomeScreen } from "@/app/screens/HomeScreen/HomeScreen";
import { ExtractScreen } from "@/app/screens/ExtractScreen/ExtractScreen";

/**
 * Data-mode router (docs/decisions.md #15): real URLs, browser back/forward,
 * deep-linkable recipes. createBrowserRouter is the minimum mode that supports the
 * route `lazy` property and viewTransition navigations.
 *
 * Home stays eagerly bundled — lazy-loading the landing screen would delay first
 * paint for everyone. Paste and Recipe are route chunks fetched during the
 * navigation, before render, so there's no Suspense flicker.
 *
 * The dynamic import below is the only way into the recipe view: .oxlintrc.json
 * bans static imports of it everywhere else and exempts this file alone, which is
 * what keeps it off Home's first paint (docs/decisions.md #21).
 */
export const router = createBrowserRouter([
  {
    path: "/",
    Component: App,
    // Shows while a lazy chunk loads on a hard page load. Null renders a quiet
    // blank rather than a flash of fallback chrome.
    HydrateFallback: () => null,
    children: [
      { index: true, Component: HomeScreen },
      // Eager: a submit navigates here at once, so the work orb has to paint
      // without waiting on a chunk fetch. It pulls in no recipe code.
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
          // The loader resolves ?url= before the screen renders; a failed extract
          // throws and the ErrorBoundary shows the sad leaf in its place.
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
