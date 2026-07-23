import type { LoaderFunctionArgs } from "react-router";
import type { Recipe } from "@/lib/api.ts";
import { getRecipeByUrl } from "@/lib/recipeRepository.ts";

export interface RecipeLoaderData {
  recipe: Recipe | null;
}

// The recipe route's data: resolve /recipe?url=… before the screen renders, via
// the recipe repository (cache-first — a Home submit caches synchronously before
// navigating, and a refresh/back-forward restores from sessionStorage — so only a
// cold deep-link to an uncached URL hits the network, which then caches too). A
// failed extract throws its ExtractError; the route's ErrorBoundary (RecipeError)
// renders the sad-parsley in place. `request.signal` lets React Router abort a
// superseded navigation for us.
export async function recipeLoader({
  request,
}: LoaderFunctionArgs): Promise<RecipeLoaderData> {
  const target = new URL(request.url).searchParams.get("url") ?? "";
  if (!target) return { recipe: null };
  return { recipe: await getRecipeByUrl(target, request.signal) };
}
