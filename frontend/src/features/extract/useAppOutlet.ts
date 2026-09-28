import { useOutletContext } from "react-router";
import type { useExtractionFlow } from "@/app/transitions/useExtractionFlow.ts";

/** What App passes to `<Outlet context>`: the extraction flow's state and actions. */
export type AppOutletContext = ReturnType<typeof useExtractionFlow>;

/**
 * Reads the extraction flow from inside App's outlet: the route screens and the
 * recipe route's ErrorBoundary.
 *
 * @returns The flow App provides, or `null` (despite the type) when called
 *   outside App's outlet, e.g. from RootError, which renders in App's place.
 */
export function useAppOutlet(): AppOutletContext {
  return useOutletContext<AppOutletContext>();
}
