from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import LOADTEST_DISABLE_RATE_LIMIT, RATE_LIMIT_STORAGE_URI


def _client_ip(request: Request) -> str:
    """Rate-limit key: the real client IP. Behind Vercel's proxy the direct peer
    is the proxy, so keying on it would pool every user into one shared bucket
    (one busy user 429s everyone). Vercel overwrites x-forwarded-for with the
    client IP — client-sent values never survive its edge — so the first hop is
    trustworthy there; in dev the header is absent and the direct peer is right."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return get_remote_address(request)


# Rate limiting is disabled under load testing (LOADTEST_DISABLE_RATE_LIMIT):
# slowapi's 10/min would 429 the test within seconds and measure the limiter
# instead of the app. Off means normal enforcement — see LOADTEST.md.
#
# Storage defaults to in-memory, which on a horizontally-scaled / serverless
# deploy (Vercel) is PER INSTANCE and resets on cold start — so the effective
# global cap is 10/min × live instances, not a hard 10/min. Point
# RATE_LIMIT_STORAGE_URI at a shared backend (e.g. redis://…) to make it global.
# ponytail: in-memory per-instance limit; wire the env var to Redis if the cap
# ever needs to be a real global ceiling rather than best-effort abuse control.
limiter = Limiter(
    key_func=_client_ip,
    storage_uri=RATE_LIMIT_STORAGE_URI,
    enabled=not LOADTEST_DISABLE_RATE_LIMIT,
)
