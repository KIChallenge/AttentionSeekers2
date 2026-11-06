// Rule table of the legal guardrail (FR-P6). Each rule says which measure it recognises
// (regex over the proposal text, German and English), which provisions it touches, and which
// wording means the measure goes beyond the current law. Every ref must exist in the imported
// legal basis (test/legal.test.ts checks that against data/derived/law_sources.jsonl).
// The reading of the law is a deliberately conservative screening aid, not legal advice.

export type LegalRule = {
  id: string;
  match: RegExp;
  touches: Array<{ ref: string; detail?: string }>;
  change?: { when: RegExp; refs: Array<{ ref: string; detail?: string }> };
  why: string;
};

export const LEGAL_RULES: LegalRule[] = [
  {
    id: "stellenplan",
    match:
      /kassen(?:arzt)?stelle|planstelle|stellenplan|vertragsarzt|vertragsärzt|kassenvertr|contract physician|panel position|statutory (?:practice|post)/i,
    touches: [
      { ref: "ASVG § 342", detail: "Abs. 1 Z 1" },
      { ref: "ASVG § 343", detail: "Abs. 1" },
    ],
    change: {
      // Einzelverträge are voluntary private-law contracts (§ 338, § 343): an obligation to take
      // a Kassenstelle, or posts created without the Ärztekammer, need a statutory change.
      when: /verpflicht|pflicht zu|zwangs|landarztpflicht|ohne (?:zustimmung|einvernehmen) der ärztekammer|einseitig|mandatory|oblig|without the (?:medical )?chamber/i,
      refs: [{ ref: "ASVG § 343" }, { ref: "ASVG § 342", detail: "Abs. 1a" }],
    },
    why: "Stellenplan und Einzelvertrag sind Teil des Gesamtvertrags mit der Ärztekammer.",
  },
  {
    id: "wahlarzt",
    match:
      /wahlarzt|wahlärzt|kostenerstattung|kostenzuschuss|elective physician|private physician|reimbursement of (?:private|elective)/i,
    touches: [{ ref: "ASVG § 131" }],
    change: {
      when: /abschaff|streich|kürz|senk|erhöh|deckel|abolish|cut|cap|reduce|raise/i,
      refs: [{ ref: "ASVG § 131", detail: "Abs. 1" }],
    },
    why: "Die Wahlarzt-Kostenerstattung (80 % des Kassentarifs) steht im Gesetz.",
  },
  {
    id: "wartezeit",
    match:
      /wartezeit|termingarantie|terminservice|terminvergabe|höchstwartezeit|waiting time|appointment (?:guarantee|service)/i,
    touches: [{ ref: "ASVG § 342", detail: "Abs. 1 Z 3" }],
    change: {
      when: /rechtsanspruch|garantie|gesetzlich|einklagbar|legal (?:right|entitlement)|guarantee|statutory/i,
      refs: [{ ref: "ASVG § 342", detail: "Abs. 1 Z 3" }],
    },
    why: "Pflichten der Vertragsärzte regelt der Gesamtvertrag; ein Rechtsanspruch auf einen Termin braucht das Gesetz.",
  },
  {
    id: "honorar",
    match:
      /honorar|tarif|vergütung|pauschal|leistungskatalog|fee schedule|remuneration|capitation|tariff/i,
    touches: [{ ref: "ASVG § 342", detail: "Abs. 2 und 2a" }],
    change: {
      when: /bundesweit gesetzlich|per gesetz|durch gesetz|by law|statutory fee/i,
      refs: [{ ref: "ASVG § 342", detail: "Abs. 2" }],
    },
    why: "Honorarordnungen vereinbaren die Gesamtvertragspartner.",
  },
  {
    id: "primaerversorgung",
    match: /primärversorg|\bpve\b|\bpvz\b|\bpvn\b|primary care/i,
    touches: [
      { ref: "PrimVG § 2" },
      { ref: "PrimVG § 8" },
      { ref: "PrimVG § 14" },
      { ref: "ASVG § 342b" },
    ],
    change: {
      when: /ohne (?:ärztekammer|zustimmung)|vorrang|ein(?:e|en)? ärzt(?:in|e)? (?:reicht|genügt)|gründung erleichter|kernteam|without (?:the )?chamber|lower (?:the )?threshold|single physician/i,
      refs: [{ ref: "PrimVG § 2" }, { ref: "PrimVG § 14" }],
    },
    why: "Kernteam, Auswahlverfahren und Vertrag einer PVE regelt das PrimVG.",
  },
  {
    id: "pflege",
    match:
      /pflege|community nurse|diplomiert|dgkp|task.?shifting|aufgabenverschieb|kompetenz|nurse|nursing/i,
    touches: [{ ref: "GuKG § 14" }, { ref: "GuKG § 15" }, { ref: "ÄrzteG § 49", detail: "Abs. 3" }],
    change: {
      when: /verordn|verschreib|rezept|eigenständig|eigenverantwortlich|erweiter|prescri|independent/i,
      refs: [{ ref: "GuKG § 15a" }, { ref: "GuKG § 15b" }, { ref: "GuKG § 15" }],
    },
    why: "Was die Pflege eigenverantwortlich oder nach ärztlicher Anordnung darf, legt das GuKG fest.",
  },
  {
    id: "gruppenpraxis",
    match:
      /gruppenpraxis|gruppenpraxen|anstellung von ärzt|angestellte ärzt|group practice|employ(?:ed|ing) (?:doctors|physicians)/i,
    touches: [{ ref: "ÄrzteG § 52a" }, { ref: "ASVG § 342a" }, { ref: "ASVG § 342e" }],
    why: "Gruppenpraxen und Anstellung in Vertragsordinationen sind im ÄrzteG und im Gesamtvertrag geregelt.",
  },
  {
    id: "finanzierung",
    match:
      /finanzierung aus einer hand|gemeinsame(?:r|n)? (?:topf|finanzierung|budget)|pool|spitalsambulanz|ambulanter bereich|landesgesundheitsfonds|single (?:payer|fund)|pooled fund|joint (?:budget|financing)|hospital outpatient/i,
    touches: [{ ref: "15a-OF Art. 14" }, { ref: "15a-OF Art. 29" }, { ref: "15a-OF Art. 45" }],
    change: {
      when: /aus einer hand|einheitlich|zusammenleg|neue(?:r|n)? (?:fonds|träger)|single (?:payer|fund)|merge/i,
      refs: [{ ref: "15a-OF Art. 14" }, { ref: "15a-OF Art. 52" }],
    },
    why: "Die Mittelströme zwischen Bund, Ländern und SV legt die Art. 15a Vereinbarung fest; eine Neuordnung braucht eine neue Vereinbarung.",
  },
  {
    id: "planung",
    match:
      /\brsg\b|\bösg\b|strukturplan|versorgungsplan|zielsteuerung|bedarfsplanung|structural plan|capacity planning/i,
    touches: [{ ref: "G-ZG § 23" }, { ref: "G-ZG § 21" }, { ref: "15a-OF Art. 5" }],
    why: "Verbindliche Teile von ÖSG und RSG werden nach § 23 G-ZG per Verordnung festgelegt.",
  },
];
