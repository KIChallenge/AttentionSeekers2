"""Polite, cached, resumable HTTP for Parlament open data and RIS.

Every response is stored under forecasting/cache/http/<host>/<sha1>.json (body plus
request metadata). A cache hit never touches the network, so every pipeline step
is resumable: rerun it and it continues where it stopped.
"""

from __future__ import annotations

import hashlib
import json
import time
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "cache" / "http"
USER_AGENT = (
    "sv-ki-challenge-forecasting/0.1 (hackathon research on Austrian health-policy "
    "legislative outcomes; cached, about 1 request per second)"
)
# Minimum seconds between two network requests per host. RIS asks for at most 0.5 req/s.
MIN_INTERVAL = {"data.bka.gv.at": 2.1, "www.ris.bka.gv.at": 2.1}
DEFAULT_INTERVAL = 1.05
_last: dict[str, float] = {}


def _key(method: str, url: str, body: dict | None) -> Path:
    raw = method + " " + url + " " + (json.dumps(body, sort_keys=True) if body is not None else "")
    h = hashlib.sha1(raw.encode()).hexdigest()
    return CACHE / urlparse(url).netloc / f"{h}.json"


def fetch(url: str, body: dict | None = None, *, as_json: bool = True, retries: int = 4, offline: bool = False):
    """GET (body None) or POST JSON. Returns parsed JSON or text. None on 404."""
    method = "POST" if body is not None else "GET"
    path = _key(method, url, body)
    if path.exists():
        rec = json.loads(path.read_text())
        if rec["status"] == 404:
            return None
        return json.loads(rec["text"]) if as_json else rec["text"]
    if offline:
        raise FileNotFoundError(f"not cached and offline: {url}")
    host = urlparse(url).netloc
    gap = MIN_INTERVAL.get(host, DEFAULT_INTERVAL)
    for attempt in range(retries):
        wait = _last.get(host, 0) + gap - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("User-Agent", USER_AGENT)
        req.add_header("Accept", "application/json, text/html;q=0.9, */*;q=0.5")
        if data is not None:
            req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                raw = r.read()
                status = r.status
                ctype = r.headers.get("Content-Type", "")
        except urllib.error.HTTPError as e:
            _last[host] = time.monotonic()
            if e.code == 404:
                _store(path, method, url, body, 404, "", "")
                return None
            if e.code in (429, 500, 502, 503, 504) and attempt < retries - 1:
                time.sleep(10 * (attempt + 1))
                continue
            raise
        except (urllib.error.URLError, TimeoutError):
            _last[host] = time.monotonic()
            if attempt < retries - 1:
                time.sleep(10 * (attempt + 1))
                continue
            raise
        _last[host] = time.monotonic()
        text = raw.decode("utf-8", errors="replace")
        _store(path, method, url, body, status, ctype, text)
        return json.loads(text) if as_json else text
    raise RuntimeError(f"giving up on {url}")


def _store(path: Path, method, url, body, status, ctype, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps({
        "method": method, "url": url, "body": body, "status": status,
        "content_type": ctype, "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "text": text,
    }, ensure_ascii=False))
    tmp.replace(path)


PARL = "https://www.parlament.gv.at"


def parl_list(list_id: int, body: dict, **kw):
    return fetch(f"{PARL}/Filter/api/filter/data/{list_id}?js=eval&showAll=true", body, **kw)


def parl_item(gp: str, ityp: str, inr, **kw):
    return fetch(f"{PARL}/gegenstand/{gp}/{ityp}/{inr}?json=TRUE", **kw)


def parl_doc(path: str, **kw) -> str | None:
    return fetch(PARL + path, as_json=False, **kw)
