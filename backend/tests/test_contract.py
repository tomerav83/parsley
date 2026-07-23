"""The API contract, pinned so it can't drift silently across the boundary.

contract.json (repo root) is the single source of truth for the Recipe shape and
the backend error-code taxonomy. This test fails if the backend models drift from
it; frontend/src/lib/contract.test.ts fails if the client does. When the contract
changes on purpose, update contract.json to the values these assertions print.
"""

import json
from pathlib import Path

from app.models import ErrorCode, Recipe

CONTRACT = json.loads((Path(__file__).parents[2] / "contract.json").read_text())


def test_recipe_fields_match_contract() -> None:
    assert list(Recipe.model_fields) == CONTRACT["recipe_fields"]


def test_error_codes_match_contract() -> None:
    assert [code.value for code in ErrorCode] == CONTRACT["backend_error_codes"]
