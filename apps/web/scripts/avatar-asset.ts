// Rebuilds public/avatars/figure.glb, the one figure the 3D stage instances per institution.
//
//   pnpm --filter @sv/web avatar:asset [--src path/to/mpfb.glb]
//
// Source: TalkingHead's example avatar "mpfb.glb", built with Blender + MPFB (MakeHuman), CC0,
// pinned to the commit below and checked by SHA-256. It is a parametric, generic MakeHuman base
// mesh, not a scan of or a likeness of any person. The script removes the photographic skin and
// clothing textures (the stage paints flat toon colours at runtime, CON-1), keeps the small eye
// texture, then quantizes and meshopt-compresses the geometry: 36.8 MB in, about 3 MB out.
// Bones, the "Armature" root and all ARKit + Oculus viseme blend shapes are preserved.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, quantize } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../public/avatars/figure.glb");

const COMMIT = "6318ff8c798e4a661fcd70c9373c4ab789c822bb";
const URL_SRC = `https://raw.githubusercontent.com/met4citizen/TalkingHead/${COMMIT}/avatars/mpfb.glb`;
const SHA256 = "63c645a2a863b9972e9a9c2ed576a1de4c390b8475508e1473e69c87a3ee299c";

/** Materials whose textures are dropped: realistic skin, clothing, hair, teeth, tongue. */
const STRIP = ["body", "casualsuit", "ponytail", "teeth", "tongue"];

async function source(): Promise<Uint8Array> {
  const i = process.argv.indexOf("--src");
  const local = i > 0 ? process.argv[i + 1] : undefined;
  const buf = local
    ? new Uint8Array(readFileSync(local))
    : new Uint8Array(await (await fetch(URL_SRC)).arrayBuffer());
  const sha = createHash("sha256").update(buf).digest("hex");
  if (sha !== SHA256) throw new Error(`mpfb.glb checksum mismatch: ${sha}`);
  return buf;
}

async function main() {
  await MeshoptDecoder.ready;
  await MeshoptEncoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    "meshopt.decoder": MeshoptDecoder,
    "meshopt.encoder": MeshoptEncoder,
  });
  const doc = await io.readBinary(await source());

  for (const mat of doc.getRoot().listMaterials()) {
    const name = mat.getName().toLowerCase();
    if (!STRIP.some((s) => name.includes(s))) continue;
    mat.setBaseColorTexture(null);
    mat.setNormalTexture(null);
    mat.setAlphaMode("OPAQUE");
  }

  await doc.transform(
    prune({ keepLeaves: true, keepAttributes: false }),
    dedup(),
    quantize(),
    meshopt({ encoder: MeshoptEncoder, level: "high" }),
  );

  if (!existsSync(path.dirname(out))) mkdirSync(path.dirname(out), { recursive: true });
  const bin = await io.writeBinary(doc);
  writeFileSync(out, bin);
  console.log(
    `wrote ${path.relative(process.cwd(), out)} (${(bin.byteLength / 1e6).toFixed(2)} MB)`,
  );
}

await main();
