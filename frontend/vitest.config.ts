import { fileURLToPath, URL } from 'node:url'
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
          browser: {
            enabled: true,
            provider: 'playwright',
            headless: true,
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
})
