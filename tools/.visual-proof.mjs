/**
 * .visual-proof.mjs — software pixel proof for the Scene 3→4 beat.
 * This sandbox has no browser, so we raster the REAL scene graph (same modules main.js
 * runs: rig, artist, star, fall layer) into a canvas ourselves: z-buffered triangles,
 * approximate lambert+fog, ACES tone curve, additive glow sprites. It cannot prove
 * shader-accurate brightness — it proves the GEOMETRY the complaint was about:
 * is the star in frame, is it separated, is it brighter than its ring, does the head
 * and hand actually move. Output: .proof/*.png + printed px metrics.
 *   node tools/.visual-proof.mjs
 */
import { createCanvas } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { createCameraRig, PATH } from '../src/camera-path.js';
import { createArtist } from '../src/artist.js';
import { createStar, STAR } from '../src/star.js';
import { measureScene3, SCENE3 } from '../src/scene3.js';
import { FALL, createFallLayer, buildScrollMap, heroTime } from '../src/scene4.js';
PATH.float.amp = 0;
mkdirSync('.proof', { recursive: true });

const ACES = (x) => Math.min(1, (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14));
const FOG = new THREE.Color(0x101724);
const LIGHTS = [
  { dir: new THREE.Vector3(-3.4, 4.6, 5.2).normalize(), col: new THREE.Color(0xbcd2ff).multiplyScalar(1.5 * 0.16) },
  { dir: new THREE.Vector3(1.9, 2.7, -3.4).normalize(), col: new THREE.Color(0xa8c8ff).multiplyScalar(2.9 * 0.16) },
  { dir: new THREE.Vector3(-2.9, 1.5, -2.9).normalize(), col: new THREE.Color(0x7fa6e8).multiplyScalar(1.35 * 0.16) },
  { dir: new THREE.Vector3(2.6, 1.4, 4.4).normalize(), col: new THREE.Color(0xffd9a8).multiplyScalar(0.55 * 0.16) },
];
const HEMI = new THREE.Color(0x2c3a55).multiplyScalar(0.7 * 0.4);

const map = buildScrollMap();

function shoot(label, t01, { W = 800, H = 450, markers = false } = {}) {
  const camera = new THREE.PerspectiveCamera(30, W / H, 0.03, 60);
  camera.aspect = W / H;
  const rig = createCameraRig(camera);
  const scene = new THREE.Scene();
  const artist = createArtist();
  scene.add(artist.group);
  const star = createStar();
  const lights = {};
  for (const [k, v] of Object.entries({ key: 1.5, rim: 2.9, rim2: 1.35, bounce: 0.55, wash: 22, canvasGlow: 6 })) {
    const l = new THREE.Object3D(); l.intensity = v; lights[k] = l;
  }
  const layer = createFallLayer({ scene, camera, renderer: null, artist, star, split: FALL.split, toP: map.p, lights });
  // settle like the render loop does (constant scrub position, damp everything in)
  for (let i = 0; i < 700; i++) {
    const heroT = map.heroT(t01);
    rig.update(heroT, 1 / 60);
    const s3 = measureScene3(rig.t);
    star.update(s3, 1, 1 / 60);
    artist.update(1, 1 / 60, s3, star.anchor);
    layer.update(t01, 1, 1 / 60, s3, rig);
  }
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  artist.group.updateMatrixWorld(true);
  scene.updateMatrixWorld(true);

  const cv = createCanvas(W, H);
  const ctx = cv.getContext('2d');
  // sky: the CSS gradient behind the canvas, dim version
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#05070c'); sky.addColorStop(0.55, '#0b1220'); sky.addColorStop(1, '#131c2e');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

  // ground plane fill (the split halves — painter-ish: just the disc silhouette)
  const invV = camera.matrixWorldInverse;
  const proj = camera.projectionMatrix;
  const toPx = (v, out) => {
    const c = v.clone().applyMatrix4(invV).applyMatrix4(proj);
    out[0] = (c.x * 0.5 + 0.5) * W; out[1] = (1 - (c.y * 0.5 + 0.5)) * H; out[2] = c.z;
    return out;
  };

  // triangles from every Mesh in the scene (the figure, props, floor halves)
  const tris = [];
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3();
  scene.traverse((o) => {
    if (!o.isMesh || !o.visible || o.geometry?.type === 'Sprite') return;
    const geo = o.geometry;
    const pos = geo.getAttribute('position'); if (!pos) return;
    const col = o.material?.color ?? new THREE.Color(0x888888);
    const emiss = o.material?.emissive?.r ?? 0;
    const nm = new THREE.Matrix3().getNormalMatrix(o.matrixWorld);
    const opa = o.material?.opacity ?? 1;
    const idx = geo.index;
    const n = idx ? idx.count : pos.count;
    for (let i = 0; i < n; i += 3) {
      const ia = idx ? idx.getX(i) : i, ib = idx ? idx.getX(i + 1) : i + 1, ic = idx ? idx.getX(i + 2) : i + 2;
      tmpA.fromBufferAttribute(pos, ia).applyMatrix4(o.matrixWorld);
      tmpB.fromBufferAttribute(pos, ib).applyMatrix4(o.matrixWorld);
      tmpC.fromBufferAttribute(pos, ic).applyMatrix4(o.matrixWorld);
      const va = tmpA.clone().applyMatrix4(invV), vb = tmpB.clone().applyMatrix4(invV), vc = tmpC.clone().applyMatrix4(invV);
      if (va.z > -0.05 && vb.z > -0.05 && vc.z > -0.05) continue; // behind near plane
      const pa = [0, 0, 0], pb = [0, 0, 0], pc = [0, 0, 0];
      toPx(tmpA, pa); toPx(tmpB, pb); toPx(tmpC, pc);
      if (Math.max(pa[0], pb[0], pc[0]) < 0 || Math.min(pa[0], pb[0], pc[0]) > W) continue;
      if (Math.max(pa[1], pb[1], pc[1]) < 0 || Math.min(pa[1], pb[1], pc[1]) > H) continue;
      const nrm = tmpB.clone().sub(tmpA).cross(tmpC.clone().sub(tmpA)).normalize().applyMatrix3(nm).normalize();
      // view dir for lambert-ish two-sided + fog
      const cen = tmpA.clone().add(tmpB).add(tmpC).multiplyScalar(1 / 3);
      const viewZ = camera.position.distanceTo(cen);
      const fog = THREE.MathUtils.smoothstep(viewZ, 2.6, 15);
      let lit = HEMI.r + HEMI.g * 0.8 + HEMI.b;
      const c = col.clone();
      const lightSum = new THREE.Color(0, 0, 0);
      for (const L of LIGHTS) {
        const d = Math.abs(nrm.dot(L.dir)); // two-sided, stylized
        lightSum.add(L.col.clone().multiplyScalar(d));
      }
      const k = emiss > 0.01 ? 1 + emiss * 0.8 : 1;
      const r = ACES((c.r * k) * (0.25 + lightSum.r) * 1.9) * (1 - fog) + FOG.r * fog;
      const g = ACES((c.g * k) * (0.25 + lightSum.g) * 1.9) * (1 - fog) + FOG.g * fog;
      const b = ACES((c.b * k) * (0.25 + lightSum.b) * 1.9) * (1 - fog) + FOG.b * fog;
      void lit;
      const z = (va.z + vb.z + vc.z) / 3;
      tris.push({ pa, pb, pc, z, style: `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`, opa });
    }
  });
  tris.sort((a, b2) => b2.z - a.z); // far first (painter; matches the dark, flat style well enough)
  for (const t of tris) {
    ctx.globalAlpha = t.opa < 0.999 ? t.opa : 1;
    ctx.fillStyle = t.style;
    ctx.beginPath();
    ctx.moveTo(t.pa[0], t.pa[1]); ctx.lineTo(t.pb[0], t.pb[1]); ctx.lineTo(t.pc[0], t.pc[1]); ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // star: additive radial gradients exactly like the depth-test-free sprites, sizes from world scale
  const starInfo = { center: null, haloPx: 0, ratio: 0 };
  if (star.group.visible) {
    const sp = [0, 0, 0];
    toPx(star.group.position, sp);
    const vd = camera.position.distanceTo(star.group.position);
    const focal = H / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    const radPx = (worldR) => (worldR / vd) * focal;
    const layers = [
      { s: STAR.size * 20, c: new THREE.Color(0xffd7a0), o: star.layers.scatter.material.opacity, hardness: 0.1 },
      { s: STAR.size * STAR.haloScale, c: new THREE.Color(0xffe6bb), o: star.layers.halo.material.opacity, hardness: 0.22 },
      { s: STAR.size * STAR.flareScale, c: new THREE.Color(0xfff0d2), o: star.layers.flare.material.opacity, hardness: 0.5 },
    ];
    ctx.globalCompositeOperation = 'lighter';
    for (const L of layers) {
      const R = radPx(L.s / 2);
      if (R < 0.5 || L.o < 0.01) continue;
      const gr = ctx.createRadialGradient(sp[0], sp[1], 0, sp[0], sp[1], R);
      const c = L.c;
      gr.addColorStop(0, `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${L.o})`);
      gr.addColorStop(L.hardness, `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${(L.o * (1 - L.hardness)).toFixed(3)})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(sp[0] - R, sp[1] - R, R * 2, R * 2);
    }
    // nucleus sprite = the bright light: solid small core
    const rn = Math.max(1.4, radPx(STAR.size * 2));
    ctx.fillStyle = `rgba(255,248,230,${Math.min(1, star.layers.nucleus.material.opacity)})`;
    ctx.beginPath(); ctx.arc(sp[0], sp[1], rn, 0, 7); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    starInfo.center = sp;
    starInfo.haloPx = radPx(STAR.size * STAR.haloScale / 2) * 2;
    // luminance ratio: core 4px vs annulus just OUTSIDE the halo edge (its own glow
    // must not pollute the "environment" sample) — and only when in frame
    const img = ctx.getImageData(0, 0, W, H).data;
    const lumAt = (x, y) => {
      if (x < 1 || y < 1 || x > W - 2 || y > H - 2) return null;
      const i = ((y | 0) * W + (x | 0)) * 4;
      return 0.2126 * img[i] + 0.7152 * img[i + 1] + 0.0722 * img[i + 2];
    };
    const rr = Math.max(30, starInfo.haloPx * 0.78);
    let core = 0, n0 = 1, ring = 0, n1 = 1, ringSeen = 0;
    starInfo.inFrame = sp[0] > 0 && sp[0] < W && sp[1] > 0 && sp[1] < H;
    if (starInfo.inFrame) {
      for (let a = 0; a < 64; a++) {
        const th = (a / 64) * Math.PI * 2;
        const lc = lumAt(sp[0] + Math.cos(th) * 4, sp[1] + Math.sin(th) * 4);
        const lr = lumAt(sp[0] + Math.cos(th) * rr, sp[1] + Math.sin(th) * rr);
        if (lc !== null) core += lc; else { core = 0; n0 = 1; break; }
        if (lr !== null) { ring += lr; ringSeen = n1++; }
      }
      starInfo.ratio = core / n0 / Math.max(1, ring / Math.max(1, ringSeen));
    }
  }

  // debug-style markers (same overlay the user gets with ?debug)
  if (markers) {
    const mark = (v, col, r) => {
      const p = [0, 0, 0]; toPx(v, p);
      ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p[0] - r - 4, p[1]); ctx.lineTo(p[0] + r + 4, p[1]); ctx.moveTo(p[0], p[1] - r - 4); ctx.lineTo(p[0], p[1] + r + 4); ctx.stroke();
      return p;
    };
    const hand = artist.parts.rightArm.hand.getWorldPosition(new THREE.Vector3());
    const tip = new THREE.Vector3(); artist.parts.rightArm.tool.children[2].getWorldPosition(tip);
    starInfo.handPx = mark(hand, '#35e0ff', 6);
    starInfo.tipPx = mark(tip, '#7dff6a', 5);
    if (starInfo.center) {
      starInfo.gapPx = Math.hypot(starInfo.tipPx[0] - starInfo.center[0], starInfo.tipPx[1] - starInfo.center[1]);
      starInfo.handGapPx = Math.hypot(starInfo.handPx[0] - starInfo.center[0], starInfo.handPx[1] - starInfo.center[1]);
    }
    mark(artist.parts.head.getWorldPosition(new THREE.Vector3()), '#ff2fd6', 7);
  }

  return { cv, info: starInfo };
}

// reaction-only displacement at the FIXED end frame (camera frozen at heroT 1):
// how far does the head/hand travel on screen purely from Scene 3's beat?
function reactionDisplacement(W, H) {
  const camera = new THREE.PerspectiveCamera(30, W / H, 0.03, 60);
  const rig = createCameraRig(camera);
  for (let i = 0; i < 400; i++) rig.update(1, 1 / 60);
  camera.updateMatrixWorld(true); camera.updateProjectionMatrix();
  const artist = createArtist();
  const star = createStar();
  const toPx = (v) => { const c = v.clone().project(camera); return [(c.x * 0.5 + 0.5) * W, (1 - (c.y * 0.5 + 0.5)) * H]; };
  artist.update(1, 1 / 60, measureScene3(SCENE3.appear[0] - 0.02), null);
  artist.group.updateMatrixWorld(true);
  const h0 = toPx(artist.parts.head.getWorldPosition(new THREE.Vector3()));
  const sh0 = toPx(artist.parts.rightArm.pivot.getWorldPosition(new THREE.Vector3()));
  artist.update(1, 1 / 60, measureScene3(1), star.anchor);
  artist.group.updateMatrixWorld(true);
  const h1 = toPx(artist.parts.head.getWorldPosition(new THREE.Vector3()));
  const tip = new THREE.Vector3(); artist.parts.rightArm.tool.children[2].getWorldPosition(tip);
  const t1 = toPx(tip);
  return {
    headPx: Math.hypot(h1[0] - h0[0], h1[1] - h0[1]),
    brushPx: Math.hypot(t1[0] - sh0[0], t1[1] - sh0[1]),
  };
}

const STOPS = [
  ['01-prereveal', map.revealPx * 0.55 / map.totalPx, 'mid-orbit, before the beat'],
  ['02-revealend', (map.revealPx - 1) / map.totalPx, 'side view settles — no star yet'],
  ['03-star', (map.revealPx + map.storyPx * 0.35) / map.totalPx, 'star fully present (appear ~done)'],
  ['04-notice', (map.revealPx + map.storyPx * 0.66) / map.totalPx, 'turn mid — head swung, stroke paused'],
  ['05-reach', (map.revealPx + map.storyPx - 2) / map.totalPx, 'full reach at story end: brush at the star'],
  ['06-catch', (map.revealPx + map.storyPx + 0.035 * map.fallPx) / map.totalPx, 'catch moment p=.035 (tip→star ~12cm)'],
  ['07-flare', (map.revealPx + map.storyPx + 0.075 * map.fallPx) / map.totalPx, 'star flares as the ground cracks p=.075 — cause visible'],
  ['08-break', (map.revealPx + map.storyPx + 0.105 * map.fallPx) / map.totalPx, 'star breaks away at the top of the reach line p=.105'],
  ['09-fall', (map.revealPx + map.storyPx + 0.16 * map.fallPx) / map.totalPx, 'ground gone, he falls'],
];
const VIEWS = [['desk', 800, 450], ['phone', 390, 844]];

for (const [label, t01, note] of STOPS) {
  for (const [name, W, H] of VIEWS) {
    const { cv, info } = shoot(label, t01, { W, H, markers: /^(03|05|06|07|08)/.test(label) });
    writeFileSync(`.proof/${label}-${name}.png`, cv.toBuffer('image/png'));
    const extras = [];
    if (info.center) extras.push(`star@(${info.center[0].toFixed(0)},${info.center[1].toFixed(0)})${info.inFrame ? '' : ' OFF-SCREEN'} halo ${info.haloPx.toFixed(0)}px lumRatio ${info.inFrame ? info.ratio.toFixed(1) : '—'}`);
    if (info.gapPx !== undefined) extras.push(`tip→star ${info.gapPx.toFixed(0)}px hand→star ${info.handGapPx.toFixed(0)}px`);
    console.log(`${label} [${name}] ${note}${extras.length ? '\n        ' + extras.join('  |  ') : ''}`);
  }
}
for (const [name, W, H] of VIEWS) {
  const r = reactionDisplacement(W, H);
  console.log(`reaction (${name} ${W}×${H}): head travels ${r.headPx.toFixed(0)}px, brush arm swings ${r.brushPx.toFixed(0)}px across the frame — from the BEAT alone, camera frozen`);
}
console.log('\nwrote .proof/*.png');
