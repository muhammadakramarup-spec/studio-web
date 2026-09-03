// S3 — blocking Wave-2 HDRI fetch (DECISIONS.md #7, #15; SCOPE.md §1).
// Fetches 12 Poly Haven HDRIs at 1k resolution (CC0) into public/assets/hdri/.
// Acceptance floor is 6 that decode through three's RGBELoader (checked
// separately by tests/s3.spec.ts in a real browser).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(REPO_ROOT, "public", "assets", "hdri");
const MANIFEST_PATH = path.join(REPO_ROOT, "public", "assets", "manifest.json");

// 12 candidate slugs: a mix of studio/indoor + outdoor/sky, all well-known
// small/reliable Poly Haven HDRIs suitable for product-style lighting.
const CANDIDATE_SLUGS = [
  "studio_small_03",
  "brown_photostudio_02",
  "royal_esplanade",
  "kloofendal_48d_partly_cloudy_puresky",
  "venice_sunset",
  "small_hangar_01",
  "photo_studio_01",
  "quarry_01",
  "sunflowers",
  "autumn_forest_04",
  "industrial_sunset_puresky",
  "neon_photostudio",
];

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const assetsInfo = await fetchJson("https://api.polyhaven.com/assets?t=hdris");
  const results = [];

  for (const slug of CANDIDATE_SLUGS) {
    if (!(slug in assetsInfo)) {
      console.error(`SKIP ${slug}: not found in Poly Haven asset list`);
      continue;
    }
    const info = assetsInfo[slug];
    let files;
    try {
      files = await fetchJson(`https://api.polyhaven.com/files/${slug}`);
    } catch (err) {
      console.error(`SKIP ${slug}: files lookup failed — ${err.message}`);
      continue;
    }
    const hdriFiles = files.hdri;
    if (!hdriFiles || !hdriFiles["1k"]) {
      console.error(`SKIP ${slug}: no 1k hdri entry`);
      continue;
    }
    // Prefer .hdr; Poly Haven's 1k bucket keys are typically "hdr" and "exr".
    const entry = hdriFiles["1k"].hdr || hdriFiles["1k"].exr;
    if (!entry || !entry.url) {
      console.error(`SKIP ${slug}: no usable 1k file URL`);
      continue;
    }
    const ext = entry.url.endsWith(".exr") ? "exr" : "hdr";
    const outPath = path.join(OUT_DIR, `${slug}.${ext}`);

    console.log(`fetching ${slug} <- ${entry.url}`);
    const res = await fetch(entry.url);
    if (!res.ok) {
      console.error(`SKIP ${slug}: download HTTP ${res.status}`);
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(outPath, buf);

    results.push({
      slug,
      name: info.name,
      ext,
      bytes: buf.length,
      fileUrl: `/assets/hdri/${slug}.${ext}`,
      sourceUrl: `https://polyhaven.com/a/${slug}`,
    });
    console.log(`  OK ${slug}.${ext} — ${buf.length} bytes`);
  }

  console.log(`\nfetched ${results.length}/${CANDIDATE_SLUGS.length} HDRIs`);

  // Merge into manifest.json as kind:"hdri" entries (preserving existing model entries).
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  manifest.assets = manifest.assets.filter((a) => a.kind !== "hdri");
  for (const r of results) {
    manifest.assets.push({
      id: `polyhaven/hdri/${r.slug}`,
      kind: "hdri",
      name: r.name,
      source: "polyhaven",
      licence: "CC0",
      sourceUrl: r.sourceUrl,
      category: "hdri",
      triangles: 0,
      fileUrl: r.fileUrl,
      fileBytes: r.bytes,
      thumbnailUrl: `https://cdn.polyhaven.com/asset_img/thumbs/${r.slug}.png?width=256&height=256`,
    });
  }
  manifest.generatedAt = new Date().toISOString();
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log(`manifest.json updated: ${manifest.assets.length} total assets (${results.length} hdri)`);

  fs.writeFileSync(
    path.join(REPO_ROOT, "pipeline", "hdri-fetch-result.json"),
    JSON.stringify({ requested: CANDIDATE_SLUGS.length, fetched: results.length, results }, null, 2)
  );

  if (results.length < 6) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exitCode = 1;
});
