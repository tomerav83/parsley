"""Mock upstream for load testing — stands in for real recipe sites.

The load test must never fetch real sites (that DoSes someone else and measures
their servers, not our code — LOADTEST.md). This serves the same fixture HTML the
unit tests use, at /recipe/<fixture-name>, with a fixed injected latency so
Parsley's full fetch path sees a production-shaped response time.

Reuses the backend image (starlette/uvicorn already installed); run with
`uvicorn mock_upstream:app`. Fixtures are preloaded so the delay is the only
variable, not disk I/O.
"""

import asyncio
import os
from pathlib import Path

from starlette.applications import Starlette
from starlette.responses import HTMLResponse, PlainTextResponse
from starlette.routing import Route

FIXTURES_DIR = Path(os.environ.get("FIXTURES_DIR", "fixtures"))
LATENCY_S = int(os.environ.get("LOADTEST_UPSTREAM_LATENCY_MS", "500")) / 1000

# {fixture_name: html} for every tests/fixtures/<name>/page.html.
PAGES = {p.parent.name: p.read_text() for p in FIXTURES_DIR.glob("*/page.html")}


async def serve(request):
    await asyncio.sleep(LATENCY_S)
    html = PAGES.get(request.path_params["name"])
    if html is None:
        return PlainTextResponse("no such fixture", status_code=404)
    return HTMLResponse(html)


app = Starlette(routes=[Route("/recipe/{name}", serve)])

if __name__ == "__main__":  # smallest self-check: fixtures load and a name resolves
    assert PAGES, f"no fixtures found under {FIXTURES_DIR.resolve()}"
    assert "graph_howtostep" in PAGES, sorted(PAGES)
    print(f"ok: {len(PAGES)} fixtures, {int(LATENCY_S * 1000)}ms latency")
