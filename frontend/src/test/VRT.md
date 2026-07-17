# Visual regression tests

`*.vrt.tsx` specs screenshot a component and Argos compares it against the
baseline (REDESIGN E7). They catch what behaviour tests structurally can't: a
dropped CSS rule, a token hardcoded back to a literal, text that clips or reflows.
Everything else in `frontend` is asserted by role and doesn't care how it looks —
this is the only thing that does.

**No reference images live in this repo.** Argos stores the baselines and does the
diffing, so nothing binary is committed and history doesn't grow by a megabyte
every time the UI legitimately changes.

## Running them

```sh
npm test          # unit + browser. What you run day to day. No screenshots.
npm run test:vrt  # capture the screenshots. Uploads only on CI.
```

Locally this just writes PNGs to `frontend/snapshots/` (gitignored) and compares
nothing — there's no baseline on your machine. It's a smoke test that capture
works; the actual diff happens on CI. Run it if you want to eyeball a component in
isolation.

## Changing a component's appearance on purpose

Argos posts its own PR check. When a screenshot moves, that check goes red and
links to a side-by-side diff — approve or reject it there. Approving updates the
baseline. Nothing to regenerate, commit, or rebase.

CI's own "Visual regression" step only proves capture worked; it stays green even
when the UI changed. **The visual verdict is the Argos check, not the CI step.**

## Setup (one-time)

CI authenticates with **GitHub OIDC** — there is no `ARGOS_TOKEN` secret to
manage. It needs `id-token: write` on the job (set in `ci.yml`) plus, on the Argos
side: Project Settings → Authentication → enable **GitHub OIDC**. Fork PRs, where
GitHub blocks both OIDC and secrets, fall back to tokenless automatically, so
outside contributors get visual checks without being handed credentials.

Until the Argos project exists and is linked to this repo, the upload fails and
the CI step is red.

## How this avoids being flaky

E7's premise is that VRT done wrong is worse than none, so each source of
nondeterminism is closed rather than papered over with a mismatch tolerance:

- **The rAF sprig canvas** (`Background`) redraws every frame and would poison any
  shot it appears in. Shooting at the _component_ level keeps it out of frame
  structurally — it's never mounted — rather than masking it after the fact.
- **Fonts** are self-hosted woff2, so nothing depends on what's installed on the
  host. They're force-loaded before the first spec (`vrt.ts`) because
  `document.fonts.ready` only settles loads already pending, and swap-mode
  `@font-face` doesn't start one until a glyph needs the family. This matters more
  than usual here: `MethodSteps` measures text and shrinks it to fit, so fallback
  metrics don't just reflow, they change the fitted font size.
- **Font rasterisation** is pinned by Argos' documented Chromium flags
  (`--disable-lcd-text`, `--font-render-hinting=none`), which take subpixel
  antialiasing and hinting — both host-dependent — out of the picture.
- **Animations** are disabled by the screenshot itself, with a CSS freeze in
  `vrt.ts` as belt-and-braces. A baseline is a resting frame; motion is out of
  scope.
- **Theme and DPR** are pinned in `vitest.config.ts` rather than inherited from
  the host. Dark mode is an explicit spec, not an accident of the developer's OS.
- `renderStill` (`still.tsx`) waits on fonts, image `decode()`, and two frames of
  layout; Argos then stabilises again before capturing.

Because every capture happens on CI and is compared against a baseline captured
the same way, dev-box-versus-CI font rendering — the classic reason pixel suites
get muted — never enters into it.

## Writing a spec

Argos takes a **CSS selector**, not an element: a Locator can't be serialized
across the browser/node boundary. `renderStill` mounts into a marked wrapper and
returns a selector for the component root inside it.

```tsx
const target = await renderStill(<RecipeCard recipe={RECIPE} />, {
  width: 1280,
  height: 900,
});
await argosScreenshot("RecipeCard/desktop-hero", { element: target });
```

Name every shot `Component/case`: Argos names are **global across the build**, not
per-file like Vitest snapshots.

`FloatingError` is the exception — it's `position: fixed`, so its wrapper has no
useful box and the specs target `[role="alertdialog"]` / `button[aria-expanded]`
directly.
