// Pure parsers for the persona-model track's committed result files (models/out/*.md,
// models/cards/*.md, models/README.md, models/configs/institutions.yaml). The page reads
// numbers from these files at request time instead of hardcoding them, so a rerun of
// eval_report.py or add_char_head.py shows up without a web change.

export interface MdTable {
  header: string[];
  rows: string[][];
}

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

/** Every GitHub-style pipe table in a markdown string. */
export function parseMdTables(md: string): MdTable[] {
  const lines = md.split("\n");
  const out: MdTable[] = [];
  for (let i = 0; i < lines.length - 1; i++) {
    const head = lines[i] ?? "";
    const sep = lines[i + 1] ?? "";
    if (!head.trim().startsWith("|") || !/^\s*\|[\s:|-]+\|\s*$/.test(sep)) continue;
    const table: MdTable = { header: cells(head), rows: [] };
    let j = i + 2;
    while (j < lines.length && (lines[j] ?? "").trim().startsWith("|")) {
      table.rows.push(cells(lines[j] ?? ""));
      j++;
    }
    out.push(table);
    i = j - 1;
  }
  return out;
}

/** Strips markdown emphasis and thousands separators, then reads a number; null if none. */
export function num(cell: string | undefined): number | null {
  if (!cell) return null;
  const m = cell
    .replace(/\*\*/g, "")
    .replace(/,/g, "")
    .match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

const plain = (s: string) => s.replace(/\*\*/g, "").replace(/`/g, "").trim();

function findTable(tables: MdTable[], ...cols: string[]): MdTable | undefined {
  return tables.find((t) => cols.every((c) => t.header.includes(c)));
}

export interface EvalRow {
  role: string;
  n: number | null;
  inCharAdapter: number | null;
  inCharBase: number | null;
  signAdapter: number | null;
  signBase: number | null;
  within1Adapter: number | null;
  within1Base: number | null;
}
export interface TrainRow {
  role: string;
  nTrain: number | null;
  nHeldout: number | null;
  trainLoss: number | null;
  evalLoss: number | null;
  seconds: number | null;
}
export interface EvalReport {
  run: string | null;
  judge: string | null;
  rows: EvalRow[];
  all: EvalRow | null;
  training: TrainRow[];
  loops: { n: number; of: number } | null;
}

/** models/out/eval_sagemaker.md, written by models/aws/eval_report.py. */
export function parseEvalReport(md: string): EvalReport {
  const tables = parseMdTables(md);
  const ev = findTable(tables, "institution", "in-char adapter", "in-char baseline");
  const tr = findTable(tables, "institution", "n train", "eval loss");
  const rows: EvalRow[] = [];
  let all: EvalRow | null = null;
  const col = (t: MdTable, name: string) => t.header.indexOf(name);
  if (ev) {
    for (const r of ev.rows) {
      const get = (name: string) => num(r[col(ev, name)]);
      const row: EvalRow = {
        role: plain(r[0] ?? ""),
        n: get("n"),
        inCharAdapter: get("in-char adapter"),
        inCharBase: get("in-char baseline"),
        signAdapter: get("sign adapter"),
        signBase: get("sign baseline"),
        within1Adapter: get("within1 adapter"),
        within1Base: get("within1 baseline"),
      };
      if (row.role.startsWith("all")) all = row;
      else rows.push(row);
    }
  }
  const training: TrainRow[] = (tr?.rows ?? []).map((r) => {
    const get = (name: string) => num(r[col(tr as MdTable, name)]);
    return {
      role: plain(r[0] ?? ""),
      nTrain: get("n train"),
      nHeldout: get("n held-out"),
      trainLoss: get("train loss"),
      evalLoss: get("eval loss"),
      seconds: get("seconds"),
    };
  });
  const loop = md.match(/(\d+) of (\d+) adapter outputs loop/);
  return {
    run: md.match(/Runs?: `([^`]+)`/)?.[1] ?? null,
    judge: md.match(/judge `([^`]+)`/)?.[1] ?? null,
    rows,
    all,
    training,
    loops: loop ? { n: Number(loop[1]), of: Number(loop[2]) } : null,
  };
}

export interface ClassifierReport {
  trainParagraphs: number | null;
  heldoutParagraphs: number | null;
  macroF1: {
    char: number | null;
    ensemble: number | null;
    setfit: number | null;
    frozen: number | null;
  };
  perClass: Array<{ role: string; n: number | null; f1: number | null }>;
}

/** models/cards/classifier_report.md (copy of out/classifier/report.md, metrics only). */
export function parseClassifierReport(md: string): ClassifierReport {
  const tables = parseMdTables(md);
  const t = findTable(tables, "institution", "F1 char");
  const iF1 = t ? t.header.indexOf("F1 char") : -1;
  const iN = t ? t.header.indexOf("n held-out") : -1;
  const m = (re: RegExp) => num(md.match(re)?.[1]);
  return {
    trainParagraphs: m(/all (\d+) train paragraphs/),
    heldoutParagraphs: m(/\((\d+) paragraphs\)/),
    macroF1: {
      char: m(/char TF-IDF alone ([\d.]+)/),
      ensemble: m(/ensemble ([\d.]+)\*\*/),
      setfit: m(/SetFit alone ([\d.]+)/),
      frozen: m(/frozen embeddings ([\d.]+)/),
    },
    perClass: (t?.rows ?? []).map((r) => ({
      role: plain(r[0] ?? ""),
      n: num(r[iN]),
      f1: num(r[iF1]),
    })),
  };
}

export interface CostRow {
  item: string;
  duration: string;
  usd: string;
  total: boolean;
}
export interface Infra {
  trainingJob: string | null;
  billableSeconds: number | null;
  trainingUsd: number | null;
  endpoint: string | null;
  instance: string | null;
  region: string | null;
  costs: CostRow[];
}

/** Costs table and infrastructure names from models/README.md (SageMaker section). */
export function parseInfra(md: string): Infra {
  const t = findTable(parseMdTables(md), "item", "duration", "USD");
  const costs: CostRow[] = (t?.rows ?? []).map((r) => ({
    item: plain(r[0] ?? ""),
    duration: plain(r[1] ?? ""),
    usd: plain(r[2] ?? ""),
    total: (r[0] ?? "").includes("**"),
  }));
  const job = costs.find((c) => c.item.startsWith("training job"));
  return {
    trainingJob: md.match(/training job `([^`]+)`/)?.[1] ?? null,
    billableSeconds: num(job?.duration),
    trainingUsd: num(job?.usd),
    endpoint: md.match(/endpoint `([^`]+)`/)?.[1] ?? null,
    instance: md.match(/one `(ml\.[a-z0-9.]+)`/)?.[1] ?? null,
    region: md.match(/Region `([a-z0-9-]+)`/)?.[1] ?? null,
    costs,
  };
}

export interface InstitutionCard {
  role: string;
  label: string;
  roleCard: string;
}

/**
 * Minimal reader for models/configs/institutions.yaml: role key, label and the folded
 * (`>-`) role_card block. Not a general YAML parser; the file's layout is fixed.
 */
export function parseInstitutions(yaml: string): InstitutionCard[] {
  const out: InstitutionCard[] = [];
  let cur: InstitutionCard | null = null;
  let inCard = false;
  let inInstitutions = false;
  for (const line of yaml.split("\n")) {
    if (/^institutions:\s*$/.test(line)) {
      inInstitutions = true;
      continue;
    }
    if (/^\S/.test(line) && !line.startsWith("#")) {
      inInstitutions = false;
      inCard = false;
      continue;
    }
    if (!inInstitutions) continue;
    const key = line.match(/^ {2}([a-z_]+):\s*$/);
    if (key?.[1]) {
      cur = { role: key[1], label: key[1], roleCard: "" };
      out.push(cur);
      inCard = false;
      continue;
    }
    if (!cur) continue;
    const field = line.match(/^ {4}([a-z_]+):\s*(.*)$/);
    if (field) {
      inCard = field[1] === "role_card" && field[2]?.startsWith(">") === true;
      if (field[1] === "label") cur.label = (field[2] ?? "").trim();
      continue;
    }
    if (inCard && /^ {6}\S/.test(line)) {
      cur.roleCard = `${cur.roleCard} ${line.trim()}`.trim();
    }
  }
  return out;
}

export type Verdict = "better" | "worse" | "tie";

/** Below this absolute difference in mean in-character probability the two count as a tie. */
export const TIE_MARGIN = 0.05;

export function verdict(adapter: number | null, base: number | null): Verdict | null {
  if (adapter === null || base === null) return null;
  const d = adapter - base;
  if (Math.abs(d) < TIE_MARGIN) return "tie";
  return d > 0 ? "better" : "worse";
}
