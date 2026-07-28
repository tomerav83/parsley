import { useOutletContext } from "react-router";
import type { useExtractionFlow } from "@/app/transitions/useExtractionFlow.ts";

/** Everything App shares with its screens, derived from the hook that provides it. */
export type AppOutletContext = ReturnType<typeof useExtractionFlow>;

/** The extraction flow, from any screen rendered inside App's outlet. */
export function useAppOutlet(): AppOutletContext {
  return useOutletContext<AppOutletContext>();
}
