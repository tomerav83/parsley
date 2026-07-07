from pydantic import BaseModel, HttpUrl


class ExtractRequest(BaseModel):
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
