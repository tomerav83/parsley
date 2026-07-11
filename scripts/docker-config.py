#!/usr/bin/env python3
"""Emit a Docker config.json for `make` to use via DOCKER_CONFIG, with credential
helpers stripped out.

Under WSL, Docker Desktop writes `"credsStore": "desktop.exe"` into the global
~/.docker/config.json. BuildKit (used by `docker compose build`) can't exec that
Windows helper and fails every build with "exec format error". None of Parsley's
base images need auth, so we drop the helpers and let Docker do anonymous pulls.

The user's real config is used as a base so any inline `auths` are preserved; only
the helper keys are removed. Output goes to stdout — the Makefile writes it to
./.docker/config.json. This is scoped to `make`; the global config is untouched.
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
