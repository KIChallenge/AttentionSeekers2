// The legal basis for the waiting-time and health-financing questions (FR-P6). Gesetzesnummern
// are RIS BrKons ids; `ranges` are paragraph or article number ranges (RIS Abschnitt.Von/Bis,
// which include the lettered sections such as § 342a), `only` narrows to listed provisions.

export type LawTarget = {
  /** Short key used in titles and ids: "ASVG", "PrimVG", "15a-ZG". */
  key: string;
  gesetzesnummer: string;
  unit: "Paragraph" | "Artikel";
  ranges?: Array<[number, number]>;
  only?: string[];
  /** Provisions in a range that are off topic (ASVG §§ 351b ff.: Erstattungskodex). */
  exclude?: RegExp;
  why: string;
};

export const LAW_TARGETS: LawTarget[] = [
  {
    key: "ASVG",
    gesetzesnummer: "10008147",
    unit: "Paragraph",
    ranges: [
      [131, 131],
      [338, 351],
    ],
    exclude: /^§ 351[b-z]$/,
    why: "Vertragspartnerrecht (Gesamtvertrag, Stellenplan, Einzelvertrag, Honorierung) und Wahlarzt-Kostenerstattung (§ 131)",
  },
  {
    key: "PrimVG",
    gesetzesnummer: "20009948",
    unit: "Paragraph",
    why: "Primärversorgungseinheiten: Organisation, Versorgungsauftrag, Vertrag",
  },
  {
    key: "G-ZG",
    gesetzesnummer: "20009791",
    unit: "Paragraph",
    why: "Zielsteuerung-Gesundheit auf Bundesebene, ÖSG und RSG, Verbindlicherklärung",
  },
  {
    key: "15a-ZG",
    gesetzesnummer: "20012820",
    unit: "Artikel",
    why: "Art. 15a B-VG Vereinbarung Zielsteuerung-Gesundheit (BGBl. I Nr. 1/2025)",
  },
  {
    key: "15a-OF",
    gesetzesnummer: "20012819",
    unit: "Artikel",
    why: "Art. 15a B-VG Vereinbarung Organisation und Finanzierung des Gesundheitswesens (BGBl. I Nr. 2/2025)",
  },
  {
    key: "ÄrzteG",
    gesetzesnummer: "10011138",
    unit: "Paragraph",
    ranges: [
      [49, 49],
      [52, 52],
      [84, 84],
    ],
    only: ["§ 49", "§ 52a", "§ 52b", "§ 84"],
    why: "Delegation ärztlicher Tätigkeiten, Gruppenpraxen und Kassenplanstellen, Kurie niedergelassene Ärzte",
  },
  {
    key: "GuKG",
    gesetzesnummer: "10011026",
    unit: "Paragraph",
    ranges: [
      [12, 16],
      [83, 83],
    ],
    why: "Kompetenzen der Pflege für Task Shifting (Diagnostik, Therapie, Weiterverordnung)",
  },
];
