#!/usr/bin/env node
/**
 * Generates a 1284×2778 splash.png for Aurora Light.
 * Dark sky + procedural stars + emerald aurora ribbons + glow halo.
 * No external dependencies — pure Node.js.
 */

const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

const W = 1284, H = 2778;
console.log(`Rendering ${W}×${H} splash…`);
const t0 = Date.now();

// ── Float pixel buffer (R,G,B per pixel) ──────────────────────────────────
const buf = new Float32Array(W * H * 3);

// ── 1. Background gradient ────────────────────────────────────────────────
// Top/bottom: #020207  Mid (~40–50%): very slight green tinge
for (let y = 0; y < H; y++) {
  const t    = y / H;
  const glow = Math.exp(-((t - 0.44) ** 2) / 0.055) * 0.35;
  const r    = 2  + glow * 5;
  const g    = 2  + glow * 22;
  const b    = 7  + glow * 10;
  const row  = y * W * 3;
  for (let x = 0; x < W; x++) {
    buf[row + x * 3]     = r;
    buf[row + x * 3 + 1] = g;
    buf[row + x * 3 + 2] = b;
  }
}

// ── 2. Stars (LCG seed = 23, 220 stars in top 65%) ────────────────────────
{
  let s = 23;
  const rand = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };

  for (let i = 0; i < 220; i++) {
    const sx   = rand() * W;
    const sy   = rand() * H * 0.65;
    const br   = 0.25 + rand() * 0.75;
    const rad  = rand() < 0.9 ? 1.2 + rand() * 2.0 : 2.8 + rand() * 3.5;
    const sig2 = 2 * rad * rad;
    const pad  = Math.ceil(rad * 4);

    const x0 = Math.max(0, Math.floor(sx) - pad);
    const x1 = Math.min(W - 1, Math.floor(sx) + pad);
    const y0 = Math.max(0, Math.floor(sy) - pad);
    const y1 = Math.min(H - 1, Math.floor(sy) + pad);

    for (let py = y0; py <= y1; py++) {
      const dy2 = (py - sy) ** 2;
      for (let px = x0; px <= x1; px++) {
        const v = br * Math.exp(-(((px - sx) ** 2) + dy2) / sig2);
        if (v < 0.004) continue;
        const off = (py * W + px) * 3;
        // White-ish star tint
        buf[off]     = Math.min(248, buf[off]     + v * 248);
        buf[off + 1] = Math.min(250, buf[off + 1] + v * 250);
        buf[off + 2] = Math.min(252, buf[off + 2] + v * 252);
      }
    }
  }
}

// ── 3. Elliptical glow halo (centered at ~44% height) ─────────────────────
{
  const gCX = W * 0.5, gCY = H * 0.44;
  const gRX = W * 0.65, gRY = H * 0.10;
  const yMin = Math.max(0, Math.floor(gCY - gRY * 3.5));
  const yMax = Math.min(H - 1, Math.ceil(gCY + gRY * 3.5));

  for (let y = yMin; y <= yMax; y++) {
    const dy  = (y - gCY) / gRY;
    const dy2 = dy * dy;
    const row = y * W * 3;
    for (let x = 0; x < W; x++) {
      const dx = (x - gCX) / gRX;
      const d2 = dx * dx + dy2;
      const v  = 0.22 * Math.exp(-d2 * 0.75);
      if (v < 0.002) continue;
      // Emerald glow: #10b981 = rgb(16,185,129)
      buf[row + x * 3]     = Math.min(255, buf[row + x * 3]     + v * 14);
      buf[row + x * 3 + 1] = Math.min(255, buf[row + x * 3 + 1] + v * 120);
      buf[row + x * 3 + 2] = Math.min(255, buf[row + x * 3 + 2] + v * 72);
    }
  }
}

// ── 4. Aurora ribbons (3 sine-wave bands) ────────────────────────────────
{
  // Accent: #10b981 = [16, 185, 129]
  // Text:   #6ee7b7 = [110, 231, 183]
  const ribbons = [
    { yBase: H * 0.385, amp: H * 0.030, phase: 0.0,  op: 0.55, sigma: H * 0.014 },
    { yBase: H * 0.430, amp: H * 0.040, phase: 1.4,  op: 0.40, sigma: H * 0.019 },
    { yBase: H * 0.475, amp: H * 0.022, phase: 2.7,  op: 0.28, sigma: H * 0.013 },
  ];

  for (const rib of ribbons) {
    const { yBase, amp, phase, op, sigma } = rib;
    const sig2  = 2 * sigma * sigma;
    const maxDy = Math.ceil(sigma * 4);

    for (let x = 0; x < W; x++) {
      const ribY = yBase + Math.sin((x / W) * Math.PI * 2 + phase) * amp;
      const y0   = Math.max(0, Math.floor(ribY - maxDy));
      const y1   = Math.min(H - 1, Math.ceil(ribY + maxDy));

      for (let y = y0; y <= y1; y++) {
        const dy = y - ribY;
        const v  = op * Math.exp(-(dy * dy) / sig2);
        if (v < 0.003) continue;
        const off = (y * W + x) * 3;
        // Blend between accent and text color based on distance
        buf[off]     = Math.min(255, buf[off]     + v * 16);
        buf[off + 1] = Math.min(255, buf[off + 1] + v * 185);
        buf[off + 2] = Math.min(255, buf[off + 2] + v * 129);
      }
    }
  }
}

console.log(`  Render: ${((Date.now() - t0) / 1000).toFixed(1)}s`);

// ── 5. Build raw PNG pixel data (filter byte + RGB rows) ─────────────────
const t1  = Date.now();
const ROW = 1 + W * 3;
const raw = Buffer.allocUnsafe(H * ROW);

for (let y = 0; y < H; y++) {
  raw[y * ROW] = 0; // filter: None
  const srcRow = y * W * 3;
  const dstRow = y * ROW + 1;
  for (let x = 0; x < W; x++) {
    raw[dstRow + x * 3]     = Math.round(Math.min(255, Math.max(0, buf[srcRow + x * 3])));
    raw[dstRow + x * 3 + 1] = Math.round(Math.min(255, Math.max(0, buf[srcRow + x * 3 + 1])));
    raw[dstRow + x * 3 + 2] = Math.round(Math.min(255, Math.max(0, buf[srcRow + x * 3 + 2])));
  }
}

// ── 6. Encode PNG ─────────────────────────────────────────────────────────
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
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const tb  = Buffer.from(type, 'ascii');
  const len = Buffer.allocUnsafe(4); len.writeUInt32BE(data.length);
  const crc = Buffer.allocUnsafe(4); crc.writeUInt32BE(crc32(Buffer.concat([tb, data])));
  return Buffer.concat([len, tb, data, crc]);
}

const IHDR = Buffer.allocUnsafe(13);
IHDR.writeUInt32BE(W, 0); IHDR.writeUInt32BE(H, 4);
IHDR[8] = 8; IHDR[9] = 2; IHDR[10] = 0; IHDR[11] = 0; IHDR[12] = 0;

const compressed = zlib.deflateSync(raw, { level: 7 });

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  pngChunk('IHDR', IHDR),
  pngChunk('IDAT', compressed),
  pngChunk('IEND', Buffer.alloc(0)),
]);

const dest = path.join(__dirname, '..', 'assets', 'splash.png');
fs.writeFileSync(dest, png);
console.log(`  Encode: ${((Date.now() - t1) / 1000).toFixed(1)}s`);
console.log(`  Output: ${dest}`);
console.log(`  Size:   ${(png.length / 1024).toFixed(1)} KB`);
console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s total.`);
