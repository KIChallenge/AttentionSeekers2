"""Shared helpers: polite cached HTTP, paths.

Every network response is cached under data/cache (JSON/HTML) or written to
data/raw (binary documents), so reruns resume without refetching.
At most one request per REQUEST_INTERVAL seconds, descriptive User-Agent.
"""
from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path

import requests

DATA = Path(__file__).resolve().parent.parent
CACHE = DATA / "cache"
RAW = DATA / "raw"
DERIVED = DATA / "derived"
for p in (CACHE, RAW, DERIVED):
    p.mkdir(parents=True, exist_ok=True)

USER_AGENT = (
    "sv-ki-challenge-data/0.1 (hackathon research corpus on Austrian health policy; "
    "polite crawler, 1 req/s; contact jannik.schager@pwnd.at)"
)
REQUEST_INTERVAL = 1.1
PARL = "https://www.parlament.gv.at"

_session = requests.Session()
_session.headers["User-Agent"] = USER_AGENT
_last = [0.0]


def _throttle() -> None:
    wait = REQUEST_INTERVAL - (time.monotonic() - _last[0])
    if wait > 0:
        time.sleep(wait)
    _last[0] = time.monotonic()


def _key(url: str, body) -> str:
    raw = url + "\n" + (json.dumps(body, sort_keys=True) if body is not None else "")
    return hashlib.sha256(raw.encode()).hexdigest()[:24]


def get_json(url: str, body=None, subdir: str = "misc", retries: int = 3, refresh: bool = False):
    """GET (body None) or POST JSON, cached in cache/<subdir>/<hash>.json."""
    d = CACHE / subdir
    d.mkdir(parents=True, exist_ok=True)
    f = d / (_key(url, body) + ".json")
    if f.exists() and not refresh:
        return json.loads(f.read_text())
    for attempt in range(retries):
        _throttle()
        try:
            if body is None:
                r = _session.get(url, timeout=120)
            else:
                r = _session.post(url, json=body, timeout=300)
            if r.status_code == 404:
                f.write_text(json.dumps({"_status": 404, "_url": url}))
                return {"_status": 404, "_url": url}
            r.raise_for_status()
            data = r.json()
            tmp = f.with_suffix(".tmp")
            tmp.write_text(json.dumps(data, ensure_ascii=False))
            tmp.replace(f)
            return data
        except (requests.RequestException, ValueError) as e:
            print(f"  ! {url} attempt {attempt + 1}: {e}")
            time.sleep(5 * (attempt + 1))
    return None


def download(url: str, dest: Path, retries: int = 3) -> bool:
    """Download a binary file to dest unless it already exists."""
    if dest.exists() and dest.stat().st_size > 0:
        return True
    dest.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(retries):
        _throttle()
        try:
            r = _session.get(url, timeout=300, stream=True)
            if r.status_code == 404:
                return False
            r.raise_for_status()
            tmp = dest.with_suffix(dest.suffix + ".part")
            with open(tmp, "wb") as fh:
                for chunk in r.iter_content(1 << 16):
                    fh.write(chunk)
            tmp.replace(dest)
            return True
        except requests.RequestException as e:
            print(f"  ! {url} attempt {attempt + 1}: {e}")
            time.sleep(5 * (attempt + 1))
    return False


def filter_list(list_id: int, body: dict, subdir: str = "filter", refresh: bool = False):
    url = f"{PARL}/Filter/api/filter/data/{list_id}?js=eval&showAll=true"
    return get_json(url, body=body, subdir=subdir, refresh=refresh)


def write_jsonl(path: Path, rows) -> int:
    n = 0
    with open(path, "w") as fh:
        for r in rows:
            fh.write(json.dumps(r, ensure_ascii=False) + "\n")
            n += 1
    return n


def read_jsonl(path: Path):
    with open(path) as fh:
        for line in fh:
            if line.strip():
                yield json.loads(line)
