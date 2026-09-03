// S3 — HDRI decode gate (DECISIONS.md #15: fetch 12 at 1k, floor 6 that decode
// through three's RGBELoader). RGBELoader.parse() is pure buffer parsing with
// no WebGL/DOM dependency, so this runs as a plain Node script against the
// exact same three@0.170.0 RGBELoader the app ships, reading each .hdr fresh
// off disk (independent of the fetch step).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const HDRI_DIR = path.join(REPO_ROOT, "public", "assets", "hdri");

function main() {
  const files = fs.readdirSync(HDRI_DIR).filter((f) => f.toLowerCase().endsWith(".hdr"));
  const loader = new RGBELoader();
  let ok = 0;
  const details = [];

  for (const file of files) {
    const filePath = path.join(HDRI_DIR, file);
    const buf = fs.readFileSync(filePath);
    const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    try {
      const result = loader.parse(arrayBuffer);
      const valid = !!(result && result.width > 0 && result.height > 0 && result.data && result.data.length > 0);
      if (valid) {
        ok++;
        details.push(`OK   ${file} — ${result.width}x${result.height}, ${result.data.length} samples`);
      } else {
        details.push(`FAIL ${file} — parsed but no usable data`);
      }
    } catch (err) {
      details.push(`FAIL ${file} — ${err.message}`);
    }
  }

  console.log(`hdri files found: ${files.length}`);
  for (const line of details) console.log(line);
  console.log(`\ndecoded OK: ${ok}/${files.length} (floor is 6)`);
  if (ok < 6) {
    process.exitCode = 1;
  }
}

main();
