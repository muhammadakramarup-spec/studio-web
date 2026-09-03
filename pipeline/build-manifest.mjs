// S3 — builds public/assets/manifest.json from the extracted Kenney GLBs.
// Ships every GLB UNCHANGED (decision #12): no Draco, no per-model thumbnail.
// Triangle counts here come from this same parse; the separate
// pipeline/verify-triangles.mjs re-parses every file from scratch as the
// independent gate the SCOPE requires — this script is not that gate.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseGLBJson, countTriangles, getAnimationNames } from "./glb-parse.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const KENNEY_DIR = path.join(REPO_ROOT, "public", "assets", "kenney");
const MANIFEST_PATH = path.join(REPO_ROOT, "public", "assets", "manifest.json");

function titleCase(slug) {
  return slug
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function main() {
  const kitDirs = fs
    .readdirSync(KENNEY_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== "thumbs")
    .map((d) => d.name)
    .sort();

  /** @type {any[]} */
  const assets = [];
  let totalTriangleFailures = 0;

  for (const kit of kitDirs) {
    const kitDir = path.join(KENNEY_DIR, kit);
    const files = fs
      .readdirSync(kitDir)
      .filter((f) => f.toLowerCase().endsWith(".glb"))
      .sort();

    for (const file of files) {
      const filePath = path.join(kitDir, file);
      const baseName = file.replace(/\.glb$/i, "");
      const stat = fs.statSync(filePath);
      const json = parseGLBJson(filePath);
      const triangles = countTriangles(json);
      const animationClipNames = getAnimationNames(json);

      if (triangles > 500000) {
        totalTriangleFailures++;
        console.error(`TRIANGLE GATE FAIL (build time): ${kit}/${baseName} = ${triangles}`);
      }

      /** @type {any} */
      const asset = {
        id: `kenney/${kit}/${baseName}`,
        kind: "model",
        name: titleCase(baseName),
        source: "kenney",
        licence: "CC0",
        sourceUrl: `https://kenney.nl/assets/${kit}`,
        category: kit,
        triangles,
        fileUrl: `/assets/kenney/${kit}/${file}`,
        fileBytes: stat.size,
        thumbnailUrl: `/assets/kenney/thumbs/${kit}.png`,
      };
      if (animationClipNames.length > 0) {
        asset.animationClipNames = animationClipNames;
      }
      assets.push(asset);
    }
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    pipelineVersion: "s3-wave2-1",
    assets,
  };

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  console.log(`assets written: ${assets.length}`);
  console.log(`kits: ${kitDirs.length}`);
  console.log(`triangle failures at build time: ${totalTriangleFailures}`);
  const byKit = {};
  for (const a of assets) byKit[a.category] = (byKit[a.category] || 0) + 1;
  console.log("per kit:", JSON.stringify(byKit, null, 2));

  if (totalTriangleFailures > 0) {
    process.exitCode = 1;
  }
}

main();
