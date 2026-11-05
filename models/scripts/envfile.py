"""Load the repo's .env into os.environ (existing variables win). Values are never printed."""
from __future__ import annotations

import os
from pathlib import Path

ENV = Path(__file__).resolve().parents[2] / ".env"


def load_env() -> None:
    if not ENV.exists():
        return
    for line in ENV.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def azure_client():
    """OpenAI SDK client for the Foundry v1 endpoint (api-key header)."""
    from openai import OpenAI
    load_env()
    ep = os.environ.get("AZURE_OPENAI_V1_BASE") or os.environ.get("BIFROST_SEED_AZURE_ENDPOINT")
    key = os.environ.get("AZURE_OPENAI_API_KEY") or os.environ.get("BIFROST_SEED_AZURE_KEY")
    if not ep or not key:
        raise SystemExit("set BIFROST_SEED_AZURE_ENDPOINT/BIFROST_SEED_AZURE_KEY in .env (v1 base URL + key)")
    ep = ep.rstrip("/")
    if not ep.endswith("/openai/v1"):
        ep += "/openai/v1"
    return OpenAI(base_url=ep + "/", api_key=key, default_headers={"api-key": key})
