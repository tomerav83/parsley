"""Recipe pages and recipes to feed the extractor and the routes."""

import json
from pathlib import Path
from typing import Any

from app.models import Recipe

FIXTURES = Path(__file__).parents[1] / "fixtures"
URL = "https://example.com/recipe"
RECIPE = Recipe(name="X", ingredients=["a"], steps=["b"], source_url=URL)


def read_fixture(name: str) -> str:
    return (FIXTURES / name).read_text()


def json_ld_page(**recipe: Any) -> str:
    """A minimal page whose only content is one schema.org/Recipe JSON-LD block."""
    ld = json.dumps({"@context": "https://schema.org", "@type": "Recipe", **recipe})
    return f'<html><head><script type="application/ld+json">{ld}</script></head></html>'
