// Cache first, network otherwise, and cache whatever the network gives back. The
// deep-link and refresh paths both come through here. The Home submit and the
// error retry get a recipe another way and write to recipeCache themselves.
import { extractRecipe, type Recipe } from "./api.ts";
import { cacheRecipe, readCachedRecipe } from "./recipeCache.ts";

/** The recipe for `url`, extracted only if it isn't already in the session cache. */
export async function getRecipeByUrl(
  url: string,
  signal?: AbortSignal,
): Promise<Recipe> {
  const cached = readCachedRecipe(url);
  if (cached) return cached;
  const recipe = await extractRecipe(url, signal);
  cacheRecipe(url, recipe);
  return recipe;
}
