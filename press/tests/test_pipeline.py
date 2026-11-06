"""End-to-end on the synthetic archive: extraction, CON-1/CON-2 guards, export shapes, splits."""
from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from sv_press import cli, guard, synth
from sv_press.extract import precision_of
from sv_press.text import join_lines, paragraphs, reflow_columns

QUOTES = re.compile(r"[„“”\"»«]")


@pytest.fixture(scope="module")
def run(tmp_path_factory):
    tmp = tmp_path_factory.mktemp("press")
    db = tmp / "synthetic.db"
    synth.build(db)
    work, out = tmp / "work", tmp / "derived"
    cli.main(["all", "--db", str(db), "--work", str(work), "--out", str(out), "--mock"])
    return {"db": db, "work": work, "out": out}


def _all_derived_text(out: Path) -> str:
    return "\n".join(p.read_text() for p in out.rglob("*") if p.is_file())


def _jsonl(p: Path):
    return [json.loads(x) for x in p.read_text().splitlines() if x.strip()]


def test_synthetic_db_has_real_schema(run):
    import sqlite3
    db = sqlite3.connect(run["db"])
    tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master")}
    assert {"docs", "pages", "page_text", "fts"} <= tables
    assert db.execute("SELECT COUNT(*) FROM pages").fetchone()[0] >= 30
    assert db.execute("SELECT COUNT(*) FROM pages WHERE dup_of IS NOT NULL").fetchone()[0] >= 1
    # unicode61 remove_diacritics 2: an ASCII query finds the umlaut spelling
    assert db.execute("SELECT COUNT(*) FROM fts WHERE fts MATCH 'arztekammer'").fetchone()[0] > 0


def test_every_institution_found(run):
    stances = _jsonl(run["out"] / "press_stances.jsonl")
    roles = {s["role"] for s in stances}
    for role in ("social_insurance", "ministry_health", "medical_chamber", "contract_physicians", "elective_physicians",
                 "hospitals", "nursing", "patients", "laender", "ministry_finance", "chamber_labour",
                 "chamber_commerce", "industry_pharma"):
        assert role in roles, role


def test_no_fake_person_survives_anywhere(run):
    text = _all_derived_text(run["out"])
    for name in synth.FAKE_SURNAMES + ["Berthold", "Gundula", "Leopoldine", "Hubsi", "Ottokar", "Zacharias", "Ferdl",
                                       "Engelbert"]:
        assert name.split("-")[0] not in text, name
    # the work dir proves the masking actually fired on those names
    names = json.loads((run["work"] / "masked_names.json").read_text())["all"]
    assert any(n in names for n in ("Quastenhuber", "Moosbrugger", "Pfefferkorn", "Kranawetter"))


def test_no_quotes_offices_or_first_person(run):
    for s in _jsonl(run["out"] / "press_stances.jsonl"):
        t = s["stance_text_de"]
        assert not QUOTES.search(t), t
        assert not guard.office_hit(t), t
        assert not guard.FIRST_PERSON.search(t), t
        assert "[...]" not in t
    # the made-up direct quotes never reach derived/
    text = _all_derived_text(run["out"])
    for q in ("Ambulanz zu, aber der Bund muss zahlen", "Datenmonster", "keine Studien", "historischen Tag"):
        assert q not in text


def test_no_em_dash(run):
    assert "\u2014" not in _all_derived_text(run["out"])
    for p in Path(__file__).resolve().parents[1].rglob("*.py"):
        if ".venv" not in p.parts:
            assert "\u2014" not in p.read_text(), p


def test_source_and_segment_shape(run):
    src = _jsonl(run["out"] / "press_sources.jsonl")
    seg = _jsonl(run["out"] / "press_segments.jsonl")
    assert src and len(src) == len(seg)
    ids = {s["id"] for s in src}
    for s in src:
        assert s["kind"] == "press" and s["personFiltered"] is True and s["licence"]
        assert re.fullmatch(r"\d{4}-\d{2}-\d{2}", s["date"]) and s["datePrecision"] in ("day", "month")
        assert set(s["institution"]) == {"code", "nameDe", "glossEn", "role"}
        assert s["sourceRef"]["pageId"]
    for g in seg:
        assert g["sourceId"] in ids and g["end"] == len(g["text"])


def test_dedup_and_dating(run):
    src = _jsonl(run["out"] / "press_sources.jsonl")
    # the 2009-03-12 Kassen article is reprinted on 2009-03-16: only the earlier one survives
    kassen = [s for s in src if s["institution"]["role"] == "social_insurance" and s["date"].startswith("2009-03")]
    assert [s["date"] for s in kassen] == ["2009-03-12"]
    # the yearly compilation (20100101-20101231) never dates anything
    assert not any(s["date"] == "2010-01-01" for s in src)
    assert not any(s["date"] == "2010-12-30" for s in src)


def test_sft_splits(run):
    rows = _jsonl(run["out"] / "persona_press_sft.jsonl")
    assert rows
    for r in rows:
        assert [m["role"] for m in r["messages"]] == ["system", "user", "assistant"]
        assert (r["meta"]["bt"] == "bt_train") == (r["meta"]["date"] < "2018-09-14")
        assert (r["meta"]["split"] == "train") == (r["meta"]["date"] < "2023-01-01")
    bt = _jsonl(run["out"] / "sft" / "backtest.bt_train.jsonl")
    assert bt and all(r["meta"]["date"] < "2018-09-14" for r in bt)


def test_guard_drops_leaking_rewrite(tmp_path, run):
    """A model that echoes a person or a quote is caught by the export guard, not trusted."""
    from sv_press import export as export_mod
    passages = _jsonl(run["work"] / "passages.jsonl")[:3]
    bad = ["Die Ärztekammer fordert, sagt Präsidentin Dr. Gundula Moosbrugger-Fink, mehr Kassenstellen.",
           "Die Sozialversicherung erklärt: „Wir zahlen nicht.“",
           "Die Kammer folgt dem Kurs von Berthold Quastenhuber bei den Honoraren der Kassenärzte."]
    rw = tmp_path / "rw.jsonl"
    rw.write_text("\n".join(json.dumps({"id": p["id"], "out": {"relevant": True, "topic": "finanzierung", "about": "x y z",
                                                                 "stance": "oppose", "stance_text_de": t}})
                            for p, t in zip(passages, bad)))
    pp = tmp_path / "p.jsonl"
    pp.write_text("\n".join(json.dumps(p, ensure_ascii=False) for p in passages))
    s = export_mod.export(pp, rw, run["work"] / "masked_names.json", tmp_path / "out", Path("/nonexistent"))
    assert s["exported"] == 0


def test_text_helpers():
    assert join_lines("Gesund-\nheitsreform und Ärzte-\nund Pflegekräfte") == "Gesundheitsreform und Ärzte- und Pflegekräfte"
    page = "\n".join(f"{'links ' * 7:<48}{'rechts ' * 6}" for _ in range(10))
    flowed = reflow_columns(page)
    assert flowed.index("rechts") > flowed.rindex("links")
    assert paragraphs("Seite 3\n\nDie Kasse fordert mehr Geld für die Pflege.\n")[0].startswith("Die Kasse")
    assert precision_of("2009/03/Pressespiegel vom 12.3.2009.pdf") == "day"
    assert precision_of("x/20180101-20190125.pdf") is None
    assert precision_of("x/20180101-20180102.pdf") == "day"


def test_office_neutralisation():
    assert "Gesundheitsministerium" in guard.neutralise_offices("Die Gesundheitsministerin will mehr Stellen.")
    assert "Ärztekammer" in guard.neutralise_offices("Der Ärztekammerpräsident lehnt das ab.")
    assert not guard.office_hit(guard.neutralise_offices("Der Kassenobmann warnt vor einem Defizit."))
    assert guard.is_quote("Das ist untragbar, sagt der Patientenanwalt")
    assert not guard.is_quote("Mehr Kassenstellen seien nötig, fordert die Ärztekammer.")
