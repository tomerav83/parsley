from enum import StrEnum

from pydantic import BaseModel, Field, HttpUrl

# Recipe page source is rarely over ~1-2 MB; cap generously so a crafted or
# accidental giant paste can't tie up the HTML parser (CPU/memory). Pydantic's
# max_length counts characters, not bytes, so the wire/UTF-8 size can be a few×
# this — still bounded, just not literally 5 MB.
MAX_HTML_CHARS = 5_000_000


class ErrorCode(StrEnum):
    """Every client-facing error `code` the API can return — the single source of
    truth for the taxonomy. Mirrored to the frontend via contract.json, enforced
    from both sides (tests/test_contract.py + frontend contract.test.ts), so a
    code added here can't silently drift out of sync with the client.

    `ERROR` is the generic AppError base and is never raised directly; the
    frontend maps anything it doesn't recognise to its own "unknown".
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

    One handler (main.app_error_handler) renders any AppError to JSON, so a new
    error type only sets `code` (client-facing key) and `status` (HTTP status) —
    status lives on the exception, not a lookup table. Set `detail` to pin the
    user-facing message when str(exc) would leak internals; left None, the
    exception's own message is used.
    """

    code: ErrorCode = ErrorCode.ERROR
    status = 500
    detail: str | None = None
