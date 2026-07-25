# Parsley

Paste a recipe URL, get the clean recipe back — Parsley extracts ingredients and method from noisy recipe pages.

## Quick start

Prerequisites: Docker (with Compose) and `make`. No environment variables or secrets are required — everything runs on defaults (`.env.example` documents the optional knobs).

```sh
make start
```

- App (Vite dev server, HMR): http://localhost:5173
- Same-origin QA (nginx, mirrors prod routing): http://localhost:8080
- API: http://localhost:8000

## Commands

| Command | What it does |
| --- | --- |
| `make start` / `stop` / `restart` | Dev stack up/down (`S=backend\|frontend` targets one service) |
| `make rebuild` | Rebuild images (new dependency or Dockerfile change) |
| `make logs` | Tail container logs |
| `make lint` / `make format` | Ruff (backend) + oxlint/prettier (frontend) |
| `make test` | Backend tests (`uv run pytest`) |
| `cd frontend && npm test` | Frontend tests — unit + real Chromium (`npx playwright install chromium` once) |
| `make build` | Production frontend build |
| `make loadtest-smoke` (etc.) | k6 load tests, **local only** — see [LOADTEST.md](LOADTEST.md) |

Production deploys from the connected Vercel project (one project, two services via `vercel.json`) — see [DEPLOY.md](DEPLOY.md).

## Architecture

React/TypeScript SPA (`frontend/`) + FastAPI backend (`backend/app/`), always same-origin: the SPA calls relative `/api/*`, and Vercel (prod) or nginx (`nginx.conf`, local QA) rewrites it to the backend — no CORS, no API base URL. `contract.json` pins the API error contract and is asserted by tests on both sides. `loadtest/` is the k6 harness (`docker-compose.loadtest.yml`); CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests, visual regression via Argos, and a Lighthouse budget.
