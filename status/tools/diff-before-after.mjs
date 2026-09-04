// Wave 4 accessibility/responsive QA — before/after pixel-diff table.
//
// Compares status/before/local-<w>x<h>-<state>.png against status/after/local-<w>x<h>-<state>.png
// for every (viewport, state) pair that exists in BOTH directories (the two NEW states —
// restore-prompt, context-lost — have no "before" counterpart and are excluded from this table by
// construction). Computes a pixel-difference percentage with a minimal, dependency-free inline PNG
// decoder (Node's built-in zlib does the DEFLATE inflate; chunk parsing and per-scanline PNG
// "unfilter" — None/Sub/Up/Average/Paeth — are implemented here per the PNG spec) so no package is
// installed into the project.
//
// A pixel counts as "different" when the Euclidean distance between its RGBA channels (0-255 each)
// exceeds a threshold of 24 (about 10% of the 0-255 range per channel on average) — the same order
// of magnitude commonly used by perceptual-diff tools for "meaningfully different pixel", not a
// strict any-bit-differs comparison (that would flag ordinary anti-aliasing/JPEG-free PNG
// re-encoding noise as different even for pixel-identical renders).
//
// Usage: node status/tools/diff-before-after.mjs
// Prints a Markdown table to stdout and writes the same JSON to
// status/evidence/wave4-a11y/diff-before-after.json.

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { inflateSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const BEFORE_DIR = path.join(REPO_ROOT, "status", "before");
const AFTER_DIR = path.join(REPO_ROOT, "status", "after");
const OUT_JSON = path.join(REPO_ROOT, "status", "evidence", "wave4-a11y", "diff-before-after.json");

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function decodePNG(buf) {
  if (!buf.subarray(0, 8).equals(PNG_SIG)) throw new Error("Not a PNG (bad signature)");
  let offset = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idatChunks = [];
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buf.subarray(offset + 8, offset + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data.readUInt8(8);
      colorType = data.readUInt8(9);
      interlace = data.readUInt8(12);
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 8 + len + 4; // length + type + data + crc
  }
  if (interlace !== 0) throw new Error("Interlaced PNG not supported by this minimal decoder");
  if (bitDepth !== 8) throw new Error(`Unsupported bit depth ${bitDepth} (only 8-bit PNGs supported)`);

  const channelsByColorType = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
  const channels = channelsByColorType[colorType];
  if (!channels) throw new Error(`Unsupported PNG colorType ${colorType}`);
  const bytesPerPixel = channels; // bitDepth 8 => 1 byte/channel
  const rowBytes = width * bytesPerPixel;

  const raw = inflateSync(Buffer.concat(idatChunks));
  const pixels = Buffer.alloc(rowBytes * height);
  let rawOffset = 0;
  let prevRowStart = -1;
  for (let y = 0; y < height; y++) {
    const filterType = raw[rawOffset];
    rawOffset += 1;
    const rowStart = y * rowBytes;
    for (let x = 0; x < rowBytes; x++) {
      const rawByte = raw[rawOffset + x];
      const a = x >= bytesPerPixel ? pixels[rowStart + x - bytesPerPixel] : 0;
      const b = prevRowStart >= 0 ? pixels[prevRowStart + x] : 0;
      const c = prevRowStart >= 0 && x >= bytesPerPixel ? pixels[prevRowStart + x - bytesPerPixel] : 0;
      let value;
      switch (filterType) {
        case 0: value = rawByte; break;
        case 1: value = (rawByte + a) & 0xff; break;
        case 2: value = (rawByte + b) & 0xff; break;
        case 3: value = (rawByte + Math.floor((a + b) / 2)) & 0xff; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          value = (rawByte + pr) & 0xff;
          break;
        }
        default: throw new Error(`Unknown PNG filter type ${filterType} at row ${y}`);
      }
      pixels[rowStart + x] = value;
    }
    rawOffset += rowBytes;
    prevRowStart = rowStart;
  }

  // Normalize to RGBA regardless of source colorType, for a simple uniform comparator.
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0, p = 0; i < width * height; i++, p += bytesPerPixel) {
    let r, g, b, a = 255;
    if (colorType === 2) { r = pixels[p]; g = pixels[p + 1]; b = pixels[p + 2]; }
    else if (colorType === 6) { r = pixels[p]; g = pixels[p + 1]; b = pixels[p + 2]; a = pixels[p + 3]; }
    else if (colorType === 0) { r = g = b = pixels[p]; }
    else if (colorType === 4) { r = g = b = pixels[p]; a = pixels[p + 1]; }
    else throw new Error(`colorType ${colorType} (palette) not supported — screenshots are not palette PNGs`);
    rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = a;
  }
  return { width, height, rgba };
}

function diffPercent(imgA, imgB, threshold = 24) {
  if (imgA.width !== imgB.width || imgA.height !== imgB.height) {
    return { pass: false, sizeMismatch: true, a: [imgA.width, imgA.height], b: [imgB.width, imgB.height] };
  }
  const total = imgA.width * imgA.height;
  let diffCount = 0;
  for (let i = 0; i < total; i++) {
    const o = i * 4;
    const dr = imgA.rgba[o] - imgB.rgba[o];
    const dg = imgA.rgba[o + 1] - imgB.rgba[o + 1];
    const db = imgA.rgba[o + 2] - imgB.rgba[o + 2];
    const da = imgA.rgba[o + 3] - imgB.rgba[o + 3];
    const dist = Math.sqrt(dr * dr + dg * dg + db * db + da * da);
    if (dist > threshold) diffCount++;
  }
  return { sizeMismatch: false, diffCount, total, percent: (diffCount / total) * 100 };
}

const VIEWPORTS = ["1536x864", "1280x720", "1024x768", "768x1024", "390x844"];
const STATES = ["empty", "loaded", "editing", "saving", "exporting", "completion", "recoverable"];

const rows = [];
for (const vp of VIEWPORTS) {
  for (const state of STATES) {
    const name = `local-${vp}-${state}.png`;
    const beforePath = path.join(BEFORE_DIR, name);
    const afterPath = path.join(AFTER_DIR, name);
    if (!existsSync(beforePath) || !existsSync(afterPath)) {
      rows.push({ viewport: vp, state, error: `missing file: ${!existsSync(beforePath) ? "before" : "after"}/${name}` });
      continue;
    }
    try {
      const imgA = decodePNG(readFileSync(beforePath));
      const imgB = decodePNG(readFileSync(afterPath));
      const result = diffPercent(imgA, imgB);
      rows.push({ viewport: vp, state, ...result });
    } catch (err) {
      rows.push({ viewport: vp, state, error: err.message });
    }
  }
}

writeFileSync(OUT_JSON, JSON.stringify(rows, null, 2));

console.log(`| Viewport | State | Diff % | Notes |`);
console.log(`|---|---|---:|---|`);
for (const r of rows) {
  if (r.error) {
    console.log(`| ${r.viewport} | ${r.state} | — | ERROR: ${r.error} |`);
  } else if (r.sizeMismatch) {
    console.log(`| ${r.viewport} | ${r.state} | — | size mismatch: before=${r.a.join("x")} after=${r.b.join("x")} |`);
  } else {
    const flag = r.percent > 1 ? " **>1%**" : "";
    console.log(`| ${r.viewport} | ${r.state} | ${r.percent.toFixed(3)}%${flag} | |`);
  }
}

const over1 = rows.filter((r) => !r.error && !r.sizeMismatch && r.percent > 1);
console.log(`\n${over1.length} of ${rows.length} pairs exceed 1% difference.`);
console.log(`Full JSON: ${OUT_JSON}`);
