"""Export a small, display-only sample of held-out eval generations for the web /models page.

  uv run python -I scripts/export_eval_examples.py <run_dir> [--out out/eval_examples.json]

Writes out/eval_examples.json (committed like persona_fidelity.json: generations and scores only).
Only model generations are exported, never the institution's real reference paragraph or demand,
so no Stellungnahme text leaves the machine. Every exported generation is re-checked with
pii_guard.verify and the export aborts if anything still hits. The web page runs its own name guard
before display as well.

Selection is not cherry-picked: per institution the non-looping row whose adapter in-character score
is nearest the role's median, plus the first looping adapter output to show the failure mode.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))


def sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if len(s.strip()) >= 25]


def loops(text: str) -> bool:
    """A sentence of 25+ characters that occurs three times or more: the repetition failure mode.
    Display flag only; the headline count (27 of 244) is the eval report's own reading."""
    counts: dict[str, int] = {}
    for s in sentences(text):
        counts[s] = counts.get(s, 0) + 1
        if counts[s] >= 3:
            return True
    return False


def clip(text: str, n: int = 900) -> str:
    text = text.replace("\u2014", ", ").strip()
    if len(text) <= n:
        return text
    cut = text[:n]
    k = max(cut.rfind(". "), cut.rfind(".\n"))
    return (cut[: k + 1] if k > n // 2 else cut) + " [...]"


def pack(r: dict) -> dict:
    return {
        "role": r["role"],
        "draft": r["id"],
        "referenceStance": r["ref_stance"],
        "adapter": {"text": clip(r["adapter_text"]), "inCharacter": round(r["adapter_incharacter"], 4),
                    "stance": r["adapter_stance"], "loops": loops(r["adapter_text"])},
        "base": {"text": clip(r["baseline_text"]), "inCharacter": round(r["baseline_incharacter"], 4),
                 "stance": r["baseline_stance"], "loops": loops(r["baseline_text"])},
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("run_dir", type=Path)
    ap.add_argument("--out", type=Path, default=ROOT / "out" / "eval_examples.json")
    a = ap.parse_args()
    rows = [json.loads(line) for line in (a.run_dir / "rows.jsonl").open()]
    by: dict[str, list[dict]] = {}
    for r in rows:
        by.setdefault(r["role"], []).append(r)

    picked = []
    for role in sorted(by):
        xs = sorted((x for x in by[role] if not loops(x["adapter_text"])), key=lambda x: x["adapter_incharacter"])
        if xs:
            picked.append(xs[len(xs) // 2])
    looping = [x for x in rows if loops(x["adapter_text"])]
    if looping:
        picked.append(looping[0])
    examples = [pack(x) for x in picked]

    from pii_guard import verify  # noqa: PLC0415  (spaCy load is slow, only when needed)
    hits = verify([e[k]["text"] for e in examples for k in ("adapter", "base")])
    if hits:
        sys.exit(f"pii_guard: {len(hits)} hit(s) in exported generations, nothing written")

    a.out.write_text(json.dumps({
        "run": a.run_dir.name,
        "rows": len(rows),
        "selection": "per institution the non-looping row nearest the median adapter in-character score, "
                     "plus one looping adapter output; generations only, no reference text",
        "examples": examples,
    }, ensure_ascii=False, indent=1) + "\n")
    print(f"wrote {a.out.name}: {len(examples)} examples")


if __name__ == "__main__":
    main()
