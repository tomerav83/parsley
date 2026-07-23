// The screen "filmstrip": each entry's `order` is its position on the forward
// axis (higher = further in). That order is the single source the transition
// layer reads — the slide direction (App stamps data-slide off it) and the
// POP-wave direction both derive from here, rather than from a switch duplicated
// across files. The routes themselves are declared in app/router/router.tsx; this
// is only their transition metadata.
export const EXTRACT_PATH = "/extract";

const SCREENS: ReadonlyArray<{
  match: (pathname: string) => boolean;
  order: number;
}> = [
  { match: (p) => p.startsWith("/recipe"), order: 2 },
  { match: (p) => p.startsWith("/paste"), order: 1 },
  { match: (p) => p.startsWith(EXTRACT_PATH), order: 1 },
];

// Filmstrip index for a pathname; home — and anything unlisted — is 0.
export function screenOrder(pathname: string): number {
  return SCREENS.find((screen) => screen.match(pathname))?.order ?? 0;
}
