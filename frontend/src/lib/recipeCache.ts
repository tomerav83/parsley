// A session-scoped cache of extracted recipes, keyed by the URL they're addressed
// by (the `/recipe?url=…` query param). It lets a refresh or a back/forward to a
// recipe restore instantly from storage instead of re-hitting the API — and it's
// the only way a *paste-sourced* recipe survives a reload at all, since its URL
// can't be re-fetched (the site blocked our reader, which is why it was pasted).
//
// sessionStorage, not localStorage: the cache is per-tab and clears when the tab
// closes, so it behaves like in-memory state that merely outlives a reload — not a
// durable store that could serve a stale recipe days later.

import { recipeSchema, type Recipe } from "./api.ts";

const KEY = "parsley:recipes";
const MAX = 10; // keep the most-recent N; parsed recipes are small, so this is plenty

type Cache = Record<string, Recipe>;

function read(): Cache {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Cache) : {};
  } catch {
    // Unavailable storage (private mode, disabled) or malformed JSON — treat as
    // empty; a miss just falls back to a re-fetch.
    return {};
  }
}

export function cacheRecipe(url: string, recipe: Recipe): void {
  if (!url) return;
  try {
    const cache = read();
    delete cache[url]; // re-insert at the end so it ranks as most-recent for eviction
    cache[url] = recipe;
    const keys = Object.keys(cache); // insertion order, oldest first
    for (const stale of keys.slice(0, Math.max(0, keys.length - MAX))) {
      delete cache[stale];
    }
    sessionStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // Writing can throw (quota, disabled storage). A failed write just means the
    // next reload re-fetches — non-fatal, so swallow it.
  }
}

export function readCachedRecipe(url: string): Recipe | null {
  if (!url) return null;
  const entry = read()[url];
  if (!entry) return null;
  // Validate against the same schema API responses use: a cache written by an older
  // deploy (a since-changed Recipe shape) or hand-edited storage can't crash the UI.
  const parsed = recipeSchema.safeParse(entry);
  return parsed.success ? parsed.data : null;
}
