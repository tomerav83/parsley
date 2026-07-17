// `appOutlet` is a custom hook (it wraps useOutletContext and is always called
// unconditionally at a screen's top level), but it's named to match its module
// rather than the use* convention — so the Rules-of-Hooks lint, which keys off
// the `use` prefix, is disabled for this file.
/* oxlint-disable react-hooks/rules-of-hooks */
import type { RefObject } from "react";
import { useOutletContext } from "react-router";
import type { recipeExtractor } from "@/features/extract/recipeExtractor.ts";

// Everything App (the layout route) shares with its screens. The extraction
// lifecycle and the URL field live in App so they survive screens mounting and
// unmounting as the route changes.
export interface AppOutletContext {
  extract: ReturnType<typeof recipeExtractor>;
  /** The URL field's current text (state lives in App so it survives route changes). */
  url: string;
  setUrl: (url: string) => void;
  /** The last URL submitted for extraction — recovery flows reuse it. */
  lastUrl: string;
  /** The home screen's URL input, owned by App so error recovery can refocus it. */
  urlFieldRef: RefObject<HTMLInputElement | null>;
  submitUrl: () => void;
  submitPaste: (html: string) => void;
  /** Deep-link entry: extract `url` now (used by /recipe?url=… on a fresh load). */
  requestRecipe: (url: string) => void;
  /** Return to the home search: dismiss any error, clear the field, navigate home. */
  backToSearch: () => void;
}

export function appOutlet(): AppOutletContext {
  return useOutletContext<AppOutletContext>();
}
