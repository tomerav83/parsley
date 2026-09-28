import { createBrowserRouter, redirect } from "react-router";
import App from "@/app/App.tsx";
import { RootError } from "./RootError/RootError";
import { HomeScreen } from "@/app/screens/HomeScreen/HomeScreen";
import { ExtractScreen } from "@/app/screens/ExtractScreen/ExtractScreen";

/**
 * The app's route table, handed to `<RouterProvider>` in main.tsx: real URLs,
 * browser back/forward and deep-linkable `/recipe?url=…` (docs/decisions.md #15).
 * Every screen renders inside App's `<Outlet>`; unknown paths redirect to `/`.
 */
export const router = createBrowserRouter([
  {
    path: "/",
    Component: App,
    // Catches whatever no child route handles itself: a loader or render error
    // outside /recipe, or a lazy chunk failing to load (including the recipe
    // chunk, whose own ErrorBoundary lives in that chunk).
    ErrorBoundary: RootError,
    // Shows on a hard page load until the matched routes' lazy chunks and
    // loaders settle (a cold /recipe deep link waits on the extract request).
    // Null renders a quiet blank rather than a flash of fallback chrome.
    HydrateFallback: () => null,
    children: [
      // Eager: lazy-loading the landing screen delays everyone's first paint.
      { index: true, Component: HomeScreen },
      // Eager: a submit navigates here at once, so the work orb has to paint
      // without waiting on a chunk fetch. It pulls in no recipe code.
      { path: "extract", Component: ExtractScreen },
      // Route `lazy` fetches the chunk during the navigation, before render,
      // so there's no Suspense flicker.
      {
        path: "paste",
        lazy: {
          Component: async () =>
            (await import("@/app/screens/PasteScreen/PasteScreen")).PasteScreen,
        },
      },
      // The only way into the recipe view, enforced by .oxlintrc.json
      // (docs/decisions.md #21).
      {
        path: "recipe",
        lazy: {
          // The loader resolves ?url= before the screen renders; a failed extract
          // throws and RecipeError's leaf failure panel renders in its place.
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
      // Redirect before render, so App never mounts at an unknown path.
      { path: "*", loader: () => redirect("/") },
    ],
  },
]);
