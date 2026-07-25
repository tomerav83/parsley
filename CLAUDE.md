# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Parsley extracts clean recipes from noisy recipe pages. React/Vite/TS SPA (`frontend/`) + FastAPI backend (`backend/app/`), always same-origin: the SPA calls relative `/api/*`; Vercel (prod) or nginx (local QA, :8080) rewrites to the backend. The API error contract lives in root `contract.json`, asserted by tests on both sides.

## Commands

- Dev stack: `make start` (Docker, hot reload both services; `S=backend|frontend` targets one)
- Backend (from `backend/`): `uv run pytest` · `uv run ruff check .` · `uv run pyright`
- Frontend (from `frontend/`): `npm test` (unit + browser projects) · `npm run lint` · `npm run test:vrt` (Argos holds VRT baselines — none in git)
- Both sides: `make lint` / `make format` / `make test`
- Load tests: local only (`make loadtest-smoke`, see LOADTEST.md)

## Conventions

- Frontend: one folder per component, no barrel files, co-located tests, `@/` aliases `src/`. Test environments: node `unit` project (`*.test.ts`) vs real-Chromium `browser` project (`*.test.tsx`).
- Backend: environment variables are read only in `app/config.py`; none are required (`.env.example`). `LOADTEST_*` vars must never be set in production.
- Docs: DEPLOY.md (Vercel + local compose details), LOADTEST.md (k6 harness), PLAN.md / REFACTOR.md (working notes).
