/**
 * Generates the four PNG icons (16/32/48/128) used by the manifest.
 *
 * Pure-Node implementation: no native deps. We hand-craft the PNG bytes for a
 * gradient + monogram so installs never depend on extra binaries.
 */

import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import zlib from "node:zlib";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, "..", "public", "icons");

const SIZES = [16, 32, 48, 128];

function colorAt(x, y, size) {
  // Diagonal gradient between magenta (#e4007c) and orange (#f7941d) with a purple
  // (#7c3aed) accent in the lower-left corner.
  const t = (x + y) / (size * 2);
  const accent = Math.max(0, 1 - Math.hypot(x, size - y) / size);

  const baseR = Math.round(228 * (1 - t) + 247 * t);
  const baseG = Math.round(0 * (1 - t) + 148 * t);
  const baseB = Math.round(124 * (1 - t) + 29 * t);

  const r = Math.round(baseR * (1 - accent * 0.45) + 124 * accent * 0.45);
  const g = Math.round(baseG * (1 - accent * 0.45) + 58 * accent * 0.45);
  const b = Math.round(baseB * (1 - accent * 0.45) + 237 * accent * 0.45);

  return [r, g, b, 255];
}

function inMonogram(x, y, size) {
  // Render a simplified white "T1" centered in the icon.
  const px = (n) => Math.round((n * size) / 32);
  if (y >= px(8) && y <= px(11) && x >= px(7) && x <= px(17)) return true;
  if (x >= px(11) && x <= px(13) && y >= px(8) && y <= px(22)) return true;
  if (x >= px(20) && x <= px(22) && y >= px(8) && y <= px(22)) return true;
  if (y >= px(21) && y <= px(23) && x >= px(18) && x <= px(24)) return true;
  if (y >= px(8) && y <= px(11) && x >= px(17) && x <= px(20)) return true;
  return false;
}

function buildPixels(size) {
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const offset = (y * size + x) * 4;
      const radius = Math.max(2, Math.round(size * 0.18));
      const insideRounded =
        !(
          (x < radius && y < radius && Math.hypot(radius - x, radius - y) > radius) ||
          (x >= size - radius && y < radius && Math.hypot(x - (size - radius - 1), radius - y) > radius) ||
          (x < radius && y >= size - radius && Math.hypot(radius - x, y - (size - radius - 1)) > radius) ||
          (x >= size - radius && y >= size - radius &&
            Math.hypot(x - (size - radius - 1), y - (size - radius - 1)) > radius)
        );

      if (!insideRounded) {
        buf[offset] = 0;
        buf[offset + 1] = 0;
        buf[offset + 2] = 0;
        buf[offset + 3] = 0;
        continue;
      }

      if (inMonogram(x, y, size)) {
        buf[offset] = 255;
        buf[offset + 1] = 255;
        buf[offset + 2] = 255;
        buf[offset + 3] = 255;
        continue;
      }

      const [r, g, b, a] = colorAt(x, y, size);
      buf[offset] = r;
      buf[offset + 1] = g;
      buf[offset + 2] = b;
      buf[offset + 3] = a;
    }
  }
  return buf;
}

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

function encodePng(size, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }

  const idat = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

await mkdir(outDir, { recursive: true });
for (const size of SIZES) {
  const pixels = buildPixels(size);
  const png = encodePng(size, pixels);
  const out = path.join(outDir, `icon-${size}.png`);
  await writeFile(out, png);
  console.log(`wrote ${out} (${png.length} bytes)`);
}
