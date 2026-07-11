import os
from collections.abc import Awaitable, Callable
from typing import Annotated

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.extractor import RecipeNotFoundError, extract_recipe
from app.fetch import FetchError, fetch_page
from app.models import ErrorResponse, ExtractHtmlRequest, ExtractRequest, Recipe

FetchPage = Callable[[str], Awaitable[str]]


def get_fetch_page() -> FetchPage:
    """Injectable page fetcher — overridden in tests via app.dependency_overrides."""
    return fetch_page


limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="Parsley", description="Extract clean recipes from noisy recipe pages")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Cross-origin access is enabled by setting CORS_ORIGINS to the frontend origin(s),
# comma-separated. Needed in the production split deploy where the SPA and API are
# separate hosts (two Vercel projects). In dev the browser reaches the API through
# the Vite proxy, so it's same-origin regardless — CORS_ORIGINS is set in compose
# only for parity / direct API access.
cors_origins = [o for o in os.environ.get("CORS_ORIGINS", "").split(",") if o]
if cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )

# HTTP status per error type: client-fixable problems are 4xx, upstream
# fetch problems are 502 (we act as a gateway to the recipe site).
_ERROR_STATUS = {
    "invalid_url": 400,
    "blocked_url": 400,
    "no_recipe": 422,
    "site_blocked": 502,
    "fetch_failed": 502,
}


def _error_response(code: str, message: str) -> JSONResponse:
    status = _ERROR_STATUS[code]
    return JSONResponse(
        status_code=status, content=ErrorResponse(code=code, message=message).model_dump()
    )


@app.exception_handler(FetchError)
async def fetch_error_handler(_request: Request, exc: FetchError) -> JSONResponse:
    return _error_response(exc.code, str(exc))


@app.exception_handler(RecipeNotFoundError)
async def no_recipe_handler(_request: Request, exc: RecipeNotFoundError) -> JSONResponse:
    return _error_response("no_recipe", "No recipe found on that page")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post(
    "/api/extract",
    response_model=Recipe,
    responses={
        400: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
        502: {"model": ErrorResponse},
    },
)
@limiter.limit("10/minute")
async def extract(
    request: Request,
    payload: ExtractRequest,
    fetch: Annotated[FetchPage, Depends(get_fetch_page)],
) -> Recipe:
    url = str(payload.url)
    html = await fetch(url)
    return extract_recipe(html, url)


@app.post(
    "/api/extract-html",
    response_model=Recipe,
    responses={
        422: {"model": ErrorResponse},
    },
)
@limiter.limit("10/minute")
async def extract_html(request: Request, payload: ExtractHtmlRequest) -> Recipe:
    """Extract from user-pasted page source — the fallback for sites that block
    server-side fetching at the IP level. No network fetch, so no SSRF surface."""
    return extract_recipe(payload.html, str(payload.url))
