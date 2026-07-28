"""The wire models — this file is half of the API contract.

Change `Recipe` or an error code here and contract.json and
frontend/src/lib/api.ts have to change with it; tests on both sides fail otherwise.
"""

from enum import StrEnum

from pydantic import BaseModel, Field, HttpUrl

# Recipe pages rarely run past 1-2 MB, so this only stops a giant paste tying up
# the parser. max_length counts characters, not bytes — the UTF-8 size can be a
# few times this.
MAX_HTML_CHARS = 5_000_000


class ErrorCode(StrEnum):
    """Every client-facing error code the API can return.

    `ERROR` is the AppError base and is never raised on its own; the frontend maps
    anything it doesn't recognise to "unknown".
    """

    ERROR = "error"
    INVALID_URL = "invalid_url"
    BLOCKED_URL = "blocked_url"
    NO_RECIPE = "no_recipe"
    SITE_BLOCKED = "site_blocked"
    FETCH_FAILED = "fetch_failed"


class ExtractRequest(BaseModel):
    url: HttpUrl


class ExtractHtmlRequest(BaseModel):
    html: str = Field(max_length=MAX_HTML_CHARS)
    url: HttpUrl


class Recipe(BaseModel):
    """What extraction returns, and what the frontend renders. Times are in minutes."""

    name: str
    image: str | None = None
    author: str | None = None
    ingredients: list[str]
    steps: list[str]
    prep_time_minutes: int | None = None
    cook_time_minutes: int | None = None
    total_time_minutes: int | None = None
    yields: str | None = None
    source_url: str
    site_name: str | None = None


class ErrorResponse(BaseModel):
    code: ErrorCode
    message: str


class AppError(Exception):
    """Base for every error the API returns as an ErrorResponse.

    main.app_error_handler renders any subclass to JSON, so a new error type just
    sets `code` and `status`. Set `detail` when str(exc) would leak internals —
    otherwise the exception's own message reaches the client.
    """

    code: ErrorCode = ErrorCode.ERROR
    status = 500
    detail: str | None = None
