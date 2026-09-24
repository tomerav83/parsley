from app.extraction.html_reducer import reduce_html


def test_reduced_page_keeps_each_json_ld_script_once_and_nothing_else() -> None:
    """Head JSON-LD rides along with the head; body JSON-LD is added without the
    text after it."""
    html = """<html><head><title>t</title>
    <script type="application/ld+json">{"in": "head"}</script></head><body>
    <script type="application/ld+json">{"in": "body"}</script> stray text
    <script>notJsonLd()</script></body></html>"""

    reduced = reduce_html(html)

    assert reduced is not None
    assert reduced.count('{"in": "head"}') == 1
    assert '{"in": "body"}' in reduced
    assert "stray text" not in reduced
    assert "notJsonLd" not in reduced


def test_page_without_json_ld_is_not_reduced() -> None:
    assert reduce_html("<html><head></head><body><p>hi</p></body></html>") is None
