.PHONY: docker-config start stop restart rebuild status logs lint format test build \
        loadtest loadtest-smoke loadtest-stress loadtest-spike loadtest-breakpoint loadtest-down

# Run every `docker compose` command against a project-local Docker config with
# credential helpers stripped, so builds work regardless of the global ~/.docker
# config. Under WSL, Docker Desktop's `desktop.exe` credential helper can't exec
# in BuildKit and breaks all pulls; this sidesteps it and self-heals if Docker
# Desktop re-adds it. Scoped to make — your direct `docker` commands are untouched.
# See scripts/docker-config.py and DEPLOY.md.
export DOCKER_CONFIG := $(abspath .docker)

docker-config:
	@mkdir -p "$(DOCKER_CONFIG)"
	@python3 scripts/docker-config.py > "$(DOCKER_CONFIG)/config.json"

# Dockerized dev environment (backend + frontend with hot reload) via
# docker-compose.yml. Pass S=backend|frontend to target a single service,
# e.g. `make restart S=backend` or `make logs S=frontend`.
#
# `make restart` only bounces the existing containers — source edits are already
# picked up by hot reload, so a plain restart is fine day to day. When a change
# needs a fresh image (new dependency, Dockerfile.dev edit), use `make rebuild`
# instead, which rebuilds and recreates the service(s).

# Printed after a (re)start so the app is one click away — skipped when only the
# backend was targeted (S=backend). Most terminals linkify the http:// URL.
FE_URL = $(if $(filter backend,$(S)),,printf '\n🌐 Frontend ready → http://localhost:5173\n🧪 QA (same-origin) → http://localhost:8080\n')

start: docker-config
	docker compose up -d --build $(S)
	@$(FE_URL)

stop: docker-config
	$(if $(S),docker compose stop $(S),docker compose down)

restart: docker-config
	docker compose restart $(S)
	@$(FE_URL)

# Like restart, but rebuilds the image(s) first — for changes a plain restart
# won't pick up (new dependencies, Dockerfile.dev edits).
rebuild: docker-config
	docker compose up -d --build $(S)
	@$(FE_URL)

status: docker-config
	docker compose ps

logs: docker-config
	docker compose logs -f $(S)

lint:
	cd backend && uv run ruff check . && uv run ruff format --check .
	cd frontend && npm run lint && npm run format:check

format:
	cd backend && uv run ruff check --fix . && uv run ruff format .
	cd frontend && npm run format

test:
	cd backend && uv run pytest

build:
	cd frontend && npm run build

# Prod-like load-testing harness (docker-compose.loadtest.yml, LOADTEST.md). k6
# runs on the compose network with SLO thresholds that exit non-zero on breach,
# so a run is its own CI gate. `run` starts the backend + mock upstream and leaves
# them up; `loadtest-down` tears them back down.
LT = docker compose -f docker-compose.loadtest.yml

loadtest-smoke: docker-config
	$(LT) run --rm k6 run /scripts/smoke.js

loadtest: docker-config
	$(LT) run --rm k6 run /scripts/baseline.js

# Stage 3: ramp to 50 VUs on a parse-heavy page to find the degradation shape;
# spike bursts 0→100 VUs (recovery test); breakpoint ramps until it breaks (ceiling).
loadtest-stress: docker-config
	$(LT) run --rm k6 run /scripts/stress.js

loadtest-spike: docker-config
	$(LT) run --rm k6 run /scripts/spike.js

loadtest-breakpoint: docker-config
	$(LT) run --rm k6 run /scripts/breakpoint.js

loadtest-down: docker-config
	$(LT) down
