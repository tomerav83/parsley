# Parsley

Paste a recipe URL, get the clean recipe back — ingredients, method, times and
yield, lifted out of the essay and the ads.

Almost every recipe site already embeds its recipe as `schema.org/Recipe` JSON-LD
so Google can show a rich result. Parsley reads that. One standards-based path,
no per-site scrapers, no LLM. See [why this exists](docs/motivation.md).

## Quick start

Prerequisites: Docker (with Compose) and `make`. No environment variables and no
secrets are required — everything runs on defaults, and `.env.example` documents
the optional knobs.

```sh
make start
```

- App (Vite dev server, HMR): http://localhost:5173
- Same-origin QA (nginx, mirrors production routing): http://localhost:8080
- API (OpenAPI docs at `/docs`): http://localhost:8000

## Commands

| Command | What it does |
| --- | --- |
| `make start` / `stop` / `restart` | Dev stack up/down (`S=backend\|frontend` targets one service) |
| `make rebuild` | Rebuild images — after a new dependency or a `Dockerfile.dev` change |
| `make logs` / `make status` | Tail container logs / list containers |
| `make lint` / `make format` | Ruff (backend) + oxlint and prettier (frontend) |
| `make test` | Backend tests (`uv run pytest`) |
| `make build` | Production frontend build |
| `make loadtest-smoke` (and friends) | k6 load tests, **local only** — see [load testing](docs/load-testing.md) |

From `frontend/`: `npm test` runs the unit and real-Chromium projects — needs
`npx playwright install chromium` once. From `backend/`: `uv run pytest`,
`uv run ruff check .`, `uv run pyright`.

Production deploys from the connected Vercel project — see
[deploy.md](docs/deploy.md).

## Architecture

A React/TypeScript SPA (`frontend/`) and a FastAPI backend (`backend/app/`),
always served from one origin: the SPA calls relative `/api/*` and a rewrite
routes it to the backend — Vercel in production, nginx locally. No CORS, no API
base URL. `contract.json` pins the API shape and error taxonomy, and is asserted
by tests on both sides. The backend holds no state.

CI runs lint, typecheck, tests, a smoke load test, visual regression via Argos
and a Lighthouse budget.

## Docs

| | |
| --- | --- |
| [motivation.md](docs/motivation.md) | The problem, the goals, the non-goals, what's next |
| [architecture.md](docs/architecture.md) | How the system fits together, request path, module layout |
| [implementation.md](docs/implementation.md) | How the pieces work: extraction, fetching, the UI flow, tests |
| [decisions.md](docs/decisions.md) | Why it's built this way, what was rejected, what would reopen it |
| [deploy.md](docs/deploy.md) | Vercel production and the local Compose stack |
| [load-testing.md](docs/load-testing.md) | The k6 harness, KPIs and recorded baselines |
| [visual-regression.md](docs/visual-regression.md) | How the screenshot suite works and how to change a component's look |

## License

MIT — see [LICENSE](LICENSE).
