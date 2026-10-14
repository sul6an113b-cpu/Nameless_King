// Minimal ZIP writer (STORE, no compression - photos are already JPEG) and reader.
// Reader handles STORE and, where the browser has DecompressionStream, DEFLATE,
// so a backup re-zipped on a PC can still be restored.

import { toU8, utf8 } from './util.js';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(u8) {
  let c = 0xffffffff;
  for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosTime(d) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

// entries: [{name, data}] or [{name, load: async () => data}] where data is
// string | Uint8Array | ArrayBuffer | Blob. Lazy entries are loaded one at a time and
// wrapped in their own Blob straight away, so a backup with thousands of photos never
// holds all photo bytes in memory at once. An entry whose load() returns null is skipped.
export async function makeZip(entries, onEntry = () => {}) {
  const parts = [];
  const central = [];
  let offset = 0;
  let count = 0;
  const seen = new Set();
  for (const e of entries) {
    const raw = e.load ? await e.load() : e.data;
    onEntry();
    if (raw == null) continue;
    let name = e.name.replace(/^\/+/, '');
    // Keep names unique - a duplicate would silently shadow a file on extraction.
    if (seen.has(name)) {
      const dot = name.lastIndexOf('.') > 0 ? name.lastIndexOf('.') : name.length;
      let i = 2;
      while (seen.has(`${name.slice(0, dot)}_${i}${name.slice(dot)}`)) i++;
      name = `${name.slice(0, dot)}_${i}${name.slice(dot)}`;
    }
    seen.add(name);
    const nameU8 = utf8(name);
    const data = await toU8(raw);
    const crc = crc32(data);
    const { time, date } = dosTime(e.date || new Date());
    if (offset + 30 + nameU8.length + data.length > 0xffffffff) throw new Error('The file would be over 4 GB. Export a shorter date range.');
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true); // version needed
    lh.setUint16(6, 0x0800, true); // UTF-8 names
    lh.setUint16(8, 0, true); // STORE
    lh.setUint16(10, time, true);
    lh.setUint16(12, date, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true);
    lh.setUint32(22, data.length, true);
    lh.setUint16(26, nameU8.length, true);
    lh.setUint16(28, 0, true);
    parts.push(new Blob([lh.buffer, nameU8, data]));

    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true);
    ch.setUint16(6, 20, true);
    ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, 0, true);
    ch.setUint16(12, time, true);
    ch.setUint16(14, date, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, data.length, true);
    ch.setUint32(24, data.length, true);
    ch.setUint16(28, nameU8.length, true);
    ch.setUint32(42, offset, true);
    central.push(ch.buffer, nameU8);
    offset += 30 + nameU8.length + data.length;
    count++;
  }
  if (count > 0xffff) throw new Error('Too many files for one ZIP. Export a shorter date range.');
  let cdSize = 0;
  for (const c of central) cdSize += c.byteLength;
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, count, true);
  end.setUint16(10, count, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
}

async function inflateRaw(u8) {
  if (typeof DecompressionStream === 'undefined') throw new Error('This ZIP is compressed and this browser cannot unpack it. Use the original backup file.');
  const ds = new DecompressionStream('deflate-raw');
  const out = new Blob([u8]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

const slice = async (file, a, b) => new Uint8Array(await file.slice(a, b).arrayBuffer());

// Opens a ZIP without loading it whole: reads the central directory, then each
// entry on demand. Returns {names, has(name), read(name) -> Uint8Array}.
export async function openZip(file) {
  const size = file.size;
  const tailStart = Math.max(0, size - 65557);
  const tail = await slice(file, tailStart, size);
  const tv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a ZIP file');
  const count = tv.getUint16(eocd + 10, true);
  const cdSize = tv.getUint32(eocd + 12, true);
  const cdOff = tv.getUint32(eocd + 16, true);
  const cd = await slice(file, cdOff, cdOff + cdSize);
  const dv = new DataView(cd.buffer, cd.byteOffset, cd.byteLength);
  const dec = new TextDecoder();
  const map = new Map();
  let p = 0;
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Damaged ZIP (central directory)');
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true);
    const xlen = dv.getUint16(p + 30, true);
    const clen = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    const name = dec.decode(cd.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    if (!name.endsWith('/')) map.set(name, { method, csize, lho });
  }
  return {
    names: [...map.keys()],
    has: (name) => map.has(name),
    async read(name) {
      const e = map.get(name);
      if (!e) return null;
      const lh = await slice(file, e.lho, e.lho + 30);
      const lv = new DataView(lh.buffer, lh.byteOffset, lh.byteLength);
      if (lv.getUint32(0, true) !== 0x04034b50) throw new Error(`Damaged ZIP entry ${name}`);
      const start = e.lho + 30 + lv.getUint16(26, true) + lv.getUint16(28, true);
      const raw = await slice(file, start, start + e.csize);
      if (e.method === 0) return raw;
      if (e.method === 8) return inflateRaw(raw);
      throw new Error(`Unsupported ZIP compression in ${name}`);
    },
  };
}
