"""The backend as the load-test harness runs it (docs/decisions.md #27).

Imports the real app and lifts two safety rails that would otherwise dominate
the measurement. Lives outside backend/ so it is never deployed: production
runs app.main:app and nothing there can switch these off.

Run from the backend image with /loadtest on the path:
`uvicorn backend_app:app`.
"""

from app import fetch
from app.main import app
from app.rate_limit import limiter

__all__ = ["app"]


async def _allow_any_host(host: str) -> None:
    """Accept every host — the mock upstream sits on a private compose-network IP."""


# slowapi's 10/min would 429 the test within seconds and measure the limiter.
limiter.enabled = False
# validate_url looks the guard up at call time, so rebinding the module attribute
# covers every call site, redirect hops included.
fetch._assert_public_host = _allow_any_host
