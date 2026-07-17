# Deploying Parsley

Parsley is a React SPA (`frontend/`) talking to a FastAPI backend (`backend/`).

- **Production → Vercel**, as one project with two [services](https://vercel.com/docs/services)
  (frontend + backend) defined in the root `vercel.json`. Vercel builds each
  service separately, so a frontend-only change doesn't rebuild the backend.
- **Local development → Docker Compose** (`make start`), with hot reload for both
  services. See [Local development](#local-development) below.

Everything is **same-origin**: the SPA calls **relative** `/api/*`, and a rewrite
routes `/api` to the backend service. No `VITE_API_BASE`, no CORS.

---

## Production — Vercel (single project, two services)

The root `vercel.json` declares both services and the rewrites that expose them:

```jsonc
{
  "services": {
    "frontend": {
      "root": "frontend",
      "framework": "vite",
      // SPA history fallback: serve index.html for client-side routes (/paste,
      // /recipe?url=…) so a hard load / refresh isn't a 404. Routing *into* a
      // service is final — an unmatched path does NOT fall back to the top-level
      // rewrites, so the fallback has to live inside the service. Static files
      // (assets, index.html) are served before rewrites, so only fileless paths
      // hit this. /api never reaches here (routed to backend first). See
      // https://vercel.com/docs/services/routing.
      "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
    },
    "backend": {
      "root": "backend",
      "framework": "fastapi",
      "entrypoint": "app.main:app",       // FastAPI app is at backend/app/main.py
      "functions": { "app/main.py": { "maxDuration": 30 } }  // ~10s fetch headroom
    }
  },
  "rewrites": [
    { "source": "/api(/.*)?", "destination": { "service": "backend" } },
    { "source": "/(.*)", "destination": { "service": "frontend" } }
  ]
}
```

> **SPA deep links.** The frontend service's own `rewrites` entry is what makes
> `/paste` and `/recipe?url=…` survive a refresh or a shared link. Without it the
> React Router routes 404 on hard load — Vite dev/preview fall back to
> `index.html` automatically, but the Vercel service does not. Verify on a preview
> deployment by loading a `/recipe?url=…` link directly.

- One Vercel project, pointed at the repo root. Import it and deploy — the
  services and routing come from `vercel.json`.
- The backend installs `backend/requirements.txt` (see the regeneration note
  below); the frontend builds with Vite.
- Because both services share one origin, there is **no env var to set** for the
  app to work — the frontend's relative `/api/*` calls are rewritten to the
  backend service.

> ⚠️ **Rate limiting is degraded on serverless.** `app/main.py` uses `slowapi`
> with in-memory counters. On Vercel Functions those counters aren't shared
> across invocations/instances, so the `10/minute` limit is effectively
> best-effort. Fine for a low-traffic demo; for real enforcement, move slowapi to
> a shared store (e.g. Upstash Redis via `storage_uri`).

> **Note on `entrypoint`.** `app.main:app` is a module:attribute spec pointing at
> the `app` instance in `backend/app/main.py`. If the first deploy can't find the
> app, that's the value to double-check.

### First-deploy checklist

1. Import the repo as one Vercel project (root directory = repo root).
2. Deploy. Open the deployment URL and extract a recipe.
3. Watch the backend service's function logs on the first request — cold-start
   import and page-fetch timing are the two things worth eyeballing.

---

## Local development

`docker-compose.yml` runs the backend (`uvicorn --reload`) and frontend (Vite HMR)
in containers with the source live-mounted. Edit on the host, see changes
immediately.

```bash
make start            # build + start both (docker compose up -d --build)
make logs             # follow logs (S=backend|frontend to scope)
make status           # docker compose ps
make restart          # restart containers (S=… to scope)
make stop             # stop + remove (make stop S=backend to stop just one)
```

- Frontend: http://localhost:5173 — the Vite dev server proxies `/api` to the
  `backend` service (`VITE_API_PROXY` in the compose file).
- Backend API: http://localhost:8000 (e.g. http://localhost:8000/docs).
- Non-Docker fallback: `make dev-backend` / `make dev-frontend`.

### WSL + Docker Desktop credential helper (handled automatically)

Under WSL, Docker Desktop writes a Windows credential helper
(`"credsStore": "desktop.exe"`) into `~/.docker/config.json` that BuildKit can't
exec, which otherwise breaks every Compose build with:

```
error getting credentials - err: ... docker-credential-desktop.exe: exec format error
```

The `make` targets sidestep this: they run `docker compose` against a project-local
`.docker/config.json` (gitignored, regenerated each run by `scripts/docker-config.py`)
with the credential helpers stripped, so anonymous pulls of the public base images
just work. This is scoped to `make` and self-heals if Docker Desktop re-adds the
helper — no manual config editing needed.

If you run `docker compose` **directly** (not via `make`) and hit the error, either
use the `make` targets or drop the helper from your global config: set
`~/.docker/config.json` to `{}`.

---

## Regenerating `backend/requirements.txt`

Vercel installs the backend from `backend/requirements.txt`, exported from the uv
lockfile. Regenerate it after changing dependencies:

```bash
cd backend
uv export --no-dev --no-hashes --no-emit-project -o requirements.txt
```
