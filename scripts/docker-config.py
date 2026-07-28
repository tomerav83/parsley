#!/usr/bin/env python3
"""Print a Docker config.json for `make` to use via DOCKER_CONFIG, minus the
credential helpers.

Under WSL, Docker Desktop puts `"credsStore": "desktop.exe"` in the global
~/.docker/config.json. BuildKit can't exec a Windows helper, so every
`docker compose build` dies with "exec format error". No Parsley base image needs
auth, so dropping the helpers and pulling anonymously is enough.

Builds on the real config so inline `auths` survive; only the helper keys go. The
Makefile writes stdout to ./.docker/config.json — the global config is untouched.
"""

import json
import pathlib
import sys

src = pathlib.Path.home() / ".docker" / "config.json"
try:
    cfg = json.loads(src.read_text())
except (FileNotFoundError, ValueError):
    cfg = {}

# The Windows helper can't run under WSL BuildKit; anonymous pulls work for the
# public base images, so remove both the global store and any per-registry ones.
cfg.pop("credsStore", None)
cfg.pop("credHelpers", None)

json.dump(cfg, sys.stdout, indent=2)
sys.stdout.write("\n")
