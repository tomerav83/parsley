import { useOutletContext } from "react-router";
import type { useExtractionFlow } from "@/app/useExtractionFlow.ts";

// Everything App (the layout route) shares with its screens — derived from the
// flow hook so it stays in sync with what App actually provides, rather than
// being hand-maintained.
export type AppOutletContext = ReturnType<typeof useExtractionFlow>;

export function useAppOutlet(): AppOutletContext {
  return useOutletContext<AppOutletContext>();
}
