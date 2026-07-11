# Deploying Parsley

Parsley is a React SPA (`frontend/`) talking to a FastAPI backend (`backend/`).

- **Production → Vercel**, as two independent projects (frontend + backend). A
  frontend change doesn't redeploy the backend and vice versa.
- **Local development → Docker Compose** (`make start`), with hot reload for both
  services. See [Local development](#local-development) below.

The frontend is origin-agnostic: it calls **relative** `/api/*` by default and
only calls an absolute URL when `VITE_API_BASE` is set — so the split deploy needs
configuration, not code changes.

---

## Production — split deploy on Vercel (two projects)

Both projects live in this one repo; each has its own **Root Directory** so their
deploys are independent.

### 1. Backend project (`parsley-api`)

- **Root Directory:** `backend`
- Vercel auto-detects FastAPI: it finds the `app` instance in `app/main.py` (a
  supported entrypoint) and installs `requirements.txt`. No entrypoint shim or
  rewrites are needed — the app's own `/api/*` routes are served directly.
- `backend/vercel.json` sets the function `maxDuration` to 30s so a slow page
  fetch (~10s) has headroom.
- **Environment variable:**
  - `CORS_ORIGINS` = the frontend's URL, e.g. `https://parsley-web.vercel.app`
    (comma-separated if more than one). This switches on the CORS middleware in
    `app/main.py`.

> ⚠️ **Rate limiting is degraded on serverless.** `app/main.py` uses `slowapi`
> with in-memory counters. On Vercel Functions those counters aren't shared
> across invocations/instances, so the `10/minute` limit is effectively
> best-effort. Fine for a low-traffic demo; for real enforcement, move slowapi to
> a shared store (e.g. Upstash Redis via `storage_uri`).

### 2. Frontend project (`parsley-web`)

- **Root Directory:** `frontend`
- Vercel auto-detects Vite (`npm run build` → `dist`).
- **Environment variable:**
  - `VITE_API_BASE` = the backend's URL, e.g. `https://parsley-api.vercel.app`
    (no trailing slash). Baked in at build time; changing it needs a rebuild.

### 3. Make the deploys independent

Setting each project's Root Directory already scopes most builds. To be certain a
push touching only the other side is skipped, set each project's **Ignored Build
Step** (Settings → Git):

- `parsley-web`: `git diff --quiet HEAD^ HEAD -- frontend`
- `parsley-api`: `git diff --quiet HEAD^ HEAD -- backend`

(The build is skipped when the command exits `0`, i.e. when that directory has no
changes.)

### 4. First-deploy checklist

1. Deploy `parsley-api`, note its URL.
2. Set `VITE_API_BASE` on `parsley-web` to that URL; deploy it, note its URL.
3. Set `CORS_ORIGINS` on `parsley-api` to the `parsley-web` URL; redeploy the API.
4. Open the frontend URL and extract a recipe. Watch the api project's function
   logs on the first request — cold-start import and page-fetch timing are the two
   things worth eyeballing.

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
