import { fileURLToPath, URL } from 'node:url'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

// The `@/ → src/` alias. Each project spawns its own Vite resolver and does NOT
// inherit a root-level `resolve.alias`, so it's applied per-project below (and at
// the root for good measure).
const alias = { '@': fileURLToPath(new URL('./src', import.meta.url)) }

// Vitest config, kept separate from vite.config.ts on purpose: importing
// `vitest/config` pulls in Vitest's own bundled Vite types, which don't line up
// with the app's Vite 8 (rolldown) plugin types — mixing them in one file makes
// `tsc` reject the config. JSX in tests is transformed by esbuild via tsconfig
// (`jsx: react-jsx`), so the React plugin isn't needed for the test build.

// Real-Chromium browser config, shared by the `browser` and `vrt` projects. Since
// Vitest 4 the provider is a factory from its own package rather than the v3
// `provider: 'playwright'` string, and per-instance `launch` has moved up into the
// factory. https://vitest.dev/guide/migration
type ContextOptions = NonNullable<Parameters<typeof playwright>[0]>['contextOptions']

const chromium = (contextOptions?: ContextOptions) => ({
  enabled: true,
  provider: playwright({ contextOptions }),
  headless: true,
  instances: [{ browser: 'chromium' as const }],
})

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        // Pure-logic tests (parser, schema, reducers) — fast, no DOM.
        resolve: { alias },
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        // Component/interaction tests — real Chromium via Playwright, so
        // ResizeObserver, matchMedia, layout and inert all behave for real.
        resolve: { alias },
        test: {
          name: 'browser',
          include: ['src/**/*.test.tsx'],
          setupFiles: ['./src/test/setup.ts'],
          browser: chromium(),
        },
      },
      {
        // Visual regression (REDESIGN E7). Unlike every other project here, the
        // result depends on the MACHINE as much as the code — font rasterisation
        // differs between a dev box and CI — so baselines are minted and verified
        // only in the pinned CI container, and this project is excluded from the
        // default `npm test`. See vrt/README.md.
        resolve: { alias },
        test: {
          name: 'vrt',
          include: ['src/**/*.vrt.tsx'],
          setupFiles: ['./src/test/setup.ts', './src/test/vrt.ts'],
          browser: {
            ...chromium({
              // Pin the context-level sources of drift. deviceScaleFactor: a 2x
              // host would mint double-resolution baselines. reducedMotion: the
              // app branches on it in three places (index.css, MethodSteps,
              // Background), so leaving it to the host makes the baseline depend
              // on the developer's OS setting; pin the majority path.
              deviceScaleFactor: 1,
              reducedMotion: 'no-preference',
              // Theme is driven off prefers-color-scheme, so a dark-mode host
              // would otherwise mint inverted baselines. Dark is covered by an
              // explicit [data-theme] case in the specs, not by the host.
              colorScheme: 'light',
            }),
            // A VRT failure already writes actual + diff images to the attachments
            // dir; Vitest's generic on-failure screenshot would add a third image
            // *into the committed baseline directory*, which is exactly where
            // uncommitted noise must not land.
            screenshotFailures: false,
          },
        },
      },
    ],
  },
})
