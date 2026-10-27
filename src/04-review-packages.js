// ---------- review packages: export a period of the journal for someone else to look at ----------
//
// A package is a .zip: manifest.json, the trade notes, their Excalidraw drawings, and every image those notes
// and drawings embed. It is written without compression (images do not compress anyway) and read back with or
// without it, so a package that was unzipped and zipped again by the system still imports.

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** files: [{ name, data: Uint8Array }] -> zip as Uint8Array (stored, UTF-8 names). */
function zipFiles(files) {
  const enc = new TextEncoder();
  const chunks = [], central = [];
  let offset = 0;
  const header = (size, fill) => {
    const buf = new Uint8Array(size);
    fill(new DataView(buf.buffer));
    return buf;
  };
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const local = header(30, (v) => {
      v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x0800, true);
      v.setUint32(14, crc, true); v.setUint32(18, f.data.length, true); v.setUint32(22, f.data.length, true); v.setUint16(26, name.length, true);
    });
    central.push(header(46, (v) => {
      v.setUint32(0, 0x02014b50, true); v.setUint16(4, 20, true); v.setUint16(6, 20, true); v.setUint16(8, 0x0800, true);
      v.setUint32(16, crc, true); v.setUint32(20, f.data.length, true); v.setUint32(24, f.data.length, true);
      v.setUint16(28, name.length, true); v.setUint32(42, offset, true);
    }), name);
    chunks.push(local, name, f.data);
    offset += local.length + name.length + f.data.length;
  }
  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const end = header(22, (v) => {
    v.setUint32(0, 0x06054b50, true); v.setUint16(8, files.length, true); v.setUint16(10, files.length, true);
    v.setUint32(12, centralSize, true); v.setUint32(16, offset, true);
  });
  const out = new Uint8Array(offset + centralSize + end.length);
  let at = 0;
  for (const c of [...chunks, ...central, end]) { out.set(c, at); at += c.length; }
  return out;
}

/** zip (ArrayBuffer) -> [{ name, data: Uint8Array }]. Handles stored and deflated entries; skips folders. */
async function unzipFiles(buffer) {
  const bytes = new Uint8Array(buffer);
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66000); i--) if (v.getUint32(i, true) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new Error('not a zip file');
  const count = v.getUint16(end + 10, true);
  let at = v.getUint32(end + 16, true);
  const dec = new TextDecoder();
  const out = [];
  for (let n = 0; n < count; n++) {
    if (v.getUint32(at, true) !== 0x02014b50) throw new Error('damaged zip file');
    const method = v.getUint16(at + 10, true), size = v.getUint32(at + 20, true);
    const nameLen = v.getUint16(at + 28, true), extraLen = v.getUint16(at + 30, true), commentLen = v.getUint16(at + 32, true);
    const local = v.getUint32(at + 42, true);
    const name = dec.decode(bytes.subarray(at + 46, at + 46 + nameLen));
    at += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/') || name.startsWith('__MACOSX/')) continue;
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    let data = bytes.subarray(start, start + size);
    if (method === 8) data = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    else if (method !== 0) throw new Error(`unsupported compression in ${name}`);
    out.push({ name, data });
  }
  return out;
}

const EXPORT_PERIODS = { d30: 'Last 30 days', d90: 'Last 3 months', month: 'This month', all: 'Everything' };

/** Trades in an export period. d30 / d90 count back from today, inclusive. */
function filterExportPeriod(trades, period, today = new Date()) {
  if (period === 'month') return filterPeriod(trades, 'month', today);
  if (period === 'all') return trades;
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (period === 'd90' ? 90 : 30));
  return trades.filter((t) => t.date >= isoDay(from));
}

/** Wikilink targets inside a note or drawing: [[target]], ![[target|alias]], [[target#heading]]. */
function linkTargets(text) {
  const out = new Set();
  for (const m of String(text).matchAll(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g)) out.add(m[1].trim());
  return [...out];
}

const fileSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const PKG_MARK = '@@PKG@@'; // stands for the package's own folder inside exported notes; replaced on import

