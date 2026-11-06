import { Segment, Source } from "@sv/contracts";
import { describe, expect, it } from "vitest";
import {
  buildLawRows,
  extractLines,
  lawSourceId,
  parseSearch,
  provisionSlug,
  segmentAbsaetze,
  versionAsOf,
} from "../src/legal/ris.ts";

// Shape of a RIS BrKons document XML (trimmed from ASVG § 342): page furniture, metadata
// headings, then the "Text" block with the paragraph heading, Absätze and a list.
const XML = `<?xml version="1.0" encoding="utf-8"?><risdok><nutzdaten><abschnitt>
<kzinhalt typ="p"><absatz typ="kz">Bundesrecht konsolidiert</absatz></kzinhalt>
<ueberschrift typ="titel">Kurztitel</ueberschrift><absatz typ="erltext" ct="kurztitel">Allgemeines Sozialversicherungsgesetz</absatz>
<ueberschrift typ="titel">Text</ueberschrift>
<ueberschrift typ="g1" ct="text">ABSCHNITT II.</ueberschrift>
<ueberschrift typ="para" ct="text">Inhalt der Gesamtverträge.</ueberschrift>
<absatz typ="abs" ct="text"><gldsym>§ 342.</gldsym> (1) Die Gesamtverträge haben folgende Gegenstände zu regeln:</absatz>
<liste><aufzaehlung ebene="1"><listelem ct="text"><symbol stellen="2">1.</symbol>die örtliche Verteilung nach § 23 G<gdash />ZG;</listelem>
<listelem ct="text"><symbol stellen="2">2.</symbol>die Auswahl der Vertragsärzte &amp; Einzelverträge;</listelem></aufzaehlung></liste>
<absatz typ="abs" ct="text">(1a) Der Stellenplan nach Abs. 1 Z 1 kann regional vereinbart werden.</absatz>
<absatz typ="abs" ct="text">(2) Die Vergütung ist nach Einzelleistungen zu vereinbaren.</absatz>
<ueberschrift typ="titel">Schlagworte</ueberschrift><absatz typ="erltext">Stellenplan</absatz>
</abschnitt></nutzdaten></risdok>`;

const HIT = {
  OgdSearchResult: {
    OgdDocumentResults: {
      Hits: { "#text": "1" },
      // A single hit arrives as an object, not a one-element list.
      OgdDocumentReference: {
        Data: {
          Metadaten: {
            Technisch: { ID: "NOR40259071" },
            Allgemein: { Geaendert: "2024-06-14" },
            Bundesrecht: {
              Kurztitel: "Allgemeines Sozialversicherungsgesetz",
              Eli: "https://ris.bka.gv.at/eli/bgbl/1955/189/P342/NOR40259071",
              BrKons: {
                Kundmachungsorgan:
                  "BGBl. Nr. 189/1955 zuletzt geändert durch BGBl. I Nr. 191/2023 ",
                Typ: "BG",
                ArtikelParagraphAnlage: "§ 342",
                Paragraphnummer: "342",
                NovellenPublikationsorgan: "BGBl. I Nr.",
                NovellenBgblnummer: "191/2023",
                Inkrafttretensdatum: "2024-01-01",
                Abkuerzung: "ASVG",
                Gesetzesnummer: "10008147",
              },
            },
          },
          Dokumentliste: {
            ContentReference: {
              Urls: {
                ContentUrl: [
                  { DataType: "Xml", Url: "https://ogd.ris.bka.gv.at/x.xml" },
                  { DataType: "Html", Url: "https://ogd.ris.bka.gv.at/x.html" },
                ],
              },
            },
          },
        },
      },
    },
  },
};

describe("RIS search parsing", () => {
  it("normalises a single-object hit", () => {
    const r = parseSearch(HIT);
    expect(r.total).toBe(1);
    expect(r.hits).toHaveLength(1);
    const h = r.hits[0];
    expect(h?.provision).toBe("§ 342");
    expect(h?.validFrom).toBe("2024-01-01");
    expect(h?.validTo).toBeNull();
    expect(h?.amendedBy).toBe("BGBl. I Nr. 191/2023");
    expect(h?.xmlUrl).toBe("https://ogd.ris.bka.gv.at/x.xml");
    expect(h?.promulgation).toBe("BGBl. Nr. 189/1955 zuletzt geändert durch BGBl. I Nr. 191/2023");
  });
  it("replaces en and em dashes with a hyphen", () => {
    const xml = XML.replace("folgende Gegenstände", "folgende \u2013 und \u2014 Gegenstände");
    expect(extractLines(xml).lines[0]).toContain("folgende - und - Gegenstände");
  });
  it("handles an empty result", () => {
    expect(
      parseSearch({ OgdSearchResult: { OgdDocumentResults: { Hits: { "#text": "0" } } } }),
    ).toEqual({
      total: 0,
      hits: [],
    });
  });
});

describe("document text and Absatz segmentation", () => {
  it("keeps only the normative text, heading apart, structural headings dropped", () => {
    const { heading, lines } = extractLines(XML);
    expect(heading).toBe("Inhalt der Gesamtverträge.");
    expect(lines[0]).toBe("§ 342. (1) Die Gesamtverträge haben folgende Gegenstände zu regeln:");
    expect(lines[1]).toBe("1. die örtliche Verteilung nach § 23 G-ZG;");
    expect(lines[2]).toContain("Vertragsärzte & Einzelverträge");
    expect(lines.join(" ")).not.toMatch(/Bundesrecht konsolidiert|Stellenplan$|ABSCHNITT/);
  });
  it("groups list items into their Absatz and keeps exact offsets", () => {
    const { lines } = extractLines(XML);
    const { text, absaetze } = segmentAbsaetze(lines);
    expect(absaetze.map((a) => a.label)).toEqual(["1", "1a", "2"]);
    expect(absaetze[0]?.text.split("\n")).toHaveLength(3);
    for (const a of absaetze) expect(text.slice(a.start, a.end)).toBe(a.text);
  });
  it("treats a provision without numbered Absätze as one segment", () => {
    const { absaetze } = segmentAbsaetze(["§ 351. Die Bestimmungen gelten sinngemäß."]);
    expect(absaetze).toHaveLength(1);
    expect(absaetze[0]?.label).toBeNull();
  });
});

describe("ids", () => {
  it("slugs paragraphs, articles and umlauts", () => {
    expect(provisionSlug("§ 342a")).toBe("342a");
    expect(provisionSlug("Art. 5")).toBe("art-5");
    expect(lawSourceId("ASVG", "§ 342")).toBe("law-asvg-342");
    expect(lawSourceId("ÄrzteG", "§ 52b")).toBe("law-aerzteg-52b");
    expect(lawSourceId("15a-OF", "Art. 31")).toBe("law-15a-of-art-31");
  });
});

describe("as-of rule for law versions", () => {
  const versions = [
    { risId: "a", validFrom: "2010-01-01", validTo: "2019-12-31" },
    { risId: "b", validFrom: "2020-01-01", validTo: "2023-12-31" },
    { risId: "c", validFrom: "2024-01-01", validTo: null },
  ];
  it("picks the version in force on the date", () => {
    expect(versionAsOf(versions, "2018-12-13")?.risId).toBe("a");
    expect(versionAsOf(versions, "2020-01-01")?.risId).toBe("b");
    expect(versionAsOf(versions, "2023-12-31")?.risId).toBe("b");
    expect(versionAsOf(versions, "2026-11-06")?.risId).toBe("c");
  });
  it("returns null before the law existed", () => {
    expect(versionAsOf(versions, "2005-06-01")).toBeNull();
  });
  it("prefers the latest start among overlapping records", () => {
    const v = [...versions, { risId: "c2", validFrom: "2024-07-01", validTo: null }];
    expect(versionAsOf(v, "2025-01-01")?.risId).toBe("c2");
  });
});

describe("contract rows", () => {
  it("builds a valid law Source and Segments", () => {
    const hit = parseSearch(HIT).hits[0];
    if (!hit) throw new Error("no hit");
    const rows = buildLawRows(
      "ASVG",
      hit,
      XML,
      [{ risId: "NOR40259071", validFrom: "2024-01-01", validTo: null, amendedBy: null }],
      "2026-11-06",
      "ris-2026-11-06",
    );
    if (!rows) throw new Error("no rows");
    const s = Source.parse(rows.source);
    expect(s.kind).toBe("law");
    expect(s.title).toBe("ASVG § 342");
    expect(s.url).toBe("https://www.ris.bka.gv.at/eli/bgbl/1955/189/P342/NOR40259071");
    expect(s.law?.heading).toBe("Inhalt der Gesamtverträge.");
    expect(rows.segments.map((g) => Segment.parse(g).id)).toEqual([
      "law-asvg-342#1",
      "law-asvg-342#1a",
      "law-asvg-342#2",
    ]);
  });
});
