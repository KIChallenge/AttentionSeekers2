import { readFileSync } from "node:fs";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { foldRun, parseNdjson } from "@sv/contracts";
import { describe, expect, it } from "vitest";
import { renderResultHtml } from "@/components/result/export-html";
import type { Evidence } from "@/components/run/evidence";
import { buildRunBundle } from "./run-bundle";
import { zip } from "./zip";

const runs = path.resolve(import.meta.dirname, "../../../runs");
const events = parseNdjson(readFileSync(path.join(runs, "fixture-wartezeiten.ndjson"), "utf8"));
const evidence: Evidence = { sources: {}, segments: {}, redLines: {} };

/** Reads a zip back through its central directory (what unzip does). */
function unzipAll(buf: Buffer): Record<string, string> {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const out: Record<string, string> = {};
  for (let i = 0; i < count; i++) {
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    out[name] = inflateRawSync(buf.subarray(start, start + size)).toString("utf8");
    p += 46 + nameLen;
  }
  return out;
}

describe("result export", () => {
  const snap = foldRun(events);
  if (!snap.run) throw new Error("fixture has no run");
  const run = snap.run;

  it.each(["de", "en"] as const)("renders all eight sections in %s without scripts", (lang) => {
    const html = renderResultHtml(snap, run, evidence, lang, { origin: "http://x" });
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain(`<html lang="${lang}">`);
    for (let n = 1; n <= 8; n++) expect(html).toContain(`<section id="s${n}">`);
    expect(html).not.toMatch(/<script|<link /i);
    expect(html).toContain(`http://x/runs/${run.id}?view=full`);
  });

  it("escapes run text", () => {
    const evil = { ...run, mandate: { ...run.mandate, question: '<img src=x onerror="1">' } };
    const html = renderResultHtml(snap, evil, evidence, "de", { origin: "http://x" });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=&quot;1&quot;&gt;");
  });
});

describe("run bundle", () => {
  it("zips events, traces, models and a manifest that round-trip", () => {
    const b = buildRunBundle("fixture-wartezeiten", events, evidence, { origin: "http://x" });
    const files = unzipAll(zip(b.entries));
    expect(Object.keys(files)).toEqual(expect.arrayContaining(["manifest.json", "events.ndjson"]));
    expect(files["events.ndjson"]?.trim().split("\n")).toHaveLength(events.length);
    expect(Object.keys(files).some((f) => f.startsWith("traces/"))).toBe(true);
    const manifest = JSON.parse(files["manifest.json"] ?? "{}");
    expect(manifest.format).toBe("sv-run-bundle/1");
    expect(manifest.files.map((f: { name: string }) => f.name)).toContain("model-assignment.json");
    expect(JSON.parse(files["model-assignment.json"] ?? "{}").assignment).toEqual(
      foldRun(events).run?.modelAssignment,
    );
  });
});
