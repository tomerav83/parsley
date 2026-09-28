# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

Parsley extracts clean recipes from noisy recipe pages: a React/Vite/TS SPA
(`frontend/`) plus a FastAPI backend (`backend/app/`). Start with
[docs/architecture.md](docs/architecture.md); reach for
[docs/decisions.md](docs/decisions.md) before re-litigating a design choice.

## Commands

- Dev stack: `make start` (Docker, hot reload both services; `S=backend|frontend`
  targets one). `make rebuild` after a dependency change.
- Backend, from `backend/`: `uv run pytest` · `uv run ruff check .` · `uv run pyright`
- Frontend, from `frontend/`: `npm test` (unit + browser projects) · `npm run lint` ·
  `npm run test:vrt`
- Both sides: `make lint` / `make format` / `make test` (backend only)
- Load tests: local only — `make loadtest-smoke`, see [docs/load-testing.md](docs/load-testing.md)

## Invariants

Break one of these and something fails in a way that isn't obvious locally.

- **Same-origin.** The SPA calls relative `/api/*`. Never introduce an API base
  URL or CORS config; routing lives in `vercel.json`, `nginx.conf` and the Vite
  dev proxy, and all three must agree.
- **`contract.json` is the contract.** Changing the `Recipe` shape or an error
  code means editing `contract.json`, `backend/app/models.py` and
  `frontend/src/lib/api.ts` together — tests on both sides fail otherwise.
- **Environment variables are read only in `backend/app/config.py`.** None are
  required.
- **Test-harness overrides stay out of `backend/app/`.** The load test lifts the
  SSRF guard and rate limiter in `loadtest/backend_app.py`, which is never
  deployed. Don't add env flags that switch safety rails off in production code.
- **No test touches the network.** Backend extraction tests use HTML fixtures
  under `backend/tests/fixtures/`; `respx` mocks httpx; `ExtractionService` takes
  injected fakes.
- **The recipe view stays code-split.** `.oxlintrc.json` bans static imports of
  `@/features/recipe/**` and `**/screens/RecipeScreen/**`; only
  `app/router/router.tsx` may import them, dynamically.
- **Don't hand-edit coverage thresholds** in `vitest.config.ts` — they
  auto-update. Run `npm run test:coverage` and commit what it writes.

## Conventions

- Frontend: one folder per component, no barrel files, tests co-located, `@/`
  aliases `src/`, CSS Modules. The layout is moving to pages-first
  (`app → pages → features → {navigation, api, ui}`). Place new or moved code by
  the target tree in [decisions.md #31](docs/decisions.md#31--frontend-layout-pages-first-shared-code-in-leaves).
- Test environments: node `unit` project (`*.test.ts`) for pure logic vs
  real-Chromium `browser` project (`*.test.tsx`) for anything needing layout,
  `ResizeObserver`, `matchMedia` or `inert`. Web-Storage-only logic can use a
  per-file jsdom docblock.
- Backend: routes stay thin — parse the request, return `ExtractionService`'s
  result. New error types subclass `AppError` with a `code` and a `status`.
- Commits: Conventional Commits, short-lived branches, PR into `master`.
