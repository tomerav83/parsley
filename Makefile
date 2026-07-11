.PHONY: dev-backend dev-frontend docker-config start stop restart status logs lint format test build

dev-backend:
	cd backend && CORS_ORIGINS=http://localhost:5173 uv run uvicorn app.main:app --reload

dev-frontend:
	cd frontend && npm run dev

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
# For a non-Docker fallback, use `make dev-backend` / `make dev-frontend`.

# Printed after a (re)start so the app is one click away — skipped when only the
# backend was targeted (S=backend). Most terminals linkify the http:// URL.
FE_URL = $(if $(filter backend,$(S)),,printf '\n🌐 Frontend ready → http://localhost:5173\n')

start: docker-config
	docker compose up -d --build $(S)
	@$(FE_URL)

stop: docker-config
	$(if $(S),docker compose stop $(S),docker compose down)

restart: docker-config
	docker compose restart $(S)
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
