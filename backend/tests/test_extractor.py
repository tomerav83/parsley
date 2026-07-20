"""Data-driven extractor tests, mirroring recipe-scrapers' own fixture style.

Each fixture case is a directory under tests/fixtures/ containing:
  - page.html       — a page with (or without) schema.org/Recipe JSON-LD
  - expected.json   — the full Recipe the extractor must produce from it

Adding coverage = adding a new fixture directory; no test code changes needed.
"""

import json
from pathlib import Path

import pytest

from app.extractor import RecipeNotFoundError, extract_recipe

FIXTURES = Path(__file__).parent / "fixtures"
URL = "https://example.com/recipe"

CASES = sorted(p.name for p in FIXTURES.iterdir() if (p / "expected.json").exists())


@pytest.mark.parametrize("case", CASES)
def test_extracts_expected_recipe(case: str) -> None:
    html = (FIXTURES / case / "page.html").read_text()
    expected = json.loads((FIXTURES / case / "expected.json").read_text())

    recipe = extract_recipe(html, URL)

    assert recipe.model_dump() == expected


def test_page_without_recipe_raises() -> None:
    html = (FIXTURES / "no_recipe.html").read_text()
    with pytest.raises(RecipeNotFoundError):
        extract_recipe(html, URL)


def test_non_html_content_raises() -> None:
    with pytest.raises(RecipeNotFoundError):
        extract_recipe("just some plain text, not even html", URL)


def test_extracts_microdata_recipe_via_full_page_fallback() -> None:
    """Recipes in body microdata have no JSON-LD, so the fast head+JSON-LD
    reduction can't see them — the extractor must fall back to the full page."""
    html = """<!doctype html><html><head><title>MD</title></head><body>
    <div itemscope itemtype="https://schema.org/Recipe">
      <h1 itemprop="name">Microdata Cake</h1>
      <span itemprop="recipeIngredient">1 cup flour</span>
      <span itemprop="recipeIngredient">2 eggs</span>
      <ol><li itemprop="recipeInstructions">Mix well</li>
          <li itemprop="recipeInstructions">Bake 30 min</li></ol>
    </div></body></html>"""

    recipe = extract_recipe(html, URL)

    assert recipe.name == "Microdata Cake"
    assert recipe.ingredients == ["1 cup flour", "2 eggs"]
    assert recipe.steps == ["Mix well", "Bake 30 min"]
