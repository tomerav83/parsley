import type { LoaderFunctionArgs } from "react-router";
import { extractRecipe, type Recipe } from "@/lib/api.ts";
import { readCachedRecipe } from "@/lib/recipeCache.ts";

export interface RecipeLoaderData {
  recipe: Recipe | null;
}

// The recipe route's data: resolve /recipe?url=… before the screen renders.
// Cache-first — a Home submit caches the recipe synchronously before it navigates
// here (see recipeExtractor.run), and a refresh/back-forward restores from
// sessionStorage — so only a cold deep-link to an uncached URL hits the network.
// A failed extract throws its ExtractError; the route's ErrorBoundary (RecipeError)
// renders the sad-parsley in place. `request.signal` lets React Router abort a
// superseded navigation for us.
export async function recipeLoader({
  request,
}: LoaderFunctionArgs): Promise<RecipeLoaderData> {
  const target = new URL(request.url).searchParams.get("url") ?? "";
  if (!target) return { recipe: null };
  const cached = readCachedRecipe(target);
  if (cached) return { recipe: cached };
  return { recipe: await extractRecipe(target, request.signal) };
}
