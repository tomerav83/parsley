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

The only requirement is an Argos project linked to this repo. **There is no
`ARGOS_TOKEN` secret**, and none is needed: CI uploads _tokenlessly_, and Argos
verifies the build by looking the workflow run up on GitHub's API from the commit,
branch and run id we report. That works because the repo is public, and it works
on fork PRs too — where GitHub blocks secrets and OIDC outright — so outside
contributors get visual checks without being handed credentials.

Until the project exists and is linked, uploads fail with `No Argos project is
linked to this GitHub repository` and the CI step is red.

**Don't add `id-token: write` to the job** unless you have first enabled OIDC at
Argos → Project Settings → Authentication. The SDK picks `ARGOS_TOKEN` > OIDC >
tokenless and considers OIDC "available" merely because the permission is granted,
so granting it against a project with OIDC off fails every run with `GitHub Actions
OIDC authentication is not enabled for this project` instead of falling back.

## Screenshot budget

The free tier is 5,000 screenshots/month and we upload 11 per build, so the ceiling
is ~450 builds/month against a recent rate of ~36 CI runs/month — roughly 8% used.
Argos bills **every screenshot it stores**, not just changed ones ("Usage is billed
only on successful builds"); identical images are deduped for _transfer_ only, so a
re-run is faster but never free. Two guards keep the spend proportionate:

- **Backend-only PRs upload nothing.** A step checks whether the PR touches
  `frontend/` and sets `ARGOS_SKIPPED`, which uploads no screenshots and marks the
  commit green. The specs still run, so a broken spec is still caught — only the
  upload is skipped. Never skipped on `master`: that's the build PR baselines
  resolve from.
- **Superseded PR runs are cancelled** (`concurrency`, workflow level). Cancelling
  is a race rather than a refund — shots already uploaded still count — but it caps
  the waste from a rapid series of pushes. `master` is never cancelled.

Both are deliberately expressed at the **step/job** level rather than as a
workflow-level `paths:` filter: GitHub reports a `paths`-skipped workflow as
_Pending forever_, which would silently block PRs the day branch protection is
turned on (there is none today). A step skipped by `if:` reports Success.

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
