// Generates public/icon-192.png and public/icon-512.png: a rounded 3x3 grid
// of bright cube-sticker colors on a dark blue background. Uses only Node's
// built-in `zlib` (for PNG DEFLATE compression) - no image libraries.
//
// PNG is hand-encoded: we build an RGBA raster in memory, then write the
// PNG signature + IHDR + IDAT (zlib-deflated raw scanlines) + IEND chunks.

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'public');

// CubeClimb sticker colors (see src/content/colors.ts) plus background.
const BG = [0x0b, 0x12, 0x2e]; // dark blue
const CUBE_COLORS = [
  [0xf5, 0xd9, 0x1a], // U yellow
  [0xff, 0x8a, 0x00], // R orange
  [0x1f, 0xa9, 0x53], // F green
  [0xf5, 0xf5, 0xf5], // D white
  [0xe6, 0x2b, 0x2b], // L red
  [0x1f, 0x5f, 0xd9], // B blue
];
// 3x3 grid needs 9 tiles; cycle through the 6 sticker colors.
const STICKERS = Array.from({ length: 9 }, (_, i) => CUBE_COLORS[i % CUBE_COLORS.length]);

function crc32(buf) {
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let cc = n;
      for (let k = 0; k < 8; k++) {
        cc = cc & 1 ? 0xedb88320 ^ (cc >>> 1) : cc >>> 1;
      }
      t[n] = cc >>> 0;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function roundedGridAlpha(x, y, size) {
  // Overall icon: rounded-rect mask so the whole thing reads as an app icon.
  const r = size * 0.18;
  const inset = 0;
  const left = inset, top = inset, right = size - inset, bottom = size - inset;
  const dx = Math.max(left - x, 0, x - right);
  const dy = Math.max(top - y, 0, y - bottom);
  if (dx > 0 || dy > 0) return 0;
  // corner rounding check
  const cornerCheck = (cx, cy) => {
    const ddx = x - cx;
    const ddy = y - cy;
    return ddx * ddx + ddy * ddy <= r * r;
  };
  if (x < left + r && y < top + r && !cornerCheck(left + r, top + r)) return 0;
  if (x > right - r && y < top + r && !cornerCheck(right - r, top + r)) return 0;
  if (x < left + r && y > bottom - r && !cornerCheck(left + r, bottom - r)) return 0;
  if (x > right - r && y > bottom - r && !cornerCheck(right - r, bottom - r)) return 0;
  return 1;
}

function makeIcon(size) {
  const raw = Buffer.alloc(size * (1 + size * 4));
  const pad = Math.round(size * 0.09);
  const gridSize = size - pad * 2;
  const cell = gridSize / 3;
  const gap = Math.max(1, Math.round(size * 0.018));
  const cellR = Math.max(2, Math.round(size * 0.035));

  for (let y = 0; y < size; y++) {
    let rowStart = y * (1 + size * 4);
    raw[rowStart] = 0; // filter type: none
    for (let x = 0; x < size; x++) {
      const maskAlpha = roundedGridAlpha(x, y, size);
      let r = BG[0], g = BG[1], b = BG[2], a = 255;

      // Which grid cell (if any) does this pixel fall in?
      const gx = x - pad;
      const gy = y - pad;
      if (gx >= 0 && gy >= 0 && gx < gridSize && gy < gridSize) {
        const ci = Math.min(2, Math.floor(gx / cell));
        const ri = Math.min(2, Math.floor(gy / cell));
        const cellX = gx - ci * cell;
        const cellY = gy - ri * cell;
        const inGapX = cellX < gap || cellX > cell - gap;
        const inGapY = cellY < gap || cellY > cell - gap;
        // corner rounding inside each sticker cell
        let corner = false;
        const check = (cx, cy) => {
          const ddx = cellX - cx, ddy = cellY - cy;
          return ddx * ddx + ddy * ddy > cellR * cellR;
        };
        if (cellX < cellR && cellY < cellR) corner = check(cellR, cellR);
        else if (cellX > cell - cellR && cellY < cellR) corner = check(cell - cellR, cellR);
        else if (cellX < cellR && cellY > cell - cellR) corner = check(cellR, cell - cellR);
        else if (cellX > cell - cellR && cellY > cell - cellR) corner = check(cell - cellR, cell - cellR);

        if (!inGapX && !inGapY && !corner) {
          const color = STICKERS[ri * 3 + ci];
          r = color[0]; g = color[1]; b = color[2];
        }
      }

      if (!maskAlpha) {
        a = 0;
      }

      const o = 1 + x * 4;
      raw[rowStart + o] = r;
      raw[rowStart + o + 1] = g;
      raw[rowStart + o + 2] = b;
      raw[rowStart + o + 3] = a;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = deflateSync(raw);

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const png = Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return png;
}

for (const size of [192, 512]) {
  const png = makeIcon(size);
  const path = join(outDir, `icon-${size}.png`);
  writeFileSync(path, png);
  console.log(`wrote ${path} (${png.length} bytes)`);
}
