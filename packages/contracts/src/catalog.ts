import type { Role } from "./primitives.ts";
import type { Template } from "./room.ts";

// Static roster of institutions (FR-A2 core nine, FR-A9 optional). Institutions only,
// never a person (CON-1/CON-2). Colour tokens are defined in apps/web/app/globals.css.

export interface CatalogAgent {
  id: string;
  code: string;
  nameDe: string;
  glossEn: string;
  role: Role;
  origin: "core" | "optional";
  mode: "fitted" | "prompted";
  color: string;
}

export const AGENT_CATALOG: readonly CatalogAgent[] = [
  {
    id: "gm",
    code: "GM",
    nameDe: "Gesundheitsministerium",
    glossEn: "Federal Ministry of Health",
    role: "ministry_health",
    origin: "core",
    mode: "fitted",
    color: "var(--c-gm)",
  },
  {
    id: "sv",
    code: "SV",
    nameDe: "Sozialversicherung",
    glossEn: "Social insurance (Dachverband, ÖGK)",
    role: "social_insurance",
    origin: "core",
    mode: "fitted",
    color: "var(--c-sv)",
  },
  {
    id: "ak",
    code: "ÄK",
    nameDe: "Ärztekammer",
    glossEn: "Medical Chamber",
    role: "medical_chamber",
    origin: "core",
    mode: "fitted",
    color: "var(--c-ak)",
  },
  {
    id: "va",
    code: "VÄ",
    nameDe: "Vertragsärzt:innen",
    glossEn: "Contracted physicians",
    role: "contract_physicians",
    origin: "core",
    mode: "fitted",
    color: "var(--c-va)",
  },
  {
    id: "ka",
    code: "KA",
    nameDe: "Krankenanstalten",
    glossEn: "Hospital operators",
    role: "hospitals",
    origin: "core",
    mode: "fitted",
    color: "var(--c-ka)",
  },
  {
    id: "pf",
    code: "PF",
    nameDe: "Pflegevertretung",
    glossEn: "Nursing representation",
    role: "nursing",
    origin: "core",
    mode: "fitted",
    color: "var(--c-pf)",
  },
  {
    id: "bl",
    code: "BL",
    nameDe: "Bundesländer",
    glossEn: "Federal states (Länder)",
    role: "laender",
    origin: "core",
    mode: "fitted",
    color: "var(--c-bl)",
  },
  {
    id: "pv",
    code: "PV",
    nameDe: "Patientenvertretung",
    glossEn: "Patient advocacy",
    role: "patients",
    origin: "core",
    mode: "fitted",
    color: "var(--c-pv)",
  },
  {
    id: "fm",
    code: "FM",
    nameDe: "Finanzministerium",
    glossEn: "Federal Ministry of Finance",
    role: "ministry_finance",
    origin: "core",
    mode: "fitted",
    color: "var(--c-fm)",
  },
  {
    id: "nr",
    code: "NR",
    nameDe: "Gesetzgeber (Nationalratsmehrheit)",
    glossEn: "Legislature (National Council majority)",
    role: "legislature",
    origin: "optional",
    mode: "prompted",
    color: "var(--c-opt)",
  },
  {
    id: "ph",
    code: "PH",
    nameDe: "Public-Health-Expertise",
    glossEn: "Public health expertise",
    role: "public_health",
    origin: "optional",
    mode: "prompted",
    color: "var(--c-opt)",
  },
  {
    id: "wk",
    code: "WK",
    nameDe: "Wirtschaftskammer",
    glossEn: "Chamber of Commerce",
    role: "chamber_commerce",
    origin: "optional",
    mode: "fitted",
    color: "var(--c-opt)",
  },
  {
    id: "abk",
    code: "AK",
    nameDe: "Arbeiterkammer",
    glossEn: "Chamber of Labour",
    role: "chamber_labour",
    origin: "optional",
    mode: "fitted",
    color: "var(--c-opt)",
  },
  {
    id: "lk",
    code: "LK",
    nameDe: "Landwirtschaftskammer",
    glossEn: "Chamber of Agriculture",
    role: "chamber_agriculture",
    origin: "optional",
    mode: "prompted",
    color: "var(--c-opt)",
  },
  {
    id: "ind",
    code: "IP",
    nameDe: "Industrie/Pharma",
    glossEn: "Industry and pharma",
    role: "industry_pharma",
    origin: "optional",
    mode: "prompted",
    color: "var(--c-opt)",
  },
];

export const CORE_AGENT_IDS = AGENT_CATALOG.filter((a) => a.origin === "core").map((a) => a.id);

export function catalogAgent(id: string): CatalogAgent | undefined {
  return AGENT_CATALOG.find((a) => a.id === id);
}

export const TEMPLATES: ReadonlyArray<{ id: Template; de: string; en: string; question: string }> =
  [
    {
      id: "wartezeiten",
      de: "Wartezeiten Facharzt",
      en: "Specialist waiting times",
      question:
        "Wie können die Wartezeiten auf Facharzttermine innerhalb von fünf Jahren um 20 % reduziert werden, ohne die Gesundheitsausgaben um mehr als 5 % zu erhöhen?",
    },
    {
      id: "honorarverhandlungen",
      de: "Honorarverhandlungen",
      en: "Fee negotiations",
      question:
        "Wie kann ein neuer Honorarkatalog für Kassenärzt:innen gestaltet werden, der Versorgungslücken schließt und kostenneutral bleibt?",
    },
    {
      id: "spitalsplanung",
      de: "Spitalsplanung",
      en: "Hospital planning",
      question:
        "Wie kann die Spitalsplanung so umgestellt werden, dass ambulante Versorgung Spitalsambulanzen bis 2030 spürbar entlastet?",
    },
    {
      id: "pflegereform",
      de: "Pflegereform",
      en: "Long-term care reform",
      question:
        "Wie kann der Personalmangel in der Pflege bis 2030 um ein Drittel reduziert werden?",
    },
    {
      id: "pve",
      de: "Primärversorgungseinheiten",
      en: "Primary care units",
      question: "Wie kann die Zahl der Primärversorgungseinheiten bis 2028 verdoppelt werden?",
    },
    {
      id: "impfstrategie",
      de: "Impfstrategie",
      en: "Vaccination strategy",
      question:
        "Wie kann die Durchimpfungsrate bei Erwachsenen für empfohlene Impfungen in drei Jahren um 15 Prozentpunkte steigen?",
    },
    {
      id: "neue_leistungen",
      de: "Neue Leistungen",
      en: "New benefits",
      question:
        "Unter welchen Bedingungen soll eine neue Leistung in den Leistungskatalog der Krankenversicherung aufgenommen werden?",
    },
  ];
