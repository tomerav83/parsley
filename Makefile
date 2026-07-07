.PHONY: dev-backend dev-frontend lint format test build

dev-backend:
	cd backend && CORS_ORIGINS=http://localhost:5173 uv run uvicorn app.main:app --reload

dev-frontend:
	cd frontend && npm run dev

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
