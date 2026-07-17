# Visual regression tests

`*.vrt.tsx` specs screenshot a component and compare it against a committed
baseline PNG (REDESIGN E7). They catch what behaviour tests structurally can't:
a dropped CSS rule, a token hardcoded back to a literal, text that clips or
reflows. Everything else in `frontend` is asserted by role and doesn't care how it
looks — this is the only thing that does.

## Running them

```sh
npm test          # unit + browser. What you run day to day. No VRT.
npm run test:vrt  # the VRT project. Expect it to FAIL locally — see below.
```

VRT is deliberately outside `npm test`. A pixel baseline depends on the machine
that rendered it, so it only passes on a CI runner; folding it into the default
suite would give every developer a permanently red local run, which is the fastest
way to get a VRT suite deleted rather than fixed. CI runs it as its own step.

Running it locally is still useful — to see a diff, or to eyeball a new component —
just don't trust a red result, and **don't commit locally-generated baselines**.

## Changing a component's appearance on purpose

The VRT step goes red. That's the design: it's asking you to confirm the change was
intended.

1. Push the branch.
2. Run the **Update screenshots** workflow (Actions → Update screenshots → Run
   workflow, on your branch), or `gh workflow run update-screenshots.yml --ref <branch>`.
3. It re-mints the baselines on a CI runner and commits them to your branch.
4. Review the PNG diff in the PR like any other change.

It refuses to run on the default branch: baselines belong to the branch that
changes the UI, where a reviewer can see them.

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
- **Animations** are disabled by Playwright's screenshot by default, with a CSS
  freeze in `vrt.ts` as belt-and-braces. A baseline is a resting frame; motion is
  out of scope.
- **Theme, DPR and reduced-motion** are pinned in `vitest.config.ts` rather than
  inherited from the host, which would otherwise mint inverted or double-size
  baselines on the wrong machine. Dark mode is an explicit spec, not an accident
  of the developer's OS.
- Vitest re-captures until two consecutive shots match, and `renderStill`
  (`still.tsx`) waits on fonts, image `decode()`, and two frames of layout before
  the matcher ever looks.

Comparison is pixelmatch, which ignores anti-aliased pixels by default. No
mismatch tolerance is set: with the above pinned, a diff means something changed.

## Where the files live

Vitest writes both baselines and on-failure shots under `__screenshots__/`, split
by the test file that produced them, so `.gitignore` splits them the same way:

- `__screenshots__/*.vrt.tsx/` — **committed** baselines. The reference.
- `__screenshots__/*.test.tsx/` — ignored. Throwaway shots from failed behaviour
  tests.
- `.vitest-attachments/` — ignored. The actual/diff images from a failed
  comparison; CI uploads them as the `vrt-diffs` artifact.

The `vrt` project sets `screenshotFailures: false` so a failure can't drop a
generic shot into the committed baseline directory.
