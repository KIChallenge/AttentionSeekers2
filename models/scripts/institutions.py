"""Institution config shared by the persona-model scripts (configs/institutions.yaml)."""
from __future__ import annotations

import re
from pathlib import Path

import yaml

MODELS = Path(__file__).resolve().parents[1]
CFG = yaml.safe_load((MODELS / "configs" / "institutions.yaml").read_text())
INST: dict = CFG["institutions"]

ALL_NAME_RE = re.compile("|".join(f"(?:{p})" for c in INST.values() for p in c.get("name_patterns", [])))


def mask_institutions(t: str) -> str:
    """Replace every known institution name/abbreviation with [INSTITUTION] (classifier input only)."""
    return ALL_NAME_RE.sub("[INSTITUTION]", t)


def role_of(r: dict) -> str | None:
    for role, c in INST.items():
        if r["agent"] == c["data_agent"] and (not c.get("institution_ids") or r["institution_id"] in c["institution_ids"]):
            return role
    return None


def role_card(role: str) -> str:
    return INST[role]["role_card"].strip()
