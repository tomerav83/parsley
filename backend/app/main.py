"""The HTTP surface: parse the request, hand it to ExtractionService, return the result.

Route docstrings below are the public descriptions rendered at /docs, so they're
written for someone calling the API.
"""

from typing import Annotated

from fastapi import Depends, FastAPI, Request, Response
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.models import AppError, ErrorResponse, ExtractHtmlRequest, ExtractRequest, Recipe
from app.rate_limit import limiter
from app.services import ExtractionService

_extraction_service = ExtractionService()


def get_extraction_service() -> ExtractionService:
    """Return the shared service; tests swap it via app.dependency_overrides."""
    return _extraction_service


app = FastAPI(title="Parsley", description="Extract clean recipes from noisy recipe pages")
app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded) -> Response:
    """Return slowapi's 429; it writes the response, FastAPI just needs it registered."""
    return _rate_limit_exceeded_handler(request, exc)


@app.exception_handler(AppError)
async def app_error_handler(_request: Request, exc: AppError) -> JSONResponse:
    """Render any AppError as an ErrorResponse, at the status the exception carries."""
    return JSONResponse(
        status_code=exc.status,
        content=ErrorResponse(code=exc.code, message=exc.detail or str(exc)).model_dump(
            mode="json"
        ),
    )


@app.get("/api/health")
def health() -> dict[str, str]:
    """Liveness check. Always `{"status": "ok"}` if the app is up."""
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
    service: Annotated[ExtractionService, Depends(get_extraction_service)],
) -> Recipe:
    """Fetch a public recipe page and return just the recipe.

    Rate limited to 10 requests a minute per client. Sites that block automated
    readers come back as `site_blocked` — retry that page through
    `/api/extract-html` with the HTML yourself.
    """
    return await service.from_url(str(payload.url))


@app.post(
    "/api/extract-html",
    response_model=Recipe,
    responses={
        422: {"model": ErrorResponse},
    },
)
@limiter.limit("10/minute")
async def extract_html(
    request: Request,
    payload: ExtractHtmlRequest,
    service: Annotated[ExtractionService, Depends(get_extraction_service)],
) -> Recipe:
    """Extract a recipe from page HTML you already have — no fetch.

    The fallback for pages `/api/extract` can't reach. `url` is the page the HTML
    came from; it's kept as the recipe's source link. Rate limited to 10 a minute.
    """
    return await service.from_html(payload.html, str(payload.url))
