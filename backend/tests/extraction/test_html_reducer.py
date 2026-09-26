import pytest

from app.extraction.html_reducer import reduce_html

HEAD_LD = '<script type="application/ld+json">{"in": "head"}</script>'
BODY_LD = '<script type="application/ld+json">{"in": "body"}</script>'


class TestReducedPage:
    def test_keeps_each_json_ld_script_once_and_nothing_else(self) -> None:
        """Head JSON-LD rides along with the head; body JSON-LD is added without
        the text after it."""
        html = f"""<html><head><title>t</title>{HEAD_LD}</head><body>
        {BODY_LD} stray text
        <p>article body</p><script>notJsonLd()</script></body></html>"""

        reduced = reduce_html(html)

        assert reduced is not None
        assert reduced.count('{"in": "head"}') == 1
        assert reduced.index('{"in": "head"}') < reduced.index("</head>"), "head was not kept whole"
        assert '{"in": "body"}' in reduced
        assert "<title>t</title>" in reduced
        for dropped in ("stray text", "article body", "notJsonLd"):
            assert dropped not in reduced

    def test_keeps_body_scripts_in_document_order(self) -> None:
        html = (
            '<html><body><script type="application/ld+json">{"n": 1}</script>'
            '<div><script type="application/ld+json">{"n": 2}</script></div></body></html>'
        )

        reduced = reduce_html(html)

        assert reduced is not None
        assert reduced.index('{"n": 1}') < reduced.index('{"n": 2}')

    def test_page_without_head_keeps_just_the_scripts(self) -> None:
        reduced = reduce_html(f"<body>{BODY_LD}</body>")

        assert reduced is not None
        assert "<head" not in reduced
        assert '{"in": "body"}' in reduced


class TestNotReduced:
    """None tells the caller to parse the original page instead."""

    def test_page_without_json_ld(self) -> None:
        assert reduce_html("<html><head></head><body><p>hi</p></body></html>") is None

    @pytest.mark.parametrize(
        "script_type",
        ["application/json", "application/ld+json; charset=utf-8", "text/javascript"],
    )
    def test_script_type_must_match_exactly(self, script_type: str) -> None:
        """extruct, which reads the JSON-LD, uses the exact match; anything else
        it wouldn't read, so it's no reason to reduce."""
        html = f'<html><head><script type="{script_type}">{{}}</script></head></html>'

        assert reduce_html(html) is None

    @pytest.mark.parametrize(
        "page",
        [
            "",  # lxml: ParserError, "Document is empty"
            "   \n  ",
            '<?xml version="1.0" encoding="utf-8"?><html></html>',  # ValueError for str input
        ],
    )
    def test_unparseable_page(self, page: str) -> None:
        assert reduce_html(page) is None
