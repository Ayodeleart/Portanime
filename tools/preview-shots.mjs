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
// Stops are pinned to SCROLL PIXELS (the story lives in px, not fractions) and derive
// from the live three-budget map: reveal 0→2108, story 2108→4508 (star/notice/reach),
// fall 4508→6708. Add ?debug to the URL to get the star/hand/tip reticles in-frame.
const px = await page.evaluate(() => {
  const m = window.__hero.storyMap;
  return { reveal: m.revealPx, story: m.storyPx, fall: m.fallPx, abyss: m.abyssPx, total: m.totalPx };
});
const stopDefs = [
  [0, '0-load'],
  [() => Math.round(px.reveal * 0.55), '1-orbit'],
  [() => px.reveal - 2, '2-reveal-end'], // side view settles; no star yet
  [() => px.reveal + Math.round(px.story * 0.35), '3-star-in'], // star fully present, before he turns
  [() => px.reveal + Math.round(px.story * 0.66), '4-notice'], // head swung, stroke paused
  [() => px.reveal + px.story - 2, '5-reach'], // full reach at story end: brush at the star
  [() => px.reveal + px.story + Math.round(px.fall * 0.035), '6-catch'], // catch closes on it (p=.035)
  [() => px.reveal + px.story + Math.round(px.fall * 0.075), '7-flare-collapse'], // flare peak + ground cracks
  [() => px.reveal + px.story + Math.round(px.fall * 0.16), '8-fall'], // gone; camera diving after him
  [() => px.reveal + px.story + Math.round(px.fall * 0.62), '9-shatter'], // the body is breaking into code
  [() => px.reveal + px.story + px.fall + Math.round(px.abyss * 0.06), '10-abyss-open'], // veil lifts: chaotic shaft
  [() => px.reveal + px.story + px.fall + Math.round(px.abyss * 0.42), '11-abyss-mid'], // density climbing
  [() => px.reveal + px.story + px.fall + Math.round(px.abyss * 0.85), '12-abyss-order'], // lattice order, room below
  [() => px.total - 1, '13-bottom'],
  [() => 0, '10-back-at-0'],
];
for (const [fn, name] of stopDefs) await goTo(fn() / px.total, name);

// same beat on a phone viewport, where the invisibility was reported
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(800);
for (const [fn, name] of stopDefs.filter(([, n]) => /^([2-8]|10)/.test(n)))
  await goTo(fn() / px.total, `phone-${name}`);

console.log('\nconsole:\n' + (logs.slice(0, 20).join('\n') || '  (clean)'));
await browser.close();
