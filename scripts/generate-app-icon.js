#!/usr/bin/env node
/**
 * Generates a 1024×1024 app icon for Aurora Light.
 *
 * Design: looking straight down at the north pole from space.
 * — Deep dark background with radial vignette
 * — Faint latitude rings and meridians
 * — ~70 procedural stars inside the disc
 * — Glowing auroral oval ring (emerald, 3-layer glow: diffuse → mid → core)
 * — Small pole crosshair
 *
 * Outputs: assets/icon.png  +  assets/adaptive-icon.png
 */

const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

const W = 1024, H = 1024;
const cx = W / 2, cy = H / 2;

console.log(`Rendering ${W}×${H} app icon…`);
const t0 = Date.now();

// ── Float buffer R,G,B ────────────────────────────────────────────────────
const buf = new Float32Array(W * H * 3);

// ── helpers ───────────────────────────────────────────────────────────────
function setPixel(x, y, r, g, b) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const o = (y * W + x) * 3;
  buf[o]     = r;
  buf[o + 1] = g;
  buf[o + 2] = b;
}
function addPixel(x, y, r, g, b) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const o = (y * W + x) * 3;
  buf[o]     = Math.min(255, buf[o]     + r);
  buf[o + 1] = Math.min(255, buf[o + 1] + g);
  buf[o + 2] = Math.min(255, buf[o + 2] + b);
}
// Screen blend: result = 1 - (1-a)(1-b), scaled 0-255
function screenPixel(x, y, r, g, b) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const o = (y * W + x) * 3;
  buf[o]     = 255 - (255 - buf[o])     * (255 - r) / 255;
  buf[o + 1] = 255 - (255 - buf[o + 1]) * (255 - g) / 255;
  buf[o + 2] = 255 - (255 - buf[o + 2]) * (255 - b) / 255;
}

// ── 1. Background: dark radial gradient + vignette ────────────────────────
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const dx = (x - cx) / cx, dy = (y - cy) / cy;
    const d  = Math.sqrt(dx * dx + dy * dy);          // 0=center, 1=corner
    // Slightly lighter centre (#04040f), darkens toward edges (#020207)
    const t  = Math.min(1, d);
    const bg = 1 - t * t * 0.35;
    setPixel(x, y, 2 * bg + 2, 2 * bg + 2, 7 * bg + 2);
  }
}

// ── 2. Faint latitude rings ────────────────────────────────────────────────
{
  const rings = [280, 224, 168, 112, 42];
  for (const rr of rings) {
    // Draw by iterating over a bounding annulus
    const outer = rr + 2, inner = rr - 2;
    for (let y = cy - outer; y <= cy + outer; y++) {
      for (let x = cx - outer; x <= cx + outer; x++) {
        const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        const v = Math.exp(-((d - rr) ** 2) / 3) * 0.12;
        if (v < 0.005) continue;
        addPixel(x, y, v * 12, v * 12, v * 20);
      }
    }
  }
}

// ── 3. Faint meridians (8, dashed) ───────────────────────────────────────
{
  const outerR = 280;
  for (let deg = 0; deg < 180; deg += 22.5) {
    const rad = (deg * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    for (let t = -outerR; t <= outerR; t += 1) {
      // Dashed: only draw every other 10px segment
      if (Math.abs(t) % 20 < 10) continue;
      const px = Math.round(cx + cos * t);
      const py = Math.round(cy + sin * t);
      const d  = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
      if (d > outerR) continue;
      addPixel(px, py, 10, 10, 18);
    }
  }
}

// ── 4. Stars (~70, LCG seed = 7, within disc r < 270) ────────────────────
{
  let s = 7;
  const rand = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };

  for (let i = 0; i < 70; i++) {
    // Random point in disc via rejection sampling
    let sx, sy, dr;
    do {
      sx = rand() * W;
      sy = rand() * H;
      dr = Math.sqrt((sx - cx) ** 2 + (sy - cy) ** 2);
    } while (dr > 268);

    const br  = 0.3 + rand() * 0.7;
    const rad = rand() < 0.88 ? 0.8 + rand() * 1.5 : 2.0 + rand() * 2.5;
    const sig2 = 2 * rad * rad;
    const pad  = Math.ceil(rad * 4);

    for (let py = Math.floor(sy) - pad; py <= Math.ceil(sy) + pad; py++) {
      const dy2 = (py - sy) ** 2;
      for (let px = Math.floor(sx) - pad; px <= Math.ceil(sx) + pad; px++) {
        const v = br * Math.exp(-(((px - sx) ** 2) + dy2) / sig2);
        if (v < 0.005) continue;
        addPixel(px, py, v * 230, v * 240, v * 248);
      }
    }
  }
}

// ── 5. Aurora ring (3-layer glow: diffuse → mid → core) ──────────────────
// Ring radius chosen so it sits between lat rings at r=224 and r=280
const RING_R = 252;

// Colour channels per layer:
//   diffuse outer → #0e6b4a = (14, 107, 74)   emerald glow
//   mid ring      → #10b981 = (16, 185, 129)  accent
//   core bright   → #6ee7b7 = (110, 231, 183) text
const layers = [
  { sigma: 70, peak: 0.50, r: 14,  g: 107, b:  74 },  // diffuse outer
  { sigma: 28, peak: 0.85, r: 16,  g: 185, b: 129 },  // mid ring
  { sigma: 10, peak: 1.00, r: 110, g: 231, b: 183 },  // core
];

for (const layer of layers) {
  const { sigma, peak, r: lr, g: lg, b: lb } = layer;
  const sig2 = 2 * sigma * sigma;
  const pad  = Math.ceil(sigma * 4);

  // Bounding box: annulus [RING_R - pad, RING_R + pad]
  const outerBound = RING_R + pad;
  for (let y = Math.max(0, cy - outerBound); y <= Math.min(H - 1, cy + outerBound); y++) {
    for (let x = Math.max(0, cx - outerBound); x <= Math.min(W - 1, cx + outerBound); x++) {
      const d    = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const dist = Math.abs(d - RING_R);
      if (dist > pad) continue;

      // Slight angular intensity variation — brighter on the "night" side (top-right)
      const angle   = Math.atan2(y - cy, x - cx); // -π..π
      const angMod  = 0.75 + 0.25 * Math.cos(angle + Math.PI * 0.35);

      const v = peak * angMod * Math.exp(-(dist * dist) / sig2);
      if (v < 0.003) continue;

      // Screen blend for glow layers (avoids blowing out to pure white)
      screenPixel(x, y, v * lr, v * lg, v * lb);
    }
  }
}

// ── 6. Pole crosshair ─────────────────────────────────────────────────────
for (let d = -7; d <= 7; d++) {
  if (Math.abs(d) < 2) continue; // gap at center
  addPixel(cx + d, cy,     52, 52, 80);
  addPixel(cx,     cy + d, 52, 52, 80);
}

console.log(`  Render: ${((Date.now() - t0) / 1000).toFixed(1)}s`);

// ── 7. Encode to PNG ──────────────────────────────────────────────────────
const t1  = Date.now();
const ROW = 1 + W * 3;
const raw = Buffer.allocUnsafe(H * ROW);

for (let y = 0; y < H; y++) {
  raw[y * ROW] = 0;
  const s = y * W * 3, d = y * ROW + 1;
  for (let x = 0; x < W; x++) {
    raw[d + x * 3]     = Math.round(Math.min(255, Math.max(0, buf[s + x * 3])));
    raw[d + x * 3 + 1] = Math.round(Math.min(255, Math.max(0, buf[s + x * 3 + 1])));
    raw[d + x * 3 + 2] = Math.round(Math.min(255, Math.max(0, buf[s + x * 3 + 2])));
  }
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();
function crc32(b) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const tb = Buffer.from(type, 'ascii');
  const lb = Buffer.allocUnsafe(4); lb.writeUInt32BE(data.length);
  const cb = Buffer.allocUnsafe(4); cb.writeUInt32BE(crc32(Buffer.concat([tb, data])));
  return Buffer.concat([lb, tb, data, cb]);
}

const IHDR = Buffer.allocUnsafe(13);
IHDR.writeUInt32BE(W, 0); IHDR.writeUInt32BE(H, 4);
IHDR[8] = 8; IHDR[9] = 2; IHDR[10] = 0; IHDR[11] = 0; IHDR[12] = 0;

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  pngChunk('IHDR', IHDR),
  pngChunk('IDAT', zlib.deflateSync(raw, { level: 8 })),
  pngChunk('IEND', Buffer.alloc(0)),
]);

const ASSETS = path.join(__dirname, '..', 'assets');
fs.writeFileSync(path.join(ASSETS, 'icon.png'),          png);
fs.writeFileSync(path.join(ASSETS, 'adaptive-icon.png'), png);

console.log(`  Encode: ${((Date.now() - t1) / 1000).toFixed(1)}s`);
console.log(`  Output: assets/icon.png  +  assets/adaptive-icon.png`);
console.log(`  Size:   ${(png.length / 1024).toFixed(1)} KB`);
console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
