"""The backend as the load-test harness runs it (docs/decisions.md #27).

Imports the real app and lifts two safety rails that would otherwise dominate
the measurement. Lives outside backend/ so it is never deployed: production
runs app.main:app and nothing there can switch these off.

Run from the backend image with /loadtest on the path:
`uvicorn backend_app:app`.
"""

from app.fetching import url_guard
from app.main import app
from app.rate_limit import limiter

__all__ = ["app"]


def _allow_any_ip(ip: object) -> bool:
    """Accept every address — the mock upstream sits on a private compose-network IP."""
    return True


# slowapi's 10/min would 429 the test within seconds and measure the limiter.
limiter.enabled = False
# resolve_public_ips looks the check up at call time, so rebinding the module
# attribute covers both transports and every redirect hop. Resolution and IP
# pinning still run, so the load test exercises them too.
url_guard.ip_allowed = _allow_any_ip
