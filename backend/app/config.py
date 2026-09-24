"""The one place environment variables are read.

Everything here is a deployment setting, read once at import — nothing tests
toggle. None are required.
"""

import os

# In-memory storage is per instance and resets on cold start, so on Vercel the cap
# is best-effort. Point this at a shared store (redis://…, needs `uv add redis`)
# to make it global.
RATE_LIMIT_STORAGE_URI = os.environ.get("RATE_LIMIT_STORAGE_URI") or "memory://"
