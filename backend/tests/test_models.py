import pydantic
import pytest

from app.models import (
    MAX_HTML_CHARS,
    AppError,
    ErrorCode,
    ExtractHtmlRequest,
    ExtractRequest,
    Recipe,
    RecipeNotFoundError,
)

MINIMAL = {"ingredients": ["1 egg"], "steps": ["Boil"], "source_url": "https://example.com/r"}


class TestRecipe:
    def test_fills_optional_fields_with_defaults(self) -> None:
        recipe = Recipe.model_validate(MINIMAL)

        assert recipe.name == "Untitled recipe"
        assert recipe.image is recipe.author is recipe.yields is recipe.site_name is None
        assert recipe.prep_time_minutes is recipe.total_time_minutes is None

    @pytest.mark.parametrize("field", ["ingredients", "steps"])
    @pytest.mark.parametrize("value", [None, []], ids=["missing", "empty"])
    def test_no_ingredients_or_steps_is_no_recipe(self, field: str, value: list | None) -> None:
        """Raised as the API's own error, not a pydantic ValidationError, so the
        client gets no_recipe (422) rather than a 500."""
        data = {**MINIMAL}
        if value is None:
            del data[field]
        else:
            data[field] = value

        with pytest.raises(RecipeNotFoundError):
            Recipe.model_validate(data)

    def test_revalidating_a_recipe_instance_passes(self) -> None:
        recipe = Recipe.model_validate(MINIMAL)

        assert Recipe.model_validate(recipe) == recipe

    @pytest.mark.parametrize(
        ("field", "value"),
        [("ingredients", [1, 2]), ("prep_time_minutes", "twenty"), ("source_url", None)],
    )
    def test_wrong_types_are_validation_errors(self, field: str, value: object) -> None:
        with pytest.raises(pydantic.ValidationError):
            Recipe.model_validate({**MINIMAL, field: value})

    def test_serializes_with_field_names(self) -> None:
        dumped = Recipe.model_validate({**MINIMAL, "prep_time_minutes": 10}).model_dump()

        assert dumped["prep_time_minutes"] == 10
        assert list(dumped) == list(Recipe.model_fields)


class TestExtractRequest:
    def test_accepts_an_http_url(self) -> None:
        assert ExtractRequest(url="https://example.com/r").url.host == "example.com"  # pyright: ignore[reportArgumentType]

    @pytest.mark.parametrize("url", ["not-a-url", "ftp://example.com/r", ""])
    def test_rejects_anything_else(self, url: str) -> None:
        with pytest.raises(pydantic.ValidationError):
            ExtractRequest(url=url)  # pyright: ignore[reportArgumentType]


class TestExtractHtmlRequest:
    def test_accepts_html_at_the_size_limit(self) -> None:
        request = ExtractHtmlRequest(html="x" * MAX_HTML_CHARS, url="https://example.com/r")  # pyright: ignore[reportArgumentType]

        assert len(request.html) == MAX_HTML_CHARS

    def test_rejects_html_one_character_over(self) -> None:
        with pytest.raises(pydantic.ValidationError, match="at most"):
            ExtractHtmlRequest(html="x" * (MAX_HTML_CHARS + 1), url="https://example.com/r")  # pyright: ignore[reportArgumentType]

    def test_requires_the_source_url(self) -> None:
        with pytest.raises(pydantic.ValidationError):
            ExtractHtmlRequest.model_validate({"html": "<html></html>"})


class TestAppErrors:
    def test_base_error_is_a_generic_500(self) -> None:
        assert (AppError.code, AppError.status, AppError.detail) == (ErrorCode.ERROR, 500, None)

    def test_recipe_not_found_hides_its_log_message(self) -> None:
        """The raise-site message is for logs; the client sees the fixed detail."""
        error = RecipeNotFoundError("scraper said: NoSchemaFoundInWildMode at line 3")

        assert (error.code, error.status) == (ErrorCode.NO_RECIPE, 422)
        assert error.detail == "No recipe found on that page"
