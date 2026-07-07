"""Cleanup helpers for raw scraper output."""

import html
import re
from collections.abc import Callable

_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")


def clean_text(value: str) -> str:
    """Strip HTML tags, unescape entities, and collapse whitespace."""
    text = _TAG_RE.sub(" ", value)
    text = html.unescape(text)
    return _WS_RE.sub(" ", text).strip()


def clean_lines(values: list[str]) -> list[str]:
    """Clean each line and drop empties."""
    cleaned = (clean_text(v) for v in values)
    return [c for c in cleaned if c]


def safe[T](getter: Callable[[], T]) -> T | None:
    """Call a scraper getter, returning None when the site omits the field."""
    try:
        return getter()
    except Exception:
        return None
