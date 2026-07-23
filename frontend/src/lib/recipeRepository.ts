// The single "get the recipe for this URL" seam: session-cache first, network
// otherwise, and every network result is cached. Centralizes the cache-first /
// fetch / write policy the route loader would otherwise inline — the deep-link and
// refresh paths depend on it. (The Home-submit and error-retry paths obtain a
// recipe by other means — pasted HTML, a forced retry — and cache via recipeCache
// directly; this seam owns by-URL resolution specifically.)
import { extractRecipe, type Recipe } from "./api.ts";
import { cacheRecipe, readCachedRecipe } from "./recipeCache.ts";

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
