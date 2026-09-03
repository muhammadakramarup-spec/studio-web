// S3 — independent triangle gate (SCOPE.md, DECISIONS.md #12/Q3).
// This is a SEPARATE process from build-manifest.mjs: it reads manifest.json
// off disk, then re-opens and re-parses every referenced .glb from scratch,
// recomputing triangle count independently and comparing against the value
// manifest.json already carries. It never trusts asset.triangles as ground
// truth — it recomputes it fresh from the file bytes every time.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseGLBJson, countTriangles } from "./glb-parse.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const MANIFEST_PATH = path.join(REPO_ROOT, "public", "assets", "manifest.json");
const PUBLIC_DIR = path.join(REPO_ROOT, "public");

function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  if (!Array.isArray(manifest.assets)) {
    console.error("FAIL: manifest.assets is not an array — root shape violated");
    process.exitCode = 1;
    return;
  }

  const modelAssets = manifest.assets.filter((a) => a.kind === "model");
  let checked = 0;
  let failures = 0;
  const failureDetails = [];

  for (const asset of modelAssets) {
    const filePath = path.join(PUBLIC_DIR, asset.fileUrl.replace(/^\//, ""));
    if (!fs.existsSync(filePath)) {
      failures++;
      failureDetails.push(`${asset.id}: file missing at ${filePath}`);
      continue;
    }
    let actualTriangles;
    try {
      const json = parseGLBJson(filePath);
      actualTriangles = countTriangles(json);
    } catch (err) {
      failures++;
      failureDetails.push(`${asset.id}: parse error — ${err.message}`);
      continue;
    }
    checked++;
    const withinGate = actualTriangles <= 500000;
    const matches = actualTriangles === asset.triangles;
    if (!matches || !withinGate) {
      failures++;
      failureDetails.push(
        `${asset.id}: actualTriangles=${actualTriangles} manifest.triangles=${asset.triangles} matches=${matches} withinGate=${withinGate}`
      );
    }
  }

  console.log(`model assets in manifest: ${modelAssets.length}`);
  console.log(`checked (file opened + parsed): ${checked}`);
  console.log(`failures: ${failures}`);
  if (failures > 0) {
    console.log("--- failure details (first 50) ---");
    for (const line of failureDetails.slice(0, 50)) console.log(line);
    process.exitCode = 1;
  } else {
    console.log(`PASS: all ${checked} model assets — actualTriangles === asset.triangles && actualTriangles <= 500000`);
  }
}

main();
