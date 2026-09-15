/**
 * Optional visual smoke test — renders the real page in headless Chromium (WebGL via
 * SwiftShader), scrolls through the hero and writes a frame per stop to ./.shots.
 * Not part of the deliverable; requires `npm i -D playwright && npx playwright install chromium`.
 *   node tools/preview-shots.mjs [url]
 */
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5173/';
const SHOTS = new URL('../.shots/', import.meta.url).pathname;
import { mkdirSync } from 'node:fs';
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url, { waitUntil: 'load' });

/** scroll to a fraction of the PIN range (not the page height) and wait for the scrub
 *  to arrive and the damped rig to catch up, so each frame is the shot it claims to be */
async function goTo(frac, name) {
  const want = await page.evaluate((f) => {
    const st = window.__hero.tween.scrollTrigger;
    const y = Math.round(st.start + f * (st.end - st.start));
    window.scrollTo({ top: y, behavior: 'instant' });
    return { y, t: f };
  }, frac);
  await page
    .waitForFunction(
      (want) =>
        Math.abs(window.__hero.state.t - want.t) < 0.004 &&
        Math.abs(window.__hero.state.t - window.__hero.rig.t) < 0.004,
      want,
      { timeout: 40000 }
    )
    .catch(() => console.log(`  (t did not settle at ${frac})`));
  await page.waitForTimeout(400);
  const st = await page.evaluate(() => ({
    scrollY: Math.round(window.scrollY),
    t: +window.__hero.state.t.toFixed(3),
    rig: +window.__hero.rig.t.toFixed(3),
    fov: +window.__hero.camera.fov.toFixed(1),
    pos: [+window.__hero.camera.position.x.toFixed(2), +window.__hero.camera.position.y.toFixed(2), +window.__hero.camera.position.z.toFixed(2)],
    pinned: getComputedStyle(document.getElementById('hero')).transform,
  }));
  console.log(name.padEnd(9), JSON.stringify(st));
  await page.screenshot({ path: `${SHOTS}${name}.png`, timeout: 120000 });
}

await page.waitForTimeout(1500);
// stops across the WHOLE pin: first 60.7% of it is Scenes 1–3, the rest is Scene 4
for (const [frac, name] of [
  [0, '0-load'],
  [0.25, '1-quarter'],
  [0.5, '2-mid'],
  [0.55, '3-star-in'],
  [0.59, '4-notices'],
  [0.6071, '5-reach-end'],
  [0.66, '6-collapse'],
  [0.72, '7-lurch'],
  [0.85, '8-deep-fall'],
  [1, '9-void'],
  [0, '10-back-at-0'],
])
  await goTo(frac, name);

console.log('\nconsole:\n' + (logs.slice(0, 20).join('\n') || '  (clean)'));
await browser.close();
