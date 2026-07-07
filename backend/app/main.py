import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Parsley", description="Extract clean recipes from noisy recipe pages")

# Browser cross-origin access is only needed in dev, where the Vite dev server
# runs on its own origin. In production the SPA is served by this app (same
# origin), so CORS_ORIGINS stays unset and no cross-origin access is granted.
cors_origins = [o for o in os.environ.get("CORS_ORIGINS", "").split(",") if o]
if cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
