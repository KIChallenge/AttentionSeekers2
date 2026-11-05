"""Download machine-readable health-system statistics into raw/stats/<source>/.

Sources (licence in STATS.md and README.md):
  statat     Statistik Austria OGD (CC BY 4.0): health accounts, hospital discharges, population, life expectancy
  eurostat   Eurostat JSON-stat (CC BY 4.0): beds, discharges, physicians, expenditure by financing, AT + peers
  bmf        BMF Bundesbudget UG 24 Gesundheit, Verzeichnis veranschlagter Konten (CC BY 4.0 via data.gv.at)
  rh_bra     Rechnungshof Bundesrechnungsabschluss, VVR Finanzierungshaushalt by UG/MVAG (CC BY 4.0 via data.gv.at)
  dvsv       Dachverband Statistisches Handbuch, Excel ZIP per edition (no open licence stated)
  oeak       OeAeK Aerztestatistik PDFs (no open licence stated)
  zielst     Zielsteuerung-Gesundheit Monitoringberichte and Finanzzielsteuerung Kurzberichte (BMSGPK/GOeG PDFs)
Writes raw/stats/manifest.jsonl (source, url, path, bytes, sha256, fetched).
"""
from __future__ import annotations

import datetime as dt
import hashlib
import html
import re
import sys
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))  # -I drops the script dir
from common import RAW, _session, _throttle, download, get_json, read_jsonl, write_jsonl

OUT = RAW / "stats"
OUT.mkdir(parents=True, exist_ok=True)
MANIFEST = OUT / "manifest.jsonl"
MAX_BYTES = 300 * 1024 * 1024

STATAT_IDS = [
    "OGD_gesausgaben01_HVD_HCHF_1", "OGD_gesausgaben02_HVD_HCHP_1", "OGD_gesausgaben03_HVD_HPHF_1",
    "OGD_krankenbewegungen_ex_ENTLASSUNGEN_KA_1", "OGD_krankenbewegungen_ex_ENTLASSUNGEN_KA_2",
    "OGD_krankenbewegungen_ex_ENTLASSUNGEN_AKUTKA_2", "OGD_krankenbewegungen_ex_ENTLASSUNGEN_AKUTKA_3",
    "OGD_krankenbewegungen_ex_ENTLASSUNGEN_VSEKT_20211", "OGD_krankenbewegungen_ex_ENTLASSUNGEN_PERSMERK_2021",
    "OGD_krankenbewegungen_ex_LEISTUNGEN_1",
    "OGD_bevstandjbab2002_BevStand_2026", "OGD_ind003_HVD_IND_1", "OGD_gestorbene_ext_GES_1",
]
EUROSTAT = {
    "hlth_sha11_hf": "Health expenditure by financing scheme",
    "hlth_sha11_hchf": "Health expenditure by function and financing scheme",
    "hlth_rs_bds1": "Hospital beds by function and type of care",
    "hlth_rs_bds2": "Hospital beds by type of ownership",
    "hlth_co_disch1": "Hospital discharges by diagnosis, in-patients, totals",
    "hlth_co_inpst": "In-patient average length of stay",
    "hlth_rs_prs2": "Health personnel (physicians, nurses) by category",
    "hlth_rs_physcat": "Physicians by category of employment",
    "hlth_rs_spec": "Physicians by medical speciality",
    "hlth_rs_grd2": "Medical graduates",
}
EU_GEOS = ["AT", "DE", "CH", "CZ", "SI", "NL", "DK", "SE", "EU27_2020"]
RH_BRA_DATASETS = {  # data.gv.at dataset ids for Bundesrechnungsabschluss per year
    2013: "350674ae-a766-4e07-b0c9-b4753a26204a", 2014: "35db9871-5597-4117-b826-1817f94fec2d",
    2015: "91e21d9f-0c5f-4c32-a52f-8d70a11e7242", 2016: "cb2b865e-98ec-444a-961a-7eea49a1166b",
    2017: "97eb4517-9dea-4797-9c83-2457d8ae72d3", 2018: "aca9dce7-b9ea-4a0d-aa08-6e0db222abcc",
    2019: "3e66ae64-fbcd-4258-987a-9ae18fbd8e42", 2020: "74382527-1c82-46c5-a343-a58bbbb63730",
    2021: "fb7699f7-9427-478c-a404-1d0c80620326", 2022: "9e798499-0519-484c-b66c-ec9c4e2a868a",
    2023: "bb3f7afc-2c89-49cc-85fc-12330dd9e0cb", 2024: "38dec83f-f524-44a2-a0e9-18f84738194a",
    2025: "bundesrechnungsabschluss-2025",
}


def get_text(url: str) -> str | None:
    _throttle()
    try:
        r = _session.get(url, timeout=120)
        r.raise_for_status()
        return r.text
    except Exception as e:  # noqa: BLE001
        print("  ! ", url, e)
        return None


def head_size(url: str) -> int | None:
    _throttle()
    try:
        r = _session.head(url, timeout=60, allow_redirects=True)
        return int(r.headers.get("content-length")) if r.headers.get("content-length") else None
    except Exception:  # noqa: BLE001
        return None


class Manifest:
    def __init__(self):
        self.rows = {m["url"]: m for m in read_jsonl(MANIFEST)} if MANIFEST.exists() else {}

    def fetch(self, source: str, url: str, dest: Path, note: str = "", check_size: bool = False):
        if url in self.rows and (RAW / self.rows[url]["path"]).exists():
            return True
        if check_size:
            n = head_size(url)
            if n and n > MAX_BYTES:
                print(f"  skip (too large {n / 1e6:.0f} MB): {url}")
                self.rows[url] = {"source": source, "url": url, "path": None, "skipped": f"too large {n}"}
                return False
        ok = download(url, dest)
        if ok:
            data = dest.read_bytes()
            self.rows[url] = {"source": source, "url": url, "path": str(dest.relative_to(RAW)), "bytes": len(data),
                              "sha256": hashlib.sha256(data).hexdigest(), "fetched": dt.date.today().isoformat(),
                              "note": note}
            print(f"  ok {source}: {dest.name} ({len(data) / 1e3:.0f} kB)")
        else:
            print(f"  FAILED {source}: {url}")
        self.save()
        return ok

    def save(self):
        write_jsonl(MANIFEST, self.rows.values())


def safe_name(s: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "_", urllib.parse.unquote(s))[:150]


def statat(m: Manifest):
    for ds in STATAT_IDS:
        meta = get_json(f"https://data.statistik.gv.at/ogd/json?dataset={ds}", subdir="stats_meta")
        if not meta:
            continue
        d = OUT / "statat" / ds
        d.mkdir(parents=True, exist_ok=True)
        (d / "metadata.json").write_text(__import__("json").dumps(meta, ensure_ascii=False, indent=1))
        for r in meta.get("resources", []):
            m.fetch("statat", r["url"], d / safe_name(r["url"].rsplit("/", 1)[-1]), note=meta.get("title", ""),
                    check_size=True)


def eurostat(m: Manifest):
    for code, title in EUROSTAT.items():
        q = "&".join(f"geo={g}" for g in EU_GEOS)
        url = f"https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/{code}?format=JSON&lang=EN&{q}"
        dest = OUT / "eurostat" / f"{code}.json"
        if not m.fetch("eurostat", url, dest, note=title):
            # large cubes return 413 for multi-country requests; fall back to Austria only
            url_at = f"https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/{code}?format=JSON&lang=EN&geo=AT"
            m.fetch("eurostat", url_at, OUT / "eurostat" / f"{code}_AT.json", note=title + " (AT only)")


def bmf(m: Manifest):
    for y in range(2013, 2027):
        url = f"https://service.bmf.gv.at/Budget/Budgets/{y}/bfg/teilhefte/UG24/UG24_Verzeichnis_veranschlagter_Konten_{y}_csv_file.csv"
        if url in m.rows and m.rows[url].get("path"):
            continue
        m.fetch("bmf", url, OUT / "bmf" / f"UG24_Verzeichnis_veranschlagter_Konten_{y}.csv",
                note=f"BFG {y} UG 24 Gesundheit, Verzeichnis veranschlagter Konten")


def rh_bra(m: Manifest):
    import json
    wanted = re.compile(r"Finanzierungshaushalt\s*[–-]\s*nach Untergliederung und MVAG|"
                        r"Ergebnishaushalt\s*[–-]\s*nach Untergliederung und MVAG", re.I)
    for y, dsid in RH_BRA_DATASETS.items():
        meta = get_json(f"https://www.data.gv.at/api/hub/repo/datasets/{dsid}", subdir="stats_meta")
        if not meta:
            # JSON-LD is served with a different accept header; fall back to text
            txt = get_text(f"https://www.data.gv.at/api/hub/repo/datasets/{dsid}")
            meta = json.loads(txt) if txt else None
        if not meta:
            continue
        for x in meta.get("@graph", []):
            if x.get("@type") != "dcat:Distribution":
                continue
            t = x.get("dct:title")
            t = t.get("@value") if isinstance(t, dict) else (t or "")
            url = (x.get("dcat:accessURL") or {}).get("@id")
            if url and wanted.search(t):
                m.fetch("rh_bra", url, OUT / "rh_bra" / str(y) / safe_name(url.rsplit("/", 1)[-1]),
                        note=f"Bundesrechnungsabschluss {y}: {t.strip()}")


def dvsv(m: Manifest):
    page = "https://www.sozialversicherung.at/cdscontent/?contentid=10007.888557&portal=svportal"
    s = get_text(page)
    if not s:
        return
    for href, label in re.findall(r'<a[^>]+href="([^"]*load\?contentid=10008[^"]*)"[^>]*>(.*?)</a>', s, re.S):
        label = re.sub(r"\s+", " ", re.sub("<[^>]+>", "", html.unescape(label))).strip()
        href = html.unescape(href)
        if "Excel" not in label:
            continue  # PDFs carry the same tables; Excel is the machine-readable edition
        yr = re.search(r"(20\d\d)", label)
        m.fetch("dvsv", urllib.parse.urljoin(page, href),
                OUT / "dvsv" / f"Statistisches_Handbuch_{yr.group(1) if yr else 'x'}_excel.zip", note=label)


def oeak(m: Manifest):
    base = "https://www.aerztekammer.at"
    m.fetch("oeak", base + "/documents/d/content-pool/20260729_oak-arztestatistik-2025",
            OUT / "oeak" / "Aerztestatistik_2025.pdf", note="ÖÄK Ärztestatistik 2025 (Stichtag 31.12.2025)")
    for y in range(2019, 2025):
        s = get_text(f"{base}/statistik-{y}")
        if not s:
            continue
        links = re.findall(r'href="([^"]+)"', s)
        pdf = [x for x in links if re.search(r"rztestatistik[^/]*\.pdf|content-pool/arztestatistik-%d\"?$" % y, x + '"')]
        pdf = pdf or [x for x in links if re.search(r"content-pool/arztestatistik-%d$" % y, x)]
        if pdf:
            m.fetch("oeak", urllib.parse.urljoin(base, html.unescape(pdf[0])), OUT / "oeak" / f"Aerztestatistik_{y}.pdf",
                    note=f"ÖÄK Ärztestatistik {y}")
        else:
            print("  no ÖÄK pdf found for", y)


def zielst(m: Manifest):
    page = ("https://www.sozialministerium.gv.at/Themen/Gesundheit/Gesundheitssystem/Gesundheitsreform-"
            "(Zielsteuerung-Gesundheit)/Zielsteuerung-Gesundheit---Monitoringberichte.html")
    s = get_text(page)
    if not s:
        return
    for href in sorted(set(re.findall(r'href="(/dam/jcr:[^"]+\.pdf)"', s))):
        name = safe_name(href.rsplit("/", 1)[-1])
        m.fetch("zielst", urllib.parse.urljoin(page, html.unescape(href)), OUT / "zielst" / name,
                note=urllib.parse.unquote(href.rsplit("/", 1)[-1]))
    m.fetch("zielst", "https://sozialministerium.at/dam/jcr:90ea0063-4f8b-4af9-86e0-c2da538e1290/ZV_2024_bis_2028.pdf",
            OUT / "zielst" / "ZV_2024_bis_2028.pdf", note="Bundes-Zielsteuerungsvertrag 2024-2028")


def main():
    m = Manifest()
    which = sys.argv[1:] or ["statat", "eurostat", "bmf", "rh_bra", "dvsv", "oeak", "zielst"]
    for name in which:
        print("==", name, flush=True)
        globals()[name](m)
    m.save()
    ok = [r for r in m.rows.values() if r.get("path")]
    print(f"manifest: {len(ok)} files, {sum(r['bytes'] for r in ok) / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
