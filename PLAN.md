# Parsley — Recipe Extractor Web App: Project Plan

## Context

Recipe sites bury the actual recipe under long personal stories. Parsley lets a user paste any recipe URL and get back just the clean recipe (ingredients, steps, times, yield). The extraction insight is already researched: ~95% of recipe sites embed a `schema.org/Recipe` JSON-LD object (for Google rich results), so one standards-based parser covers nearly every site — no per-site scrapers, no LLM calls.

This is also a portfolio project: the stack and structure are chosen to demonstrate real web development experience, and the app should be usable by others (live demo + self-hostable).

## Stack (decided)

- **Backend:** Python 3.12+, **FastAPI** + uvicorn, `httpx` for fetching, `recipe-scrapers` (with `supported_only=False`) as the extractor. Package management with `uv`.
- **Frontend:** **React + Vite + TypeScript**, plain CSS or Tailwind. Talks to the backend via JSON API.
- **Scope v1:** stateless — no database, no accounts. Phase 2 (later): saved recipe box with Postgres + auth.
- **Distribution:** Dockerfile + docker-compose for self-hosting, plus free-tier deployment (Render or Fly.io) as a live demo.

## Repository layout

```
parsley/
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI app, CORS, routes
│   │   ├── models.py          # Pydantic models: Recipe, ExtractRequest, ErrorResponse
│   │   ├── extractor.py       # fetch + extract pipeline
│   │   └── normalize.py       # instruction/duration/yield normalization
│   ├── tests/                 # pytest, fixture HTML files (no network in tests)
│   └── pyproject.toml
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── api.ts             # typed client for POST /api/extract
│   │   └── components/        # UrlForm, RecipeCard, IngredientList, StepList, ErrorBanner
│   └── package.json
├── docker-compose.yml
├── Dockerfile                 # multi-stage: build frontend → serve via FastAPI static files
├── CLAUDE.md                  # update from placeholder once scaffolded
└── README.md                  # screenshots, live demo link, self-host instructions
```

## Backend design

**API:** `POST /api/extract` with `{"url": "..."}` → normalized `Recipe` JSON:
`{ name, image, author, ingredients: string[], steps: string[], prep_time_minutes, cook_time_minutes, total_time_minutes, yield, source_url, site_name }`
Plus `GET /api/health`. FastAPI auto-serves OpenAPI docs at `/docs`.

**Extraction pipeline** (`extractor.py`):
1. Validate URL (http/https only; reject private/loopback hosts — SSRF guard).
2. Fetch with `httpx` using a real browser User-Agent (many sites block default headers), timeout ~10s, follow redirects.
3. Extract with `recipe_scrapers.scrape_html(html, org_url=url, supported_only=False)` — sole extraction path for v1 (a hand-rolled JSON-LD fallback can be added later if real-world failures warrant it).
4. Normalize (`normalize.py`):
   - `recipeInstructions`: plain string, list of strings, or `HowToStep`/`HowToSection` objects → flat step list.
   - ISO-8601 durations (`PT30M`) → minutes.
   - `recipeYield` string-or-list → string.
5. Structured errors: fetch failed / blocked (403), no recipe markup found, invalid URL — each with a distinct error code so the frontend can show useful messages.

**Tests:** pytest with saved HTML fixtures from a handful of real recipe sites (JSON-LD variants: top-level, `@graph`, HowToStep lists, string instructions) — extraction tested offline, no live network.

## Frontend design

Single page: URL input + submit → loading state → **RecipeCard** (title, image, meta row with times/yield, ingredients checklist, numbered steps, link to original). Error banner for the structured error codes. Print-friendly CSS so a recipe prints as one clean page. Mobile-responsive.

## Deployment

- **Dockerfile (multi-stage):** stage 1 builds the Vite frontend; stage 2 runs FastAPI serving `/api/*` plus the built static files — one container, one URL, no CORS issues in production.
- **docker-compose.yml** for one-command self-hosting; README documents `docker compose up`.
- **Live demo:** deploy the container to Render free tier (or Fly.io). Link it in the README.

## Code quality & formatting

- **Backend:** `ruff` for linting + formatting (single tool, replaces black/flake8/isort), config in `pyproject.toml`. `mypy` (or ruff's type-aware rules) optional stretch.
- **Frontend:** `eslint` (typescript-eslint) + `prettier`, wired as `npm run lint` / `npm run format`.
- **Pre-commit hooks:** `pre-commit` framework running ruff, prettier, and eslint on staged files — quality enforced locally before it ever reaches CI.
- Unified entry points documented in CLAUDE.md/README: `make lint`, `make test`, `make format` (simple Makefile at repo root delegating to backend/frontend).

## Git workflow & CI/CD

- **Branch model:** trunk-based — `master` is always deployable; work happens on short-lived feature branches (`feat/...`, `fix/...`) merged via PR. Conventional Commits style messages (`feat:`, `fix:`, `chore:`) for a readable history.
- **CI (GitHub Actions, `.github/workflows/ci.yml`):** on every PR and push to master:
  1. Backend: ruff check + pytest
  2. Frontend: eslint + `tsc --noEmit` + vite build
  3. Docker image builds successfully
  Branch protection on `master`: CI must pass before merge.
- **CD (GitOps-style):** merge to `master` = deploy. Render/Fly.io auto-deploys from the master branch (or a `deploy.yml` workflow builds the image and triggers the deploy). The repo is the single source of truth for what's running — no manual deploy steps.
- **Dependency hygiene:** Dependabot enabled for pip, npm, GitHub Actions, and Docker base images.

## Security

- **SSRF guard:** the app fetches user-supplied URLs — validate scheme (http/https only) and resolve the hostname, rejecting private/loopback/link-local ranges (127.0.0.0/8, 10/8, 172.16/12, 192.168/16, 169.254/16, ::1) *after* DNS resolution; also cap redirects and re-check the final host.
- **Input limits:** request body size cap, response download cap (~2–3 MB), fetch timeout (~10 s) — prevents abuse as a proxy/downloader.
- **Rate limiting:** per-IP limit on `/api/extract` (`slowapi`) so the free-tier demo can't be farmed.
- **Output safety:** extracted recipe fields are rendered as text in React (which escapes by default — no `dangerouslySetInnerHTML`); strip HTML tags from JSON-LD string fields server-side.
- **Headers/CORS:** CORS locked to the frontend origin in dev; same-origin in production (single container). Standard security headers on responses.
- **CI security checks:** `pip-audit` / `npm audit` step in CI; GitHub secret scanning + Dependabot alerts enabled. No secrets in the repo — the app needs none in v1.

## Claude Code setup (developer-experience layer)

Once the scaffold exists, wire the repo up so Claude Code sessions are productive from the first prompt:

- **CLAUDE.md (replace placeholder):** exact commands (`make lint`, `make test`, `uv run uvicorn app.main:app --reload`, `npm run dev`), the architecture in two lines (FastAPI serves `/api/*`; React SPA in `frontend/`), and the key gotcha (extraction tests use offline HTML fixtures — never add tests that hit the network).
- **Format-on-edit hook:** `PostToolUse` hook on `Write|Edit` in `.claude/settings.json` that runs `ruff format` on touched `.py` files and `prettier --write` on touched `.ts/.tsx` files — Claude's edits always land pre-formatted, so pre-commit/CI never trip on formatting.
- **Permission allowlist:** commit `.claude/settings.json` with allow rules for the safe everyday commands (`uv run pytest`, `ruff`, `npm run lint`, `npm run build`, `make *`) to cut permission prompts.
- **Project verify skill:** `.claude/skills/verify/SKILL.md` describing how to prove a change works end-to-end (start backend, run frontend, POST a fixture URL to `/api/extract`, check the card renders) — lets `/verify` do a real check instead of guessing.
- **Fixture-adding skill:** `.claude/skills/add-fixture/SKILL.md` for the recurring workflow "save this recipe URL's HTML as a test fixture and write the expected-output test" — the most repeated task in this project.
- **Workflow habits:** plan mode for features, `/code-review` before merging PRs, conventional-commit messages (already in the git workflow section).

## Implementation order

1. Scaffold backend (`uv init`, FastAPI skeleton, health route) + ruff config, commit.
2. Set up tooling early: pre-commit hooks, Makefile, GitHub Actions CI skeleton — so every later step lands through the quality gate.
3. Extraction pipeline + normalization + pytest fixtures — the core value, done early.
4. `POST /api/extract` route wiring + error codes + SSRF guard + rate limiting.
5. Scaffold frontend (Vite React-TS) with eslint/prettier, URL form + API client + RecipeCard.
6. Polish: loading/error states, print CSS, responsive layout.
7. Dockerfile + compose, verify `docker compose up` end-to-end.
8. CD wiring: deploy live demo from master (Render/Fly.io), enable branch protection + Dependabot.
9. README with screenshots + live demo link.
10. Claude Code layer: replace CLAUDE.md placeholder with real commands, add format-on-edit hook + permission allowlist in `.claude/settings.json`, create the verify and add-fixture skills.

## Verification

- `pytest` in `backend/` — extraction fixtures pass.
- Run backend (`uvicorn app.main:app`) + frontend (`npm run dev`), paste 3–5 real recipe URLs from different sites (e.g. AllRecipes, Serious Eats, a WordPress food blog), confirm clean ingredients/steps/times render.
- Try failure cases: a non-recipe URL, an invalid URL — confirm friendly errors.
- `docker compose up` from a clean checkout → app works at `localhost` end-to-end.

## Phase 2 (not in this plan's scope, noted for the roadmap)

Saved recipe box: Postgres + SQLAlchemy, user accounts (session or JWT auth), "save this recipe" button, personal collection page. Adds database + auth experience to the resume story.
