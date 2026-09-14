import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
p.on('pageerror', e => errs.push('pageerror: ' + e.message));
p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(`[${m.type()}] ${m.text()}`); });
await p.goto('http://localhost:5173/', { waitUntil: 'load' });
await p.waitForTimeout(1500);
const probe = async (y) => {
  await p.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), y);
  await p.waitForFunction((y) => Math.abs(window.__hero.state.t - y / 3400) < 0.01, y, { timeout: 20000 }).catch(()=>{});
  await p.waitForTimeout(600);
  return p.evaluate(() => ({ t: +window.__hero.state.t.toFixed(3), rig: +window.__hero.rig.t.toFixed(3),
    canvas: !!document.querySelector('#hero canvas'),
    size: (() => { const c = document.querySelector('#hero canvas'); return c ? `${c.width}x${c.height}` : 'none'; })(),
    heroTop: Math.round(document.getElementById('hero').getBoundingClientRect().top),
    pos: [+window.__hero.camera.position.x.toFixed(2), +window.__hero.camera.position.y.toFixed(2), +window.__hero.camera.position.z.toFixed(2)],
    fov: +window.__hero.camera.fov.toFixed(1) }));
};
for (const y of [0, 1700, 3400, 0]) console.log(`scrollY ${y}`.padEnd(14), JSON.stringify(await probe(y)));
// is anything actually drawn? sample non-black pixel ratio from a screenshot buffer
const shot = await p.screenshot({ clip: { x: 0, y: 0, width: 1280, height: 720 } });
await p.evaluate(() => window.__hero && 0);
console.log('screenshot bytes', shot.length, '| errors:', errs.length ? errs.slice(0,5) : 'none');
await b.close();
