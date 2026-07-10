.PHONY: dev-backend dev-frontend start stop restart status logs lint format test build

dev-backend:
	cd backend && CORS_ORIGINS=http://localhost:5173 uv run uvicorn app.main:app --reload

dev-frontend:
	cd frontend && npm run dev

# Background service manager (both services at once). Pass S=backend|frontend
# to target a single service, e.g. `make restart S=backend`.
start:
	./scripts/services.sh start $(or $(S),all)

stop:
	./scripts/services.sh stop $(or $(S),all)

restart:
	./scripts/services.sh restart $(or $(S),all)

status:
	./scripts/services.sh status $(or $(S),all)

logs:
	./scripts/services.sh logs $(or $(S),backend)

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
