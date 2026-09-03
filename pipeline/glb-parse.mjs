// Minimal, dependency-free GLB binary parser.
// Reads the 12-byte GLB header + chunk stream and returns the JSON chunk only
// (we never need to touch the BIN chunk's bytes: every accessor already carries
// its own element `count`, which is all a triangle count needs).
import fs from "node:fs";

const GLB_MAGIC = 0x46546c67; // 'glTF'
const CHUNK_TYPE_JSON = 0x4e4f534a; // 'JSON'

/** @param {string} filePath @returns {any} the parsed glTF JSON chunk */
export function parseGLBJson(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf.length < 12) throw new Error(`${filePath}: too small to be a GLB`);
  const magic = buf.readUInt32LE(0);
  if (magic !== GLB_MAGIC) throw new Error(`${filePath}: bad GLB magic`);
  const length = buf.readUInt32LE(8);
  let offset = 12;
  let json = null;
  while (offset < length && offset + 8 <= buf.length) {
    const chunkLength = buf.readUInt32LE(offset);
    const chunkType = buf.readUInt32LE(offset + 4);
    const chunkData = buf.subarray(offset + 8, offset + 8 + chunkLength);
    if (chunkType === CHUNK_TYPE_JSON) {
      json = JSON.parse(chunkData.toString("utf8"));
    }
    offset += 8 + chunkLength;
  }
  if (!json) throw new Error(`${filePath}: no JSON chunk found`);
  return json;
}

/**
 * Sum of triangles across every TRIANGLES-mode primitive in every mesh.
 * Uses each accessor's own `count` field (indices count, or POSITION count
 * for non-indexed primitives) — no need to decode the binary buffer itself.
 * @param {any} json
 */
export function countTriangles(json) {
  let triangles = 0;
  const meshes = json.meshes || [];
  for (const mesh of meshes) {
    for (const prim of mesh.primitives || []) {
      const mode = prim.mode === undefined ? 4 : prim.mode; // 4 = TRIANGLES (glTF default)
      if (mode !== 4) continue;
      if (prim.indices !== undefined) {
        const acc = json.accessors[prim.indices];
        triangles += Math.floor(acc.count / 3);
      } else if (prim.attributes && prim.attributes.POSITION !== undefined) {
        const posAcc = json.accessors[prim.attributes.POSITION];
        triangles += Math.floor(posAcc.count / 3);
      }
    }
  }
  return triangles;
}

/** @param {any} json @returns {string[]} */
export function getAnimationNames(json) {
  return (json.animations || []).map((a) => a.name).filter((n) => typeof n === "string");
}
