// Minimal STORE-only (uncompressed) ZIP writer — no external dependency.
// Ownership: src/viewer/** only (SCOPE.md #20). Used by exportSequence().
//
// Format reference: PKZIP APPNOTE.TXT — local file header + central directory
// + end-of-central-directory record, method 0 (store), so file bytes are
// written verbatim and crc32 is the only per-file computation needed.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

function writeU16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true);
}
function writeU32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value, true);
}

// MS-DOS date/time, fixed — export timestamps are not part of any acceptance
// check and a fixed value keeps output byte-for-byte reproducible.
const DOS_TIME = 0;
const DOS_DATE = 0x21; // 1980-01-01

export async function buildZip(files: { name: string; blob: Blob }[]): Promise<Blob> {
  const entries: ZipEntry[] = [];
  for (const f of files) {
    entries.push({ name: f.name, data: new Uint8Array(await f.blob.arrayBuffer()) });
  }

  const localParts: BlobPart[] = [];
  const centralParts: BlobPart[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = new TextEncoder().encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const local = new ArrayBuffer(30 + nameBytes.length);
    const lv = new DataView(local);
    writeU32(lv, 0, 0x04034b50);
    writeU16(lv, 4, 20); // version needed
    writeU16(lv, 6, 0); // flags
    writeU16(lv, 8, 0); // method: store
    writeU16(lv, 10, DOS_TIME);
    writeU16(lv, 12, DOS_DATE);
    writeU32(lv, 14, crc);
    writeU32(lv, 18, size); // compressed size
    writeU32(lv, 22, size); // uncompressed size
    writeU16(lv, 26, nameBytes.length);
    writeU16(lv, 28, 0); // extra length
    new Uint8Array(local, 30).set(nameBytes);

    localParts.push(local, entry.data as unknown as BlobPart);

    const central = new ArrayBuffer(46 + nameBytes.length);
    const cv = new DataView(central);
    writeU32(cv, 0, 0x02014b50);
    writeU16(cv, 4, 20); // version made by
    writeU16(cv, 6, 20); // version needed
    writeU16(cv, 8, 0); // flags
    writeU16(cv, 10, 0); // method: store
    writeU16(cv, 12, DOS_TIME);
    writeU16(cv, 14, DOS_DATE);
    writeU32(cv, 16, crc);
    writeU32(cv, 20, size);
    writeU32(cv, 24, size);
    writeU16(cv, 28, nameBytes.length);
    writeU16(cv, 30, 0); // extra length
    writeU16(cv, 32, 0); // comment length
    writeU16(cv, 34, 0); // disk number start
    writeU16(cv, 36, 0); // internal attrs
    writeU32(cv, 38, 0); // external attrs
    writeU32(cv, 42, offset); // local header offset
    new Uint8Array(central, 46).set(nameBytes);

    centralParts.push(central);

    offset += local.byteLength + entry.data.length;
  }

  const centralSize = centralParts.reduce((n, p) => n + (p as ArrayBuffer).byteLength, 0);
  const centralOffset = offset;

  const eocd = new ArrayBuffer(22);
  const ev = new DataView(eocd);
  writeU32(ev, 0, 0x06054b50);
  writeU16(ev, 4, 0); // disk number
  writeU16(ev, 6, 0); // disk with central dir
  writeU16(ev, 8, entries.length);
  writeU16(ev, 10, entries.length);
  writeU32(ev, 12, centralSize);
  writeU32(ev, 16, centralOffset);
  writeU16(ev, 20, 0); // comment length

  return new Blob([...localParts, ...centralParts, eocd], { type: "application/zip" });
}
