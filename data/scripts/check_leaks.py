"""CON-1/CON-2 guard: scan derived text for person-name patterns that survived masking.
Exit code 1 if any hit; prints context to stdout (run locally, output contains the hits)."""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import importlib

m = importlib.import_module("05_extract_clean")
from common import DERIVED

checks = {"title": lambda t: m.title_hit(t), "first_name": lambda t: bool(m.FIRST_NAME_RULE.search(t)),
          "name_list": lambda t: bool(m.NAME_LIST.search(t))}
hits = 0
for f in ("stellungnahmen.jsonl", "stellungnahmen_segments.jsonl"):
    for line in open(DERIVED / f):
        r = json.loads(line)
        for s in (x for p in r["text"].split("\n\n") for x in m.sentences(p)):
            for k, fn in checks.items():
                if fn(s):
                    hits += 1
                    if hits <= 30:
                        print(f, r.get("id") or r.get("stellungnahme_id"), k, s[:160])
print("leak hits:", hits)
sys.exit(1 if hits else 0)
