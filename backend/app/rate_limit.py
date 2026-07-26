"""The shared rate limiter. Routes apply it with @limiter.limit("10/minute")."""

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import LOADTEST_DISABLE_RATE_LIMIT, RATE_LIMIT_STORAGE_URI


def _client_ip(request: Request) -> str:
    """Return the real client IP to key the limit on.

    Behind Vercel the direct peer is the proxy, so keying on it would drop every
    user into one bucket and let one busy user 429 everyone. Vercel overwrites
    x-forwarded-for at its edge, so the first hop is trustworthy; in dev the header
    is absent and the peer is right anyway.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return get_remote_address(request)


# The cap is per instance unless RATE_LIMIT_STORAGE_URI points somewhere shared, so
# the real ceiling is 10/min × live instances. Load tests turn it off entirely —
# otherwise they'd measure the limiter instead of the app.
# ponytail: in-memory per-instance limit; wire the env var to Redis if the cap
# ever needs to be a real global ceiling rather than best-effort abuse control.
limiter = Limiter(
    key_func=_client_ip,
    storage_uri=RATE_LIMIT_STORAGE_URI,
    enabled=not LOADTEST_DISABLE_RATE_LIMIT,
)
