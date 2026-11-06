"""VfGH repeals from RIS: Kundmachungen in BGBl. I whose title names the Verfassungsgerichtshof.

Rule: an enacted registry act counts as partially repealed when a Teil I Kundmachung of a VfGH
repeal, published within the horizon, cites the act's own BGBl. I number in its text (the
Kundmachung names the provision "in der Fassung BGBl. I Nr. n/yyyy"). Only Kundmachungen whose
title matches the health or social-insurance vocabulary are fetched (about 20 documents), so the
RIS rate rules (0.5 req/s, no bulk in office hours) are respected.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from . import http
from .scope import HEALTH_RE, SV_RE

RIS = "https://data.bka.gv.at/ris/api/v2.6/Bundesrecht"
WORK = Path(__file__).resolve().parents[2] / "cache" / "work"


def kundmachungen() -> list[dict]:
    out = []
    page = 1
    while True:
        u = f"{RIS}?Applikation=BgblAuth&Titel=Verfassungsgerichtshof&Teil=TeilI&DokumenteProSeite=OneHundred&Seitennummer={page}"
        res = http.fetch(u)["OgdSearchResult"]["OgdDocumentResults"]
        refs = res.get("OgdDocumentReference") or []
        if isinstance(refs, dict):
            refs = [refs]
        for x in refs:
            m = x["Data"]["Metadaten"]
            b = m["Bundesrecht"]
            urls = x["Data"]["Dokumentliste"]["ContentReference"]["Urls"]["ContentUrl"]
            if isinstance(urls, dict):
                urls = [urls]
            html_url = next((u["Url"] for u in urls if u["DataType"] == "Html"), None)
            out.append({"bgbl": b["BgblAuth"]["Bgblnummer"], "date": b["BgblAuth"]["Ausgabedatum"],
                        "title": b["Kurztitel"], "html": html_url, "eli": b.get("Eli")})
        if page * 100 >= int(res["Hits"]["#text"]):
            break
        page += 1
    return out


def build():
    ks = [k for k in kundmachungen()
          if k["date"] >= "2008-01-01" and k["bgbl"].startswith("BGBl. I Nr")
          and (HEALTH_RE.search(k["title"]) or SV_RE.search(k["title"]))]
    for k in ks:
        txt = http.fetch(k["html"], as_json=False) if k["html"] else ""
        cited = set(re.findall(r"BGBl\.\s*I\s*Nr\.\s*(\d+)\s*/\s*(\d{4})", re.sub(r"<[^>]+>", " ", txt or "")))
        k["cited_bgbl_I"] = sorted(f"{n}/{y}" for n, y in cited)
    WORK.mkdir(parents=True, exist_ok=True)
    (WORK / "vfgh.json").write_text(json.dumps(ks, ensure_ascii=False, indent=1))
    print(len(ks), "VfGH Kundmachungen (health/SV, Teil I, 2008+)")
    return ks


if __name__ == "__main__":
    build()
