#!/usr/bin/env node
/**
 * Captures Play Store screenshots from the design prototype.
 * Renders each tab (Home, Forecast, Map, Splash) at phone + tablet resolutions.
 * Run: node scripts/generate-screenshots.js
 */

const puppeteer = require('puppeteer');
const path      = require('path');
const fs        = require('fs');

const DESIGN_URL = 'http://localhost:4400/index.html';

// Target sizes per form factor
const FORM_FACTORS = [
  { name: 'phone',     dir: 'screenshots',          vw: 540,  vh: 960,  dpr: 2 }, // 1080×1920
  { name: '7-tablet',  dir: 'screenshots-7tablet',  vw: 600,  vh: 960,  dpr: 2 }, // 1200×1920
  { name: '10-tablet', dir: 'screenshots-10tablet', vw: 800,  vh: 1280, dpr: 2 }, // 1600×2560
];

const TABS = [
  { id: 'home',     label: 'Home',     file: '01-home.png'     },
  { id: 'forecast', label: 'Forecast', file: '02-forecast.png' },
  { id: 'map',      label: 'Map',      file: '03-map.png'      },
  { id: 'splash',   label: 'Splash',   file: '04-splash.png'   },
];

// Kp tweaks per screenshot for variety
const KP_SETTINGS = {
  home:     6.1,   // moderate storm → "Excellent."
  forecast: 4.5,   // active
  map:      7.2,   // strong storm
  splash:   5.0,   // minor storm
};

(async () => {
  console.log('Launching browser…');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  for (const ff of FORM_FACTORS) {
    const { name, dir, vw: VW, vh: VH, dpr: DPR } = ff;
    const OUT_DIR = path.join('assets', dir);

    // Ensure output directory exists
    fs.mkdirSync(OUT_DIR, { recursive: true });

    console.log(`\n── Form factor: ${name} (${VW * DPR}×${VH * DPR}) → ${OUT_DIR}`);

    const page = await browser.newPage();
    await page.setViewport({ width: VW, height: VH, deviceScaleFactor: DPR });

    console.log(`  Navigating to ${DESIGN_URL}…`);
    await page.goto(DESIGN_URL, { waitUntil: 'networkidle2', timeout: 30000 });

    // Wait for React to mount
    await page.waitForFunction(() => document.querySelector('button') !== null, { timeout: 10000 });
    await new Promise(r => setTimeout(r, 1500));

    for (const tab of TABS) {
      console.log(`  Capturing ${tab.label}…`);

      // Set Kp via the slider
      const kp = KP_SETTINGS[tab.id];
      await page.evaluate((kp) => {
        const sliders = document.querySelectorAll('input[type="range"]');
        const kpSlider = sliders[0];
        if (kpSlider) {
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          nativeInputValueSetter.call(kpSlider, kp);
          kpSlider.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }, kp);
      await new Promise(r => setTimeout(r, 300));

      // Click the matching tab button
      await page.evaluate((label) => {
        const btns = Array.from(document.querySelectorAll('button'));
        const btn  = btns.find(b => b.textContent.trim().toLowerCase() === label.toLowerCase());
        if (btn) btn.click();
      }, tab.label);
      await new Promise(r => setTimeout(r, 800));

      // Hide the tweaks panel (right-side controls) so it doesn't appear in screenshot
      await page.evaluate(() => {
        const panels = document.querySelectorAll('[class*="tweak"], [class*="Tweak"], [id*="tweak"]');
        panels.forEach(p => { p.style.display = 'none'; });
        // Also hide anything positioned to the right of the phone frame
        document.querySelectorAll('*').forEach(el => {
          const r = el.getBoundingClientRect();
          if (r.left > 420 && el.children.length > 0) el.style.visibility = 'hidden';
        });
      });

      // Find the iOS frame element and screenshot just that region
      const frameEl = await page.$('[class*="ios"], [class*="Ios"], [class*="device"], [class*="Device"], [class*="frame"], [class*="Frame"]');

      const dest = path.join(OUT_DIR, tab.file);
      if (frameEl) {
        await frameEl.screenshot({ path: dest, type: 'png' });
      } else {
        // Fallback: screenshot viewport cropped to phone dimensions
        await page.screenshot({ path: dest, type: 'png', clip: { x: 0, y: 0, width: VW, height: VH } });
      }

      console.log(`    → ${dest}`);

      // Restore visibility for next tab
      await page.evaluate(() => {
        document.querySelectorAll('*').forEach(el => { el.style.visibility = ''; });
      });
    }

    await page.close();
  }

  await browser.close();
  console.log('\nDone. Screenshots saved to:');
  FORM_FACTORS.forEach(ff => console.log(`  assets/${ff.dir}/`));
  console.log('\nUpload these in Play Console → Main store listing → Screenshots');
})().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
