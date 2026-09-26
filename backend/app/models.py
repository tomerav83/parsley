"""The wire models — this file is half of the API contract.

Change `Recipe` or an error code here and contract.json and
frontend/src/lib/api.ts have to change with it; tests on both sides fail otherwise.
"""

from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field, HttpUrl, field_validator, model_validator
from pydantic_core import PydanticUseDefault

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
    """What extraction returns, and what the frontend renders. Times are in minutes.

    Built only from recipe-scrapers' `to_json()` output: the validation aliases are
    its keys, and pydantic accepts nothing else. They don't touch the wire shape —
    serialization still uses the field names.
    """

    name: str = Field(default="Untitled recipe", validation_alias="title")
    image: str | None = None
    author: str | None = None
    ingredients: list[str]
    steps: list[str] = Field(validation_alias="instructions_list")
    prep_time_minutes: int | None = Field(default=None, validation_alias="prep_time")
    cook_time_minutes: int | None = Field(default=None, validation_alias="cook_time")
    total_time_minutes: int | None = Field(default=None, validation_alias="total_time")
    yields: str | None = None
    source_url: str
    site_name: str | None = None

    @field_validator("name", mode="before")
    @classmethod
    def _blank_name_to_default(cls, value: object) -> object:
        """A blank title comes back from recipe-scrapers as '', not a missing key."""
        if not value:
            raise PydanticUseDefault
        return value

    @model_validator(mode="before")
    @classmethod
    def _require_ingredients_and_steps(cls, data: Any) -> Any:
        """Ingredients and steps are the two fields a recipe can't do without, so
        data missing either is no recipe at all. Runs before field validation
        because a missing required key never reaches a field validator."""
        if isinstance(data, dict) and not (
            data.get("ingredients") and data.get("instructions_list")
        ):
            raise RecipeNotFoundError("Recipe data is missing ingredients or steps")
        return data


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


class RecipeNotFoundError(AppError):
    """The page has no usable schema.org/Recipe markup.

    The client sees `detail`; the message passed at each raise site is for logs.
    """

    code = ErrorCode.NO_RECIPE
    status = 422
    detail = "No recipe found on that page"
