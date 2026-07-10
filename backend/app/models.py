from pydantic import BaseModel, Field, HttpUrl

# Recipe page source is rarely over ~1-2 MB; cap generously so a crafted or
# accidental giant paste can't tie up the HTML parser (CPU/memory).
MAX_HTML_BYTES = 5_000_000


class ExtractRequest(BaseModel):
    url: HttpUrl


class ExtractHtmlRequest(BaseModel):
    html: str = Field(max_length=MAX_HTML_BYTES)
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
    code: str
    message: str
