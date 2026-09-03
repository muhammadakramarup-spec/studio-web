// S3 — licence + source coverage gate (SCOPE.md §1, src/library/SPEC.md:30-33,
// reviews/codex_review_S3.md:10). Reads manifest.assets, never the manifest as
// an array.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const MANIFEST_PATH = path.join(REPO_ROOT, "public", "assets", "manifest.json");

function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  const assets = manifest.assets;
  const total = assets.length;
  const pass = assets.every((a) => a.licence === "CC0" && /^https?:\/\//.test(a.sourceUrl));
  const failing = assets.filter((a) => !(a.licence === "CC0" && /^https?:\/\//.test(a.sourceUrl)));

  console.log(`total assets: ${total}`);
  console.log(`licence==="CC0" && sourceUrl matches /^https?:\\/\\//: ${pass}`);
  if (!pass) {
    console.log(`failing ids (first 20): ${failing.slice(0, 20).map((a) => a.id).join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log(`exit 0 — 100% coverage across ${total} assets`);
  }
}

main();
