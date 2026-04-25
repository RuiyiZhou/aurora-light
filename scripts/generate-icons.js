#!/usr/bin/env node
/**
 * Generates placeholder PNG icon assets for Aurora Light.
 * Run once: node scripts/generate-icons.js
 * Then replace the generated files with your real artwork before a production release.
 *
 * Outputs:
 *   assets/icon.png            — 1024×1024  app icon (Play Store requires ≥512)
 *   assets/adaptive-icon.png   — 1024×1024  Android adaptive icon foreground
 *   assets/splash.png          — 1284×2778  splash background
 *   assets/favicon.png         — 48×48      web favicon
 */

const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

// ── CRC32 ──────────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf  = Buffer.allocUnsafe(4); lenBuf.writeUInt32BE(data.length);
  const crcBuf  = Buffer.allocUnsafe(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

// ── PNG builder ────────────────────────────────────────────────────────────
// Draws a solid background + centered circle glyph (aurora aesthetic)
function makePNG(w, h, { bg, fg }) {
  // bg/fg: [r, g, b]
  const ROW = 1 + w * 3; // 1 filter byte + 3 bytes per pixel
  const raw = Buffer.allocUnsafe(h * ROW);

  const cx = w / 2, cy = h / 2;
  const outerR = w * 0.38;
  const innerR = w * 0.22;
  const glowR  = w * 0.30;

  for (let y = 0; y < h; y++) {
    raw[y * ROW] = 0; // filter: None
    for (let x = 0; x < w; x++) {
      const dx = x - cx, dy = y - cy;
      const d  = Math.sqrt(dx * dx + dy * dy);

      let r, g, b;
      if (d > outerR) {
        // Background
        [r, g, b] = bg;
      } else if (d > innerR) {
        // Ring — aurora accent
        const t = 1 - Math.abs(d - glowR) / (outerR - innerR);
        r = Math.round(fg[0] * t + bg[0] * (1 - t));
        g = Math.round(fg[1] * t + bg[1] * (1 - t));
        b = Math.round(fg[2] * t + bg[2] * (1 - t));
      } else {
        // Inner disc — slightly lighter background
        [r, g, b] = [
          Math.min(255, bg[0] + 12),
          Math.min(255, bg[1] + 18),
          Math.min(255, bg[2] + 22),
        ];
      }

      const offset = y * ROW + 1 + x * 3;
      raw[offset]     = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
    }
  }

  const compressed = zlib.deflateSync(raw, { level: 6 });

  const IHDR = Buffer.allocUnsafe(13);
  IHDR.writeUInt32BE(w, 0);
  IHDR.writeUInt32BE(h, 4);
  IHDR[8]  = 8; // bit depth
  IHDR[9]  = 2; // color type: RGB
  IHDR[10] = 0; IHDR[11] = 0; IHDR[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    chunk('IHDR', IHDR),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Palette ────────────────────────────────────────────────────────────────
const BG = [2, 2, 9];       // #020209
const FG = [16, 185, 129];  // #10b981 aurora emerald

// ── Write files ────────────────────────────────────────────────────────────
const OUT = path.join(__dirname, '..', 'assets');

const files = [
  { name: 'icon.png',          w: 1024, h: 1024 },
  { name: 'adaptive-icon.png', w: 1024, h: 1024 },
  { name: 'splash.png',        w: 1284, h: 2778 },
  { name: 'favicon.png',       w:   48, h:   48 },
];

for (const { name, w, h } of files) {
  const dest = path.join(OUT, name);
  process.stdout.write(`Generating ${name} (${w}×${h})… `);
  const buf = makePNG(w, h, { bg: BG, fg: FG });
  fs.writeFileSync(dest, buf);
  console.log(`${(buf.length / 1024).toFixed(1)} KB`);
}

console.log('\nDone. Replace assets/*.png with real artwork before a production release.');
