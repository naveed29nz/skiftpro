const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u16(value) {
  return Uint8Array.of(value & 0xff, (value >> 8) & 0xff);
}

function u32(value) {
  return Uint8Array.of(value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >>> 24) & 0xff);
}

function concat(parts) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function dosTime() {
  return { time: 0, date: 33 };
}

/**
 * Stored-method ZIP. The mimetype entry is first and uncompressed, which is
 * what an ASiC-E container uses to identify itself.
 */
export function zipStore(entries) {
  const encoder = new TextEncoder();
  const { time, date } = dosTime();
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const data = entry.bytes instanceof Uint8Array ? entry.bytes : encoder.encode(entry.bytes);
    const crc = crc32(data);
    const local = concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(time),
      u16(date),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      name,
      data,
    ]);
    locals.push(local);
    centrals.push(concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(time),
      u16(date),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name,
    ]));
    offset += local.length;
  }
  const central = concat(centrals);
  const eocd = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(central.length),
    u32(offset),
    u16(0),
  ]);
  return concat([...locals, central, eocd]);
}

export function unzipStore(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const files = [];
  let offset = 0;
  while (offset + 30 <= view.length) {
    const signature = view[offset] | (view[offset + 1] << 8) | (view[offset + 2] << 16) | (view[offset + 3] << 24);
    if (signature !== 0x04034b50) break;
    const method = view[offset + 8] | (view[offset + 9] << 8);
    const compressed = view[offset + 18] | (view[offset + 19] << 8) | (view[offset + 20] << 16) | (view[offset + 21] << 24);
    const nameLength = view[offset + 26] | (view[offset + 27] << 8);
    const extraLength = view[offset + 28] | (view[offset + 29] << 8);
    const name = new TextDecoder().decode(view.subarray(offset + 30, offset + 30 + nameLength));
    const start = offset + 30 + nameLength + extraLength;
    if (method !== 0) throw new Error(`ZIP-metode ${method} er ikke store`);
    files.push({ name, bytes: view.slice(start, start + compressed) });
    offset = start + compressed;
  }
  return files;
}

export const ASIC_MIME = "application/vnd.etsi.asic-e+zip";
