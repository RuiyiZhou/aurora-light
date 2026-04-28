#!/usr/bin/env node
/**
 * Generates Google Play Store assets:
 *   assets/store-icon.png       — 512×512  hi-res icon
 *   assets/feature-graphic.png  — 1024×500 feature banner
 */

const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

// ── PNG utils ─────────────────────────────────────────────────────────────
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
function encodePNG(W, H, buf) {
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
  const IHDR = Buffer.allocUnsafe(13);
  IHDR.writeUInt32BE(W, 0); IHDR.writeUInt32BE(H, 4);
  IHDR[8] = 8; IHDR[9] = 2; IHDR[10] = 0; IHDR[11] = 0; IHDR[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', IHDR),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 8 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Screen-blend helper ───────────────────────────────────────────────────
function screen(a, b) { return 255 - (255 - a) * (255 - b) / 255; }

// ── LCG random ────────────────────────────────────────────────────────────
function makeLCG(seed) {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

// ── Gaussian blob writer ──────────────────────────────────────────────────
function addGaussian(buf, W, H, sx, sy, sigma, brightness, cr, cg, cb) {
  const sig2 = 2 * sigma * sigma;
  const pad  = Math.ceil(sigma * 4);
  for (let py = Math.max(0, Math.floor(sy - pad)); py <= Math.min(H - 1, Math.ceil(sy + pad)); py++) {
    const dy2 = (py - sy) ** 2;
    for (let px = Math.max(0, Math.floor(sx - pad)); px <= Math.min(W - 1, Math.ceil(sx + pad)); px++) {
      const v = brightness * Math.exp(-(((px - sx) ** 2) + dy2) / sig2);
      if (v < 0.003) continue;
      const o = (py * W + px) * 3;
      buf[o]     = Math.min(255, screen(buf[o],     v * cr));
      buf[o + 1] = Math.min(255, screen(buf[o + 1], v * cg));
      buf[o + 2] = Math.min(255, screen(buf[o + 2], v * cb));
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. STORE ICON  512×512
// ═══════════════════════════════════════════════════════════════════════════
{
  const W = 512, H = 512, cx = W / 2, cy = H / 2;
  console.log(`Rendering store-icon.png (${W}×${H})…`);
  const buf = new Float32Array(W * H * 3);

  // Background radial gradient
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d  = Math.sqrt(((x - cx) / cx) ** 2 + ((y - cy) / cy) ** 2);
      const bg = 1 - Math.min(1, d) * 0.35;
      const o  = (y * W + x) * 3;
      buf[o]     = 2 * bg + 2;
      buf[o + 1] = 2 * bg + 2;
      buf[o + 2] = 7 * bg + 2;
    }
  }

  // Latitude rings
  for (const rr of [140, 112, 84, 56, 21]) {
    for (let y = Math.floor(cy - rr - 3); y <= Math.ceil(cy + rr + 3); y++) {
      for (let x = Math.floor(cx - rr - 3); x <= Math.ceil(cx + rr + 3); x++) {
        const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        const v = Math.exp(-((d - rr) ** 2) / 3) * 0.12;
        if (v < 0.005 || x < 0 || x >= W || y < 0 || y >= H) continue;
        const o = (y * W + x) * 3;
        buf[o] = Math.min(255, buf[o] + v * 12);
        buf[o + 1] = Math.min(255, buf[o + 1] + v * 12);
        buf[o + 2] = Math.min(255, buf[o + 2] + v * 20);
      }
    }
  }

  // Meridians
  for (let deg = 0; deg < 180; deg += 22.5) {
    const rad = (deg * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    for (let t = -140; t <= 140; t++) {
      if (Math.abs(t) % 20 < 10) continue;
      const px = Math.round(cx + cos * t), py = Math.round(cy + sin * t);
      if (px < 0 || px >= W || py < 0 || py >= H) continue;
      if (Math.sqrt((px - cx) ** 2 + (py - cy) ** 2) > 140) continue;
      const o = (py * W + px) * 3;
      buf[o] = Math.min(255, buf[o] + 10);
      buf[o + 1] = Math.min(255, buf[o + 1] + 10);
      buf[o + 2] = Math.min(255, buf[o + 2] + 18);
    }
  }

  // Stars
  const rand1 = makeLCG(7);
  for (let i = 0; i < 50; i++) {
    let sx, sy;
    do { sx = rand1() * W; sy = rand1() * H; }
    while (Math.sqrt((sx - cx) ** 2 + (sy - cy) ** 2) > 134);
    addGaussian(buf, W, H, sx, sy, 0.6 + rand1() * 1.2, 0.3 + rand1() * 0.7, 230, 240, 248);
  }

  // Aurora ring — 3 glow layers
  const RING_R = 126;
  for (const [sigma, peak, cr, cg, cb] of [
    [35, 0.50,  14, 107,  74],
    [14, 0.85,  16, 185, 129],
    [ 5, 1.00, 110, 231, 183],
  ]) {
    const sig2 = 2 * sigma * sigma, pad = Math.ceil(sigma * 4);
    for (let y = Math.max(0, cy - RING_R - pad); y <= Math.min(H - 1, cy + RING_R + pad); y++) {
      for (let x = Math.max(0, cx - RING_R - pad); x <= Math.min(W - 1, cx + RING_R + pad); x++) {
        const dist = Math.abs(Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) - RING_R);
        if (dist > pad) continue;
        const angle = Math.atan2(y - cy, x - cx);
        const v = peak * (0.75 + 0.25 * Math.cos(angle + Math.PI * 0.35)) * Math.exp(-(dist * dist) / sig2);
        if (v < 0.003) continue;
        const o = (y * W + x) * 3;
        buf[o]     = Math.min(255, screen(buf[o],     v * cr));
        buf[o + 1] = Math.min(255, screen(buf[o + 1], v * cg));
        buf[o + 2] = Math.min(255, screen(buf[o + 2], v * cb));
      }
    }
  }

  // Pole crosshair
  for (let d = -4; d <= 4; d++) {
    if (Math.abs(d) < 2) continue;
    [[cx + d, cy], [cx, cy + d]].forEach(([px, py]) => {
      const o = (Math.round(py) * W + Math.round(px)) * 3;
      if (o >= 0 && o < buf.length) { buf[o] = 52; buf[o+1] = 52; buf[o+2] = 80; }
    });
  }

  const dest = path.join(__dirname, '..', 'assets', 'store-icon.png');
  fs.writeFileSync(dest, encodePNG(W, H, buf));
  console.log(`  → ${dest} (${(fs.statSync(dest).size / 1024).toFixed(1)} KB)`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. FEATURE GRAPHIC  1024×500
// ═══════════════════════════════════════════════════════════════════════════
{
  const W = 1024, H = 500;
  console.log(`Rendering feature-graphic.png (${W}×${H})…`);
  const buf = new Float32Array(W * H * 3);

  // Background gradient: dark left-to-right with slight green tinge center
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const tx = x / W, ty = y / H;
      const g  = Math.exp(-(((tx - 0.5) ** 2) / 0.18 + ((ty - 0.52) ** 2) / 0.14)) * 0.4;
      const o  = (y * W + x) * 3;
      buf[o]     = 2  + g * 6;
      buf[o + 1] = 2  + g * 24;
      buf[o + 2] = 9  + g * 12;
    }
  }

  // Stars — scattered across full banner
  const rand2 = makeLCG(31);
  for (let i = 0; i < 160; i++) {
    const sx = rand2() * W, sy = rand2() * H * 0.85;
    const br = 0.2 + rand2() * 0.8;
    const r  = rand2() < 0.9 ? 0.8 + rand2() * 1.5 : 2 + rand2() * 2.5;
    addGaussian(buf, W, H, sx, sy, r, br, 228, 238, 248);
  }

  // Elliptical glow halo — wide and centred
  {
    const gcx = W * 0.5, gcy = H * 0.52;
    const grx = W * 0.55, gry = H * 0.30;
    for (let y = Math.max(0, Math.floor(gcy - gry * 3)); y <= Math.min(H-1, Math.ceil(gcy + gry * 3)); y++) {
      const dy = (y - gcy) / gry;
      for (let x = 0; x < W; x++) {
        const dx = (x - gcx) / grx;
        const v  = 0.28 * Math.exp(-(dx*dx + dy*dy) * 0.8);
        if (v < 0.002) continue;
        const o = (y * W + x) * 3;
        buf[o]     = Math.min(255, screen(buf[o],     v * 14));
        buf[o + 1] = Math.min(255, screen(buf[o + 1], v * 130));
        buf[o + 2] = Math.min(255, screen(buf[o + 2], v * 80));
      }
    }
  }

  // Aurora ribbons — 4 waves spanning full width
  const ribbons = [
    { yBase: H * 0.36, amp: H * 0.09, phase: 0.0,  op: 0.60, sigma: H * 0.038 },
    { yBase: H * 0.46, amp: H * 0.11, phase: 1.3,  op: 0.45, sigma: H * 0.050 },
    { yBase: H * 0.55, amp: H * 0.07, phase: 2.5,  op: 0.32, sigma: H * 0.032 },
    { yBase: H * 0.62, amp: H * 0.05, phase: 3.8,  op: 0.20, sigma: H * 0.024 },
  ];
  for (const { yBase, amp, phase, op, sigma } of ribbons) {
    const sig2 = 2 * sigma * sigma, maxDy = Math.ceil(sigma * 4);
    for (let x = 0; x < W; x++) {
      const ribY = yBase + Math.sin((x / W) * Math.PI * 2 + phase) * amp;
      for (let y = Math.max(0, Math.floor(ribY - maxDy)); y <= Math.min(H-1, Math.ceil(ribY + maxDy)); y++) {
        const v = op * Math.exp(-((y - ribY) ** 2) / sig2);
        if (v < 0.003) continue;
        const o = (y * W + x) * 3;
        buf[o]     = Math.min(255, screen(buf[o],     v * 16));
        buf[o + 1] = Math.min(255, screen(buf[o + 1], v * 185));
        buf[o + 2] = Math.min(255, screen(buf[o + 2], v * 129));
      }
    }
  }

  // Polar oval icon — right side of banner
  {
    const ocx = W * 0.78, ocy = H * 0.50, RING = H * 0.28;
    // Faint lat rings
    for (const rr of [RING, RING*0.74, RING*0.50, RING*0.28]) {
      for (let y = Math.floor(ocy-rr-3); y <= Math.ceil(ocy+rr+3); y++) {
        for (let x = Math.floor(ocx-rr-3); x <= Math.ceil(ocx+rr+3); x++) {
          if (x<0||x>=W||y<0||y>=H) continue;
          const v = Math.exp(-(( Math.sqrt((x-ocx)**2+(y-ocy)**2) - rr)**2)/3) * 0.10;
          if (v < 0.004) continue;
          const o = (y*W+x)*3;
          buf[o] = Math.min(255,buf[o]+v*10); buf[o+1]=Math.min(255,buf[o+1]+v*10); buf[o+2]=Math.min(255,buf[o+2]+v*18);
        }
      }
    }
    // Glow layers on the ring
    for (const [sigma, peak, cr, cg, cb] of [
      [RING*0.18, 0.45,  14, 107,  74],
      [RING*0.07, 0.80,  16, 185, 129],
      [RING*0.025,1.00, 110, 231, 183],
    ]) {
      const sig2 = 2*sigma*sigma, pad = Math.ceil(sigma*4);
      for (let y = Math.max(0,ocy-RING-pad); y <= Math.min(H-1,ocy+RING+pad); y++) {
        for (let x = Math.max(0,ocx-RING-pad); x <= Math.min(W-1,ocx+RING+pad); x++) {
          const dist = Math.abs(Math.sqrt((x-ocx)**2+(y-ocy)**2) - RING);
          if (dist > pad) continue;
          const ang = Math.atan2(y-ocy, x-ocx);
          const v = peak*(0.75+0.25*Math.cos(ang+Math.PI*0.35))*Math.exp(-(dist*dist)/sig2);
          if (v < 0.003) continue;
          const o = (y*W+x)*3;
          buf[o]  =Math.min(255,screen(buf[o],  v*cr));
          buf[o+1]=Math.min(255,screen(buf[o+1],v*cg));
          buf[o+2]=Math.min(255,screen(buf[o+2],v*cb));
        }
      }
    }
    // Pole crosshair
    for (let d = -5; d <= 5; d++) {
      if (Math.abs(d) < 2) continue;
      [[ocx+d,ocy],[ocx,ocy+d]].forEach(([px,py])=>{
        const o=(Math.round(py)*W+Math.round(px))*3;
        if(o>=0&&o<buf.length){buf[o]=52;buf[o+1]=52;buf[o+2]=80;}
      });
    }
  }

  const dest = path.join(__dirname, '..', 'assets', 'feature-graphic.png');
  fs.writeFileSync(dest, encodePNG(W, H, buf));
  console.log(`  → ${dest} (${(fs.statSync(dest).size / 1024).toFixed(1)} KB)`);
}

console.log('Done.');
