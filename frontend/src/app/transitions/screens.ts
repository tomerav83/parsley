// The screen filmstrip: `order` is a screen's position on the forward axis, and
// both the slide direction and the POP-wave direction are derived from it. Only
// transition metadata — the routes themselves live in app/router/router.tsx.
export const EXTRACT_PATH = "/extract";

const SCREENS: ReadonlyArray<{
  match: (pathname: string) => boolean;
  order: number;
}> = [
  { match: (p) => p.startsWith("/recipe"), order: 2 },
  { match: (p) => p.startsWith("/paste"), order: 1 },
  { match: (p) => p.startsWith(EXTRACT_PATH), order: 1 },
];

/** Filmstrip position for a pathname. Home, and anything unlisted, is 0. */
export function screenOrder(pathname: string): number {
  return SCREENS.find((screen) => screen.match(pathname))?.order ?? 0;
}
