"""extract_recipe over real HTML, plus the cleaning helpers on their own.

TestFixtureCases mirrors recipe-scrapers' own fixture style: each directory under
tests/fixtures/ holds a page.html and the expected.json Recipe it must produce, so
adding coverage means adding a directory, not test code.
"""

import json
from unittest import mock

import pytest
from recipe_scrapers._exceptions import NoSchemaFoundInWildMode, SchemaOrgException

from app.extraction.extractor import _clean_lines, _clean_text, _safe, extract_recipe
from app.models import RecipeNotFoundError
from tests.support.pages import FIXTURES, URL, json_ld_page, read_fixture

CASES = sorted(p.name for p in FIXTURES.iterdir() if (p / "expected.json").exists())

MICRODATA = """<div itemscope itemtype="https://schema.org/Recipe">
  <h1 itemprop="name">Microdata Cake</h1>
  <span itemprop="recipeIngredient">1 cup flour</span>
  <span itemprop="recipeIngredient">2 eggs</span>
  <ol><li itemprop="recipeInstructions">Mix well</li>
      <li itemprop="recipeInstructions">Bake 30 min</li></ol>
</div>"""


class TestFixtureCases:
    @pytest.mark.parametrize("case", CASES)
    def test_extracts_the_expected_recipe(self, case: str) -> None:
        expected = json.loads(read_fixture(f"{case}/expected.json"))

        recipe = extract_recipe(read_fixture(f"{case}/page.html"), URL)

        assert recipe.model_dump() == expected


class TestExtractRecipe:
    def test_microdata_recipe_is_found_via_the_full_page(self) -> None:
        """Body microdata has no JSON-LD, so the head+JSON-LD reduction can't see
        it; the extractor must fall back to the full page."""
        html = f"<!doctype html><html><head><title>MD</title></head><body>{MICRODATA}</body></html>"

        recipe = extract_recipe(html, URL)

        assert recipe.name == "Microdata Cake"
        assert recipe.ingredients == ["1 cup flour", "2 eggs"]
        assert recipe.steps == ["Mix well", "Bake 30 min"]

    def test_non_recipe_json_ld_still_falls_back_to_the_full_page(self) -> None:
        """Most pages carry JSON-LD for breadcrumbs or the site itself; that makes
        the page reducible but the recipe can still be microdata."""
        ld = '<script type="application/ld+json">{"@type": "WebSite", "name": "Blog"}</script>'
        html = f"<html><head>{ld}</head><body>{MICRODATA}</body></html>"

        assert extract_recipe(html, URL).name == "Microdata Cake"

    def test_keeps_the_source_url(self) -> None:
        html = json_ld_page(name="Soup", recipeIngredient=["water"], recipeInstructions=["Boil"])

        assert extract_recipe(html, URL).source_url == URL

    @pytest.mark.parametrize("name", [None, "", "   ", "<b></b>"])
    def test_blank_or_missing_name_becomes_untitled(self, name: str | None) -> None:
        fields = {"recipeIngredient": ["water"], "recipeInstructions": ["Boil"]}
        html = json_ld_page(**fields) if name is None else json_ld_page(name=name, **fields)

        assert extract_recipe(html, URL).name == "Untitled recipe"

    def test_cleans_fields_recipe_scrapers_leaves_raw(self) -> None:
        """recipe-scrapers normalises ingredients and steps but hands author and
        yields back as-is, and an ingredient that's only markup survives as ''."""
        html = json_ld_page(
            name="Clean",
            author={"@type": "Person", "name": "Jane &amp; John"},
            recipeYield="4&nbsp;servings",
            recipeIngredient=["1 egg", "<span></span>"],
            recipeInstructions=["Boil"],
        )

        recipe = extract_recipe(html, URL)

        assert recipe.author == "Jane & John"
        assert recipe.yields == "4 servings"
        assert recipe.ingredients == ["1 egg"]


class TestNoRecipe:
    @pytest.mark.parametrize(
        "page",
        [
            read_fixture("no_recipe.html"),
            "just some plain text, not even html",
            "",
            '<?xml version="1.0" encoding="utf-8"?><html></html>',
        ],
        ids=["article-page", "plain-text", "empty", "xml-declaration"],
    )
    def test_page_without_a_recipe_raises(self, page: str) -> None:
        with pytest.raises(RecipeNotFoundError):
            extract_recipe(page, URL)

    @pytest.mark.parametrize("missing", ["recipeIngredient", "recipeInstructions"])
    def test_recipe_without_ingredients_or_steps_raises(self, missing: str) -> None:
        fields = {"name": "Half", "recipeIngredient": ["1 egg"], "recipeInstructions": ["Boil"]}
        del fields[missing]

        with pytest.raises(RecipeNotFoundError):
            extract_recipe(json_ld_page(**fields), URL)

    def test_ingredients_that_clean_to_nothing_raise(self) -> None:
        html = json_ld_page(recipeIngredient=["<span></span>", "  "], recipeInstructions=["Boil"])

        with pytest.raises(RecipeNotFoundError):
            extract_recipe(html, URL)

    def test_scraper_failure_becomes_recipe_not_found(self) -> None:
        cause = NoSchemaFoundInWildMode(URL)

        with (
            mock.patch("app.extraction.extractor.scrape_html", side_effect=cause),
            pytest.raises(RecipeNotFoundError) as excinfo,
        ):
            extract_recipe("<html></html>", URL)
        assert excinfo.value.__cause__ is cause


class TestSafe:
    def test_returns_the_getter_value(self) -> None:
        assert _safe(lambda: 42) == 42

    @pytest.mark.parametrize(
        "error",
        [
            SchemaOrgException("field missing"),  # how recipe-scrapers says "not provided"
            TypeError("site scraper returned the wrong shape"),
            KeyError("image"),
            ValueError("bad duration"),
        ],
    )
    def test_a_failing_getter_is_a_missing_field(self, error: Exception) -> None:
        getter = mock.Mock(side_effect=error)

        assert _safe(getter) is None
        getter.assert_called_once_with()


class TestCleanText:
    @pytest.mark.parametrize(
        ("raw", "clean"),
        [
            ("Plain", "Plain"),
            ("<b>Bold</b> text", "Bold text"),
            ("Jane &amp; John", "Jane & John"),
            ("4&nbsp;servings", "4 servings"),
            ("  spread \n\t out  ", "spread out"),
            ("a<br>b", "a b"),
        ],
    )
    def test_strips_tags_unescapes_and_collapses(self, raw: str, clean: str) -> None:
        assert _clean_text(raw) == clean

    @pytest.mark.parametrize("raw", [None, "", "   ", "<span></span>", "&nbsp;"])
    def test_nothing_left_is_none(self, raw: str | None) -> None:
        assert _clean_text(raw) is None


class TestCleanLines:
    def test_cleans_each_line_and_drops_the_empty_ones(self) -> None:
        assert _clean_lines(["<b>1</b> egg", "", "<i></i>", " salt "]) == ["1 egg", "salt"]

    def test_missing_list_is_empty(self) -> None:
        assert _clean_lines(None) == []
