"""Stands in for real recipe sites during a load test.

Pointing a load test at real sites would DoS someone else and measure their
servers instead of our code (docs/load-testing.md). This serves the unit tests'
fixture HTML at /recipe/<fixture-name>, with a fixed latency so the fetch path
sees a production-shaped response time.

Runs on the backend image (starlette and uvicorn are already there):
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

# /recipe/large: a real JSON-LD recipe padded to ~1.5 MB with the comment bulk real
# sites ship, so the parse is CPU-heavy the way production is. The small fixtures
# only exercise fetch concurrency.
_filler = '<div class="comment"><p>Lorem ipsum dolor sit amet.</p></div>' * 25000
if "graph_howtostep" in PAGES:
    PAGES["large"] = PAGES["graph_howtostep"].replace("</body>", _filler + "</body>")


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
