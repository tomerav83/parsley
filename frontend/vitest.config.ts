import { fileURLToPath, URL } from "node:url";
import { argosVitestPlugin } from "@argos-ci/vitest/plugin";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

// The `@/ → src/` alias. Each project spawns its own Vite resolver and does NOT
// inherit a root-level `resolve.alias`, so it's applied per-project below.
const alias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };

// Vitest config, kept separate from vite.config.ts on purpose: importing
// `vitest/config` pulls in Vitest's own bundled Vite types, which don't line up
// with the app's Vite 8 (rolldown) plugin types — mixing them in one file makes
// `tsc` reject the config. JSX in tests is transformed by esbuild via tsconfig
// (`jsx: react-jsx`), so the React plugin isn't needed for the test build.

// Real-Chromium browser config, shared by the `browser` and `vrt` projects. Since
// Vitest 4 the provider is a factory from its own package rather than the v3
// `provider: 'playwright'` string, and per-instance `launch` has moved up into the
// factory. https://vitest.dev/guide/migration
type PlaywrightOptions = Parameters<typeof playwright>[0];

const chromium = (options?: PlaywrightOptions) => ({
  enabled: true,
  provider: playwright(options),
  headless: true,
  instances: [{ browser: "chromium" as const }],
});

export default defineConfig({
  test: {
    // `coverage` is process-wide, not per-project (Vitest's `NonProjectOptions`),
    // so it lives here rather than inside `unit`/`browser` below — and is
    // collected only when `vitest run` is invoked with `--project unit --project
    // browser`. `vrt`'s screenshot specs are deliberately never included: they
    // mount components to diff pixels, not to exercise branches, and folding them
    // in would inflate the number for free (a component can hit ~90% line
    // coverage from being screenshotted once, with zero behavior asserted —
    // https://rangle.io/blog/component-test-coverage).
    //
    // `coverage.include` is required, not optional: Vitest 4 removed `coverage.all`,
    // and without `include` a file with zero tests is invisible to the report
    // rather than counted as 0%. https://vitest.dev/guide/migration (§"Removed
    // Options coverage.all and coverage.extensions")
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: [
        "src/**/*.test.*",
        "src/**/*.vrt.*",
        "src/test/**",
        "src/main.tsx", // bootstrap/mount — no branching logic to cover
        "src/app/router/router.tsx", // declarative route table, wired only by main.tsx — no logic to cover
        "src/**/*.d.ts",
      ],
      // json-summary + json are read by the CI PR-comment action (Phase 5 G2):
      // json-summary for the headline numbers, json for its per-file diff view.
      // https://github.com/davelosert/vitest-coverage-report-action#usage
      reporter: ["text", "html", "json-summary", "json", "lcov"],
      reportOnFailure: true,
      thresholds: {
        // Ratchet, not a fixed bar: `autoUpdate` rewrites these numbers upward
        // whenever a run exceeds them, so CI only fails on a *regression* — never
        // on the codebase being imperfect. Chosen over a static target because a
        // static gate above today's baseline blocks every PR until someone pays
        // down the whole backlog first, and one set below it is a no-op.
        // https://vitest.dev/config/coverage (thresholds.autoUpdate)
        autoUpdate: true,
        // Rewritten by `autoUpdate` as coverage rises — don't hand-edit these,
        // just run `npm run test:coverage` and let it update the file. Measured
        // 57.27/45.16/48.93/55.53 before Phase 5's G4 tests landed; these
        // reflect that work. See REDESIGN.md Phase 5.
        lines: 98.41,
        branches: 89.87,
        functions: 97.23,
        statements: 97.03,
      },
    },
    projects: [
      {
        // Pure-logic tests (parser, schema, reducers) — fast, no DOM.
        resolve: { alias },
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        // Component/interaction tests — real Chromium via Playwright, so
        // ResizeObserver, matchMedia, layout and inert all behave for real.
        resolve: { alias },
        test: {
          name: "browser",
          include: ["src/**/*.test.tsx"],
          setupFiles: ["./src/test/setup.ts"],
          browser: chromium(),
        },
      },
      {
        // Visual regression (REDESIGN E7). Captures component screenshots and
        // uploads them to Argos, which holds the baselines and does the diffing —
        // so no reference images live in this repo. See src/test/VRT.md.
        //
        // The plugin is registered on THIS project, not at the root: a project
        // spawns its own Vite instance and doesn't inherit root-level config (the
        // same reason `alias` is repeated above).
        plugins: [
          argosVitestPlugin({
            // Capture always; only CI uploads. There is no ARGOS_TOKEN to gate on
            // — CI authenticates by GitHub OIDC, with a tokenless fallback for
            // fork PRs (where GitHub blocks both OIDC and secrets).
            // https://argos-ci.com/docs/learn/integrations/github-actions-authentication
            uploadToArgos: !!process.env.CI,
          }),
        ],
        resolve: { alias },
        test: {
          name: "vrt",
          include: ["src/**/*.vrt.tsx"],
          setupFiles: ["./src/test/setup.ts", "./src/test/vrt.ts"],
          browser: chromium({
            launchOptions: {
              // Argos' documented flags: take LCD subpixel antialiasing and font
              // hinting — both host/display-dependent — out of the rendering.
              // https://argos-ci.com/docs/quickstart/vitest-quickstart
              args: ["--disable-lcd-text", "--font-render-hinting=none"],
            },
            contextOptions: {
              // Pin the context-level sources of drift. deviceScaleFactor: a 2x
              // host would capture at double resolution. reducedMotion: the app
              // branches on it in three places (index.css, MethodSteps,
              // Background), so leaving it to the host makes the capture depend on
              // the developer's OS setting; pin the majority path.
              deviceScaleFactor: 1,
              reducedMotion: "no-preference",
              // Theme is driven off prefers-color-scheme, so a dark-mode host
              // would otherwise capture inverted. Dark is covered by an explicit
              // [data-theme] case in the specs, not by the host.
              colorScheme: "light",
            },
          }),
        },
      },
    ],
  },
});
