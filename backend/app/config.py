"""Central runtime config — the one place environment variables are read.

Keeping these together (rather than scattering os.environ.get across modules)
makes the app's tunable surface discoverable, and gives Phase-2 additions (DB
URL, auth secret) an obvious home. Read once at import: every value here is a
deployment-time setting, not something tests toggle.
"""

import os

# Load-test escape hatches (see LOADTEST.md) — NEVER set in production.
# LOADTEST_ALLOW_PRIVATE_HOSTS lets the mock upstream resolve to a compose-network
# IP the SSRF guard would otherwise reject; LOADTEST_DISABLE_RATE_LIMIT stops the
# 10/min limiter from 429ing a load test within seconds.
LOADTEST_ALLOW_PRIVATE_HOSTS = bool(os.environ.get("LOADTEST_ALLOW_PRIVATE_HOSTS"))
LOADTEST_DISABLE_RATE_LIMIT = bool(os.environ.get("LOADTEST_DISABLE_RATE_LIMIT"))

# Rate-limit storage. In-memory (the default) is PER INSTANCE on a serverless /
# horizontally-scaled deploy and resets on cold start — point this at a shared
# backend (e.g. redis://…) to make the cap a real global ceiling. See rate_limit.py.
RATE_LIMIT_STORAGE_URI = os.environ.get("RATE_LIMIT_STORAGE_URI") or "memory://"
