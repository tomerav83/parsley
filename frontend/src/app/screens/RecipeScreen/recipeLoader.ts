import type { LoaderFunctionArgs } from "react-router";
import type { Recipe } from "@/lib/api.ts";
import { getRecipeByUrl } from "@/lib/recipeRepository.ts";

export interface RecipeLoaderData {
  recipe: Recipe | null;
}

/**
 * Resolve /recipe?url=… before the screen renders, so the card never paints a
 * loading state. A Home submit has already cached the recipe and a refresh reads
 * it back from sessionStorage; only a cold deep-link actually hits the network.
 *
 * A failed extract throws, and the route's ErrorBoundary renders instead.
 */
export async function recipeLoader({
  request,
}: LoaderFunctionArgs): Promise<RecipeLoaderData> {
  const target = new URL(request.url).searchParams.get("url") ?? "";
  if (!target) return { recipe: null };
  return { recipe: await getRecipeByUrl(target, request.signal) };
}
