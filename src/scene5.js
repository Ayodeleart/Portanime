/**
 * scene5.js — Scenes 5 & 6: the artist SHATTERS into code while falling, and the
 * scroll continues down through a procedural coding abyss that organises itself.
 *
 * Two systems, both pure functions of scroll:
 *
 *   SHATTER  (driven by Scene 4's local p, window [0.45, 0.82])
 *     the figure dissolves into instanced dark shards, glowing code-glyph sprites,
 *     thin data lines and motes — all parented to artist.figure, so the whole
 *     dissolve rides the fall for free. The figure's own meshes blink out per-mesh
 *     behind the dissolve (head/hair last): no pop, no fade-to-nothing, fully
 *     deterministic in p. At s = 0 nothing is written.
 *
 *   ABYSS    (driven by the new --abyss-scroll budget, local a ∈ [0,1])
 *     the camera keeps falling `ABYSS.travel` metres through a shaft of code:
 *     glyph streams, thin data lines, pseudo-code panels, distant layers, grid
 *     and wireframe fragments, motes. Everything wraps ±band around the camera,
 *     so one fixed instance budget reads as an infinite corridor; every position
 *     is closed-form in (a, seed) — scrolling up rewinds exactly, and a stopped
 *     scroll freezes the frame (heavy recompute only when a actually moves).
 *     Early: chaotic, sparse, violent. Mid: density rises. Late: fragments snap
 *     to a lattice, lines straighten into paths, noise thins — leaving the clear
 *     vertical room where the later red line will run (there is NO red line yet).
 *
 * Dormancy contract (check-shot guards it): at a = 0 the abyss writes NOTHING,
 * and its veil/fog/exposure/aim overlays equal Scene 4's own end-state at the
 * boundary — so Scenes 1–4 cannot see any difference.
 */
import * as THREE from 'three';
import { FALL } from './scene4.js';
import { smoothstep } from './scene3.js';

const win = (x, a, b) => smoothstep(x, a, b);
const winW = (x, [a, b]) => smoothstep(x, a, b);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const lerp = THREE.MathUtils.lerp;

/* ───────────────────────────── the one config block ───────────────────────── */

export const ABYSS = {
  /** world metres of extra descent across the whole --abyss-scroll budget */
  travel: 120,
  /** content wraps inside ±band around the camera — one budget, infinite corridor */
  band: 44,

  /** shatter: when it runs, how strong, the four material families */
  shatter: {
    win: [0.45, 0.82], // Scene-4 local p the dissolve occupies (human holds intact before it)
    shards: 300, // dark angular fragments (instanced)
    glyphs: 150, // glowing code-glyph sprites (instanced, billboarded)
    threads: 96, // thin data lines (LineSegments)
    motes: 340, // data motes (Points)
    drift: 1.45, // metres of outward travel at full dissolve
    meshFrom: 0.1, // the figure's meshes blink out per-mesh between…
    meshSpan: 0.78, // …meshFrom and meshFrom+meshSpan of s (hashed order; head/hair last)
    size: 0.05, // base shard edge (m)
    glowMix: 0.3, // shard-colour mix toward the data-glow palette
  },

  /** the abyss shaft systems — desktop counts; ctx.scale (mobile) trims them */
  counts: { streams: [130, 110, 96], lines: 240, panels: 42, far: 14, grids: 20, wires: 22, motes: 620 },
  mobileScale: 0.6,
  glyphPx: 72, // glyph canvas texture size — build-time only, headless-safe

  /** ordered lattice everything converges to */
  lattice: { columns: 24, rings: 3, radius: [5.5, 13.5] },
  /** chaotic seed volume before organisation (radius m; per-instance rise share) */
  chaos: { radius: [1.8, 21], vFrac: [-0.12, 0.6] },

  /** palette — cool data-glow, deliberately no red (that belongs to a later scene) */
  colors: {
    glyphA: 0x9fe8ff, // brackets / braces
    glyphB: 0x69d9c2, // semicolons / binary-like
    snippet: 0xd5ddf5, // pseudo-code fragments (dim white-blue)
    line: 0x3fb9ff, // thin data lines
    panel: 0x8fb6d8,
    far: 0x3c6ea0, // distant code layers
    grid: 0x2f5f86,
    wire: 0x5f9fd0,
    mote: 0xbfe4ff,
  },
  alpha: {
    glyphA: 0.62, glyphB: 0.5, snippet: 0.55, line: 0.5, panel: 0.44, far: 0.16,
    grid: 0.24, wire: 0.22, mote: 0.5, shards: 0.92, threads: 0.65, shatterGlyphs: 0.78, motesS: 0.75,
  },

  /** motion envelopes over a — all windows, all monotone */
  weights: {
    veil: [0.02, 0.22], // Scene 4's black shell opens onto the shaft
    fog: [0.0, 0.5], // fog re-arms from the void's 6.8 m to full corridor depth
    densUp: [0.05, 0.5], // density climbs into the mid abyss
    org: [0.45, 0.95], // chaos → lattice
    chaosFade: [0.62, 1.0], // late: the noisy layers thin → visual room for the red line
  },
  densFloor: 0.35, // starting fraction of each system's budget
  fog: { color: 0x060d18, near: 3.4, far: 92 }, // to-values; from-values are READ from FALL.void_ so the a=0 boundary is continuous by construction
  exposure: 0.94, // tone-map exposure recovers toward this as the veil opens
  aim: { depth: 30, sway: 2.1 }, // corridor aim point, blended in by the veil weight

  /** small time-based life — material opacity ONLY, so every scroll stop freezes */
  motion: { flicker: 0.13, flickerHz: 1.9 },
  reduced: { flicker: 0 },

  /** generic generated fragments — no copyrighted code, no real client code */
  glyphsA: ['{', '}', '(', ')', '[', ']', '<', '/>', ';', '&&'],
  glyphsB: ['01', '10', '=>', '!=', '::', '0b', '#x', '+=', '%2', '?:'],
  snippets: [
    ['let weave = flow(t);', 'if (m > 0) {', '  return stack;', '}'],
    ['for (row of grid)', '  align(row, y);', 'end', '// …'],
    ['const flux = 0.5;', 'while (fall) {', '  order += 1;', '}'],
    ['bind(shape, data)', 'render(void)', '=> stream', '{ }'],
    ['fn absorb(s) {', '  s -> glyphs;', '  s -> light;', '}'],
    ['x = noise * (1-o);', 'o += smooth(t);', 'snap(x, grid);', 'return o;'],
  ],
  farSnippets: ['0110 1001 1110 //', '=> => => 0101', '{{(())}} ;; 10', 'fn() { fn() }'],
};

/* ───────────────────────── pure weight helpers (no side effects) ──────────── */

/** how far the artist has dissolved, from Scene 4's LOCAL p. 0 before the window. */
export const shatterAt = (p) => winW(clamp01(p), ABYSS.shatter.win);

/** everything Scene 5 applies, as a pure function of abyss-local a. */
export function abyssWeights(a) {
  const x = clamp01(a);
  return {
    a: x,
    scroll: x * ABYSS.travel,
    veil: winW(x, ABYSS.weights.veil),
    fogW: winW(x, ABYSS.weights.fog),
    dens: lerp(ABYSS.densFloor, 1, winW(x, ABYSS.weights.densUp)),
    org: winW(x, ABYSS.weights.org),
    chaos: 1 - 0.5 * winW(x, ABYSS.weights.chaosFade), // noisy-layer late thinning
  };
}

/* ───────────────────────────── deterministic helpers ──────────────────────── */

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** keep a value inside [−m, m) — the corridor world-wrap. Pure; reverses exactly. */
const wrapSigned = (x, m) => ((((x + m) % (2 * m)) + 2 * m) % (2 * m)) - m;

const hasDom = typeof document !== 'undefined';

function glyphTexture(chars, px = 72) {
  if (!hasDom) return null;
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const x = c.getContext('2d');
  const n = Math.ceil(Math.sqrt(chars.length));
  const cell = px / n;
  x.font = `${Math.round(cell * 0.6)}px ui-monospace, monospace`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.shadowColor = 'rgba(190,235,255,0.9)';
  x.shadowBlur = cell * 0.16;
  x.fillStyle = '#eaf6ff';
  for (let i = 0; i < chars.length; i++) x.fillText(chars[i], ((i % n) + 0.5) * cell, (((i / n) | 0) + 0.5) * cell);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function snippetTexture(lines, wPx = 256) {
  if (!hasDom) return null;
  const c = document.createElement('canvas');
  c.width = wPx;
  c.height = Math.round(wPx * 0.62);
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(9,18,32,0.5)';
  x.fillRect(0, 0, c.width, c.height);
  x.strokeStyle = 'rgba(150,205,255,0.5)';
  x.lineWidth = Math.max(1, wPx / 128);
  x.strokeRect(1, 1, c.width - 2, c.height - 2);
  x.font = `${Math.round(c.height / (lines.length + 1.6))}px ui-monospace, monospace`;
  x.fillStyle = 'rgba(205,226,255,0.92)';
  lines.forEach((l, i) => x.fillText(l, 12, (i + 1.35) * (c.height / (lines.length + 1))));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** material params spread — keeps `map` ABSENT headless (three warns on undefined) */
const mapParam = (t) => (t ? { map: t } : {});

function dotTexture(px = 48) {
  if (!hasDom) return null;
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(px / 2, px / 2, 0, px / 2, px / 2, px / 2);
  g.addColorStop(0, 'rgba(235,250,255,1)');
  g.addColorStop(0.35, 'rgba(160,220,255,0.55)');
  g.addColorStop(1, 'rgba(160,220,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, px, px);
  return new THREE.CanvasTexture(c);
}

/* ───────────────────────────── the layer ──────────────────────────────────── */

/**
 * @param {{ scene, camera, artist, map, renderer?, exposureBase?, veil?, reduced?, scale? }} ctx
 *   map is the scroll map (needs .a / .p). veil is Scene 4's shell mesh (optional —
 *   check-shot runs this headless, so every ctx handle must be safely optional).
 */
export function createAbyssLayer(ctx) {
  const scene = ctx.scene;
  const camera = ctx.camera;
  const artist = ctx.artist ?? null;
  const map = ctx.map;
  const reduced = !!ctx.reduced;
  const scale = ctx.scale ?? 1;
  const C = ABYSS.counts;
  const cnt = (n) => Math.max(6, Math.round(n * scale));

  const dummy = new THREE.Object3D();
  const tmpV = new THREE.Vector3();
  const tmpC = new THREE.Color();
  const rnd = mulberry32(20260915);

  /* ═════════════════ SHATTER — parented to artist.figure, pure in s ══════════ */
  const shatter = new THREE.Group();
  shatter.visible = false;
  const shardSeeds = [];
  const glyphSeeds = [];
  const threadSeeds = [];
  const moteSeeds = [];
  const figureMeshes = [];
  const meshThresh = [];
  let shards = null;
  let shGlyphA = null;
  let shGlyphB = null;
  let threads = null;
  let shardMotes = null;
  let tGeo = null;
  let mGeo = null;
  let gA = 0; // shatter glyph split: set kept out here so shatterFrame (outer scope) can read it

  if (artist?.figure) {
    artist.figure.updateMatrixWorld(true);
    const invFig = new THREE.Matrix4().copy(artist.figure.matrixWorld).invert();
    // sample real silhouette vertices in FIGURE-LOCAL space: the dissolve is built
    // from the actual body and rides every fall delta of the parent for free.
    const verts = [];
    artist.figure.traverse((o) => {
      if (o.isMesh && !o.userData.noShatter && o.geometry?.getAttribute('position')) {
        const isHead = o === artist.parts.head || o === artist.parts.skull || o === artist.parts.hair || o === artist.parts.beret || o === artist.parts.face;
        figureMeshes.push(o);
        meshThresh.push(isHead ? 0.6 + rnd() * 0.38 : ABYSS.shatter.meshFrom + rnd() * ABYSS.shatter.meshSpan);
        const pos = o.geometry.getAttribute('position');
        for (let i = 0; i < pos.count; i += 3) {
          tmpV.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).applyMatrix4(invFig);
          verts.push({ p: tmpV.clone(), c: o.material?.color ?? new THREE.Color(0x888888) });
        }
      }
    });
    const stride = Math.max(1, Math.floor(verts.length / ABYSS.shatter.shards));
    for (let i = 0; i < verts.length; i += stride) {
      const { p, c } = verts[i];
      shardSeeds.push({
        p: p.clone(),
        dir: p.clone().setY(p.y - 1.05).normalize(), // outward from a belt-line centre
        col: c.clone(),
        spin: (rnd() - 0.5) * 9,
        sz: ABYSS.shatter.size * (0.55 + rnd() * 1.1),
        th: ABYSS.shatter.meshFrom + rnd() * ABYSS.shatter.meshSpan, // per-shard blink stagger
        rot0: rnd() * 6.283,
      });
    }

    /* dark angular shards — one instanced mesh, per-instance colour */
    const shardMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: ABYSS.alpha.shards, fog: true });
    shards = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.62, 0.16), shardMat, shardSeeds.length);
    shardSeeds.forEach((sd, i) => {
      tmpC.copy(sd.col).lerp(new THREE.Color(ABYSS.colors.glyphA), ABYSS.shatter.glowMix);
      shards.setColorAt(i, tmpC);
    });
    shards.frustumCulled = false;
    shards.visible = false;

    /* glyph sprites — two billboarded instanced sets split from the shard points */
    const mkGlyphs = (tex, n, color) => {
      const im = new THREE.InstancedMesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ ...mapParam(tex), color, transparent: true, opacity: ABYSS.alpha.shatterGlyphs, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }),
        Math.max(1, n)
      );
      im.frustumCulled = false;
      im.visible = false;
      return im;
    };
    const gTexA = glyphTexture(ABYSS.glyphsA, ABYSS.glyphPx);
    const gTexB = glyphTexture(ABYSS.glyphsB, ABYSS.glyphPx);
    const gN = Math.round(ABYSS.shatter.glyphs * scale);
    gA = Math.ceil(gN / 2);
    shGlyphA = mkGlyphs(gTexA, gA, ABYSS.colors.glyphA);
    shGlyphB = mkGlyphs(gTexB, gN - gA, ABYSS.colors.glyphB);
    for (let i = 0; i < gN; i++) {
      const src = shardSeeds[i % shardSeeds.length];
      glyphSeeds.push({ p: src.p.clone(), dir: src.dir.clone(), dly: rnd() * 0.35, sz: 0.05 + rnd() * 0.085 });
    }

    /* thin data lines: each grows from a shard point along its axis */
    const tN = Math.round(ABYSS.shatter.threads * scale);
    for (let i = 0; i < tN; i++) {
      const src = shardSeeds[(i * 7) % shardSeeds.length];
      threadSeeds.push({ p: src.p.clone(), dir: src.dir.clone().add(tmpV.set(0, rnd() * 0.9 - 0.2, 0)).normalize(), len: 0.12 + rnd() * 0.5, dly: rnd() * 0.4 });
    }
    tGeo = new THREE.BufferGeometry();
    tGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tN * 6), 3));
    threads = new THREE.LineSegments(tGeo, new THREE.LineBasicMaterial({ color: ABYSS.colors.line, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    threads.frustumCulled = false;
    threads.visible = false;

    /* data motes: spiral toward the shaft axis — the "absorbed" read */
    const mN = Math.round(ABYSS.shatter.motes * scale);
    for (let i = 0; i < mN; i++) {
      const src = shardSeeds[(i * 5) % shardSeeds.length];
      moteSeeds.push({ p: src.p.clone(), dir: src.dir.clone(), dly: rnd() * 0.5, ph: rnd() * 6.283 });
    }
    mGeo = new THREE.BufferGeometry();
    mGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(mN * 3), 3));
    shardMotes = new THREE.Points(mGeo, new THREE.PointsMaterial({ color: ABYSS.colors.mote, size: 0.034, ...mapParam(dotTexture()), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    shardMotes.frustumCulled = false;
    shardMotes.visible = false;

    // the glow families render AFTER Scene 4's void veil (renderOrder 3) so the code
    // light punching out of the dissolving body stays readable while the shell closes;
    // the dark shards keep the default order and get swallowed — that asymmetry IS
    // the story: matter sinks into the dark, data rises out of it
    for (const o of [shGlyphA, shGlyphB, threads, shardMotes]) o.renderOrder = 6;
    shatter.add(shards, shGlyphA, shGlyphB, threads, shardMotes);
    artist.figure.add(shatter);
  }

  /** pure in s; also the ONLY writer of figure-mesh visibility while s > 0 */
  let lastS = -1;
  const shatterFrame = (s) => {
    if (s === lastS) return; // scroll stopped → nothing to redo (s is exact-equal stable)
    lastS = s;
    const on = s > 1e-6;
    shatter.visible = on;
    for (let i = 0; i < figureMeshes.length; i++) figureMeshes[i].visible = s <= meshThresh[i];
    if (!on || !shardSeeds.length) return;
    const e = s * s * (3 - 2 * s);
    const drift = ABYSS.shatter.drift * Math.pow(s, 1.55);
    for (let i = 0; i < shardSeeds.length; i++) {
      const sd = shardSeeds[i];
      const ai = clamp01(e - (sd.th - ABYSS.shatter.meshFrom) * 0.35); // staggered by its mesh's blink
      dummy.position.copy(sd.p).addScaledVector(sd.dir, drift * (0.35 + ai));
      dummy.rotation.set(sd.rot0 + sd.spin * e * 0.55, sd.rot0 * 0.7 + sd.spin * e * 0.8, sd.rot0 + e);
      dummy.scale.setScalar(sd.sz * (1.15 - 0.5 * e));
      dummy.updateMatrix();
      shards.setMatrixAt(i, dummy.matrix);
    }
    shards.instanceMatrix.needsUpdate = true;
    shards.visible = true;
    // billboard in FIGURE space: undo the figure's world rotation once per frame
    const figQ = artist.figure.getWorldQuaternion(new THREE.Quaternion()).invert();
    const camQ = camera.quaternion.clone().premultiply(figQ);
    let ia = 0;
    let ib = 0;
    for (let i = 0; i < glyphSeeds.length; i++) {
      const g = glyphSeeds[i];
      const gs = clamp01((s - g.dly) / (1 - g.dly));
      dummy.position.copy(g.p).addScaledVector(g.dir, drift * 0.8 * gs).add(tmpV.set(0, gs * 0.25, 0));
      dummy.quaternion.copy(camQ);
      dummy.scale.setScalar(g.sz * (0.75 + gs));
      dummy.updateMatrix();
      if (ia + ib < gA) shGlyphA.setMatrixAt(ia++, dummy.matrix);
      else if (ib < shGlyphB.count) shGlyphB.setMatrixAt(ib++, dummy.matrix);
    }
    shGlyphA.instanceMatrix.needsUpdate = true;
    shGlyphB.instanceMatrix.needsUpdate = true;
    shGlyphA.visible = ia > 0;
    shGlyphB.visible = ib > 0;
    const tp = tGeo.attributes.position.array;
    for (let i = 0; i < threadSeeds.length; i++) {
      const d = threadSeeds[i];
      const ts = clamp01((s - d.dly * 0.6) / (1 - d.dly * 0.6));
      const ox = d.p.x + d.dir.x * drift * 0.7 * ts;
      const oy = d.p.y + d.dir.y * drift * 0.7 * ts + 0.2 * ts;
      const oz = d.p.z + d.dir.z * drift * 0.7 * ts;
      const len = d.len * (0.25 + 1.4 * ts);
      tp.set([ox, oy, oz, ox + d.dir.x * len, oy + d.dir.y * len * 0.4, oz + d.dir.z * len], i * 6);
    }
    tGeo.attributes.position.needsUpdate = true;
    threads.material.opacity = ABYSS.alpha.threads * clamp01(s * 2.4) * (1 - 0.45 * e);
    threads.visible = true;
    const mp = mGeo.attributes.position.array;
    for (let i = 0; i < moteSeeds.length; i++) {
      const d = moteSeeds[i];
      const ms = clamp01((s - d.dly * 0.5) / (1 - d.dly * 0.5));
      const pull = ms * ms;
      mp[i * 3] = lerp(d.p.x, Math.sin(d.ph) * 0.4, pull) + d.dir.x * 0.18 * ms;
      mp[i * 3 + 1] = d.p.y + ms * 0.55 + Math.sin(d.ph + s * 4) * 0.02;
      mp[i * 3 + 2] = lerp(d.p.z, Math.cos(d.ph) * 0.4, pull) + d.dir.z * 0.18 * ms;
    }
    mGeo.attributes.position.needsUpdate = true;
    shardMotes.material.opacity = ABYSS.alpha.motesS * clamp01(s * 2);
    shardMotes.visible = true;
  };

  /* ═════════════════ ABYSS shaft — scene-level group, wraps around the camera ═ */
  const shaft = new THREE.Group();
  shaft.visible = false;
  if (scene) scene.add(shaft);

  const mkSeeds = (n, extra) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const base = { r: rnd(), th: rnd() * 6.283, y: (rnd() * 2 - 1) * ABYSS.band, v: lerp(ABYSS.chaos.vFrac[0], ABYSS.chaos.vFrac[1], rnd()), sz: 0.6 + rnd() * 0.8, col: i % ABYSS.lattice.columns, row: (i / ABYSS.lattice.columns) | 0, ring: i % ABYSS.lattice.rings };
      out.push(extra ? Object.assign(base, extra(i, rnd)) : base);
    }
    return out;
  };
  /** camera-relative base y → world y for this frame: content falls with the camera,
   *  and rise share v makes it drift UP relative to it → the fall-through read. */
  const wrapY = (yBaseRel, scroll, vFrac, camY) => camY + wrapSigned(yBaseRel + scroll * vFrac, ABYSS.band);
  const chaosXZ = (c) => {
    const [r0, r1] = ABYSS.chaos.radius;
    const r = lerp(r0, r1, c.r);
    return [Math.cos(c.th) * r, Math.sin(c.th) * r];
  };
  const orderXZ = (col, ring) => {
    const lat = ABYSS.lattice;
    const a2 = (col / lat.columns) * Math.PI * 2 + (ring % 3) * 0.35;
    const r = lerp(lat.radius[0], lat.radius[1], ring / Math.max(1, lat.rings - 1));
    return [Math.cos(a2) * r, Math.sin(a2) * r];
  };

  /* glyph streams — 3 instanced sets (braces, binary-like, tiny snippets) */
  const setTex = [glyphTexture(ABYSS.glyphsA, ABYSS.glyphPx), glyphTexture(ABYSS.glyphsB, ABYSS.glyphPx), snippetTexture(ABYSS.snippets[0], 128)];
  const setCols = [ABYSS.colors.glyphA, ABYSS.colors.glyphB, ABYSS.colors.snippet];
  const setAlphas = [ABYSS.alpha.glyphA, ABYSS.alpha.glyphB, ABYSS.alpha.snippet];
  const streamSets = C.streams.map((n, k) => {
    const count = cnt(n);
    const im = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ ...mapParam(setTex[k]), color: setCols[k], transparent: true, opacity: setAlphas[k], blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      count
    );
    im.frustumCulled = false;
    im.visible = false;
    const seeds = mkSeeds(count, (i) => ({ cell: i % ABYSS.lattice.columns, jit: rnd() * 2 - 1 }));
    shaft.add(im);
    return { im, seeds, count, k };
  });

  /* thin data lines */
  const linesN = cnt(C.lines);
  const linePos = new Float32Array(linesN * 6);
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
  const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: ABYSS.colors.line, transparent: true, opacity: ABYSS.alpha.line, blending: THREE.AdditiveBlending, depthWrite: false, fog: true }));
  lines.frustumCulled = false;
  const lineSeeds = mkSeeds(linesN, () => ({ ang: rnd() * 6.283, tilt: rnd() * 6.283 }));
  shaft.add(lines);

  /* pseudo-code panels — 6 textures, instanced, shared seeds round-robin */
  const panelCount = cnt(C.panels);
  const panelPer = Math.ceil(panelCount / ABYSS.snippets.length);
  const panelMeshes = ABYSS.snippets.map((lines2, t) => {
    const im = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1.15, 0.72),
      new THREE.MeshBasicMaterial({ ...mapParam(snippetTexture(lines2, 256)), color: ABYSS.colors.panel, transparent: true, opacity: ABYSS.alpha.panel, side: THREE.DoubleSide, depthWrite: false }),
      panelPer
    );
    im.frustumCulled = false;
    im.visible = false;
    shaft.add(im);
    return im;
  });
  const panelSeeds = mkSeeds(panelCount);

  /* distant code layers — huge dim panels, slow parallax, heavy fog = depth */
  const farCount = cnt(C.far);
  const farMesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(11, 6.8),
    new THREE.MeshBasicMaterial({ ...mapParam(snippetTexture(ABYSS.farSnippets, 256)), color: ABYSS.colors.far, transparent: true, opacity: ABYSS.alpha.far, side: THREE.DoubleSide, depthWrite: false }),
    farCount
  );
  farMesh.frustumCulled = false;
  farMesh.visible = false;
  const farSeeds = mkSeeds(farCount);
  shaft.add(farMesh);

  /* grid fragments — instanced flat tiles whose LINES are baked locally (unit size) */
  const gridCount = cnt(C.grids);
  const gridLocal = [];
  for (let i = 0; i <= 4; i++) {
    const o = (i / 4 - 0.5);
    gridLocal.push(-0.5, 0, o, 0.5, 0, o, o, 0, -0.5, o, 0, 0.5);
  }
  const gridGeo = new THREE.BufferGeometry();
  gridGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(gridLocal.length * gridCount), 3));
  const grids = new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({ color: ABYSS.colors.grid, transparent: true, opacity: ABYSS.alpha.grid, depthWrite: false, fog: true }));
  grids.frustumCulled = false;
  const gridSeeds = mkSeeds(gridCount, () => ({ rx: rnd() * 6.283, rz: rnd() * 6.283, s2: 3 + rnd() * 4, y: (rnd() * 2 - 1) * ABYSS.band, v: 0.1 + rnd() * 0.4 }));
  shaft.add(grids);

  /* wireframe structures — same one-object trick, cubes baked unit */
  const wireCount = cnt(C.wires);
  const cubeE = 0.5;
  const cBox = [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1], [-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]].map((v) => v.map((n2) => n2 * cubeE));
  const cubeEdges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  const wireLocal = [];
  for (const [a2, b2] of cubeEdges) wireLocal.push(...cBox[a2], ...cBox[b2]);
  const wireGeo = new THREE.BufferGeometry();
  wireGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(wireLocal.length * wireCount), 3));
  const wires = new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({ color: ABYSS.colors.wire, transparent: true, opacity: ABYSS.alpha.wire, depthWrite: false, fog: true }));
  wires.frustumCulled = false;
  const wireSeeds = mkSeeds(wireCount, () => ({ s2: 0.9 + rnd() * 2.6, ph: rnd() * 6.283 }));
  shaft.add(wires);

  /* ambient motes */
  const moteCount = cnt(C.motes);
  const motePos = new Float32Array(moteCount * 3);
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const moteMat = new THREE.PointsMaterial({ color: ABYSS.colors.mote, size: 0.055, ...mapParam(dotTexture(64)), transparent: true, opacity: ABYSS.alpha.mote, blending: THREE.AdditiveBlending, depthWrite: false, fog: true });
  const motes = new THREE.Points(moteGeo, moteMat);
  motes.frustumCulled = false;
  motes.visible = false;
  const moteSeeds2 = mkSeeds(moteCount);
  shaft.add(motes);

  const gridBase = Float32Array.from(gridLocal);
  const wireBase = Float32Array.from(wireLocal);

  /** full shaft write — only runs when a actually moved (or on activation) */
  const shaftFrame = (w) => {
    const { scroll, org, dens, chaos: chaosW, a } = w;
    const camY = camera.position.y; // camera is already displaced by scroll (we wrote it first)
    const swirl = (1 - org) * 0.85 * Math.sin(scroll * 0.11 + 1.3); // violent lateral sway, fades with order
    /* glyph streams */
    for (const set of streamSets) {
      const vis = Math.round(set.count * dens);
      set.im.count = vis;
      set.im.visible = vis > 0;
      if (!set.im.visible) continue;
      for (let i = 0; i < vis; i++) {
        const c = set.seeds[i];
        const cx = chaosXZ(c);
        const ox = orderXZ(c.cell, c.ring);
        const x = lerp(cx[0], ox[0], org) + swirl * Math.sin(c.th);
        const z = lerp(cx[1], ox[1], org) + swirl * Math.cos(c.th);
        // ordered: stack glyphs down each lattice column (tight spacing); chaos: free-float
        const y = wrapY(lerp(c.y, ((i * 13) % 24) * 0.62 - 7.4, org), scroll, c.v, camY);
        dummy.position.set(x, y, z);
        dummy.quaternion.copy(camera.quaternion);
        dummy.rotateZ((1 - org) * c.jit); // jitter-roll aligns away once organised
        dummy.scale.setScalar(c.sz * lerp(0.32, 0.42, org) * (1 + c.r * 0.3));
        dummy.updateMatrix();
        set.im.setMatrixAt(i, dummy.matrix);
      }
      set.im.instanceMatrix.needsUpdate = true;
    }
    /* data lines: short & slanted → long & vertical on the lattice */
    const lp = lineGeo.attributes.position.array;
    const linesVis = Math.round(linesN * dens);
    lineGeo.setDrawRange(0, linesVis * 2);
    for (let i = 0; i < linesVis; i++) {
      const c = lineSeeds[i];
      const len = lerp(0.45, 6.5, org);
      const cx = chaosXZ(c);
      const ox = orderXZ(c.col, c.ring);
      const x = lerp(cx[0], ox[0], org);
      const z = lerp(cx[1], ox[1], org);
      const y = wrapY(c.y, scroll, c.v, camY);
      const jx = (1 - org) * Math.cos(c.ang) * len * 0.8;
      const jz = (1 - org) * Math.sin(c.ang) * len * 0.8;
      const jy = (1 - org) * Math.sin(c.tilt) * len * 0.4;
      lp[i * 6] = x + jx;
      lp[i * 6 + 1] = y - len / 2;
      lp[i * 6 + 2] = z + jz;
      lp[i * 6 + 3] = x - jx;
      lp[i * 6 + 4] = y + len / 2 + jy;
      lp[i * 6 + 5] = z - jz;
    }
    lineGeo.attributes.position.needsUpdate = true;
    /* panels: camera-facing rows when ordered, tumbled plates when chaotic */
    let pi = 0;
    for (const pm of panelMeshes) {
      const vis = Math.max(0, Math.min(pm.count, Math.round(panelPer * dens)));
      pm.count = vis;
      pm.visible = vis > 0;
      if (!pm.visible) continue;
      for (let i = 0; i < vis; i++) {
        const seed = panelSeeds[pi++ % panelSeeds.length];
        const cx = chaosXZ(seed);
        const ox = orderXZ(seed.col, seed.ring);
        const x = lerp(cx[0], ox[0], org);
        const z = lerp(cx[1], ox[1], org);
        // ordered: snap to the lattice row grid so panels read as ALIGNED SHelves
        const y = wrapY(lerp(seed.y, Math.round(seed.y / ABYSS.lattice.radius[0]) * ABYSS.lattice.radius[0], org), scroll, 0.16 + seed.v * 0.2, camY);
        dummy.position.set(x, y, z);
        dummy.rotation.set((1 - org) * seed.th * 1.8, (1 - org) * seed.y * 0.35 + org * Math.atan2(-x, -z), (1 - org) * seed.sz);
        dummy.scale.setScalar(0.85 + seed.sz * 0.7);
        dummy.updateMatrix();
        pm.setMatrixAt(i, dummy.matrix);
      }
      pm.instanceMatrix.needsUpdate = true;
    }
    /* far layers: big dim planes, slow parallax, heavy fog */
    for (let i = 0; i < farCount; i++) {
      const c = farSeeds[i];
      const r = lerp(lerp(22, 33, c.r), ABYSS.lattice.radius[1] + 15, org * 0.5);
      const th = c.th + (1 - org) * Math.sin(scroll * 0.05 + c.ph) * 0.15 + org * (Math.round((c.th / (Math.PI * 2)) * 12) / 12 * Math.PI * 2 - c.th) * 0.6;
      dummy.position.set(Math.cos(th) * r, wrapY(c.y, scroll, 0.06 + c.v * 0.1, camY), Math.sin(th) * r);
      dummy.lookAt(0, dummy.position.y, 0);
      dummy.scale.setScalar(1 + c.sz * 0.5);
      dummy.updateMatrix();
      farMesh.setMatrixAt(i, dummy.matrix);
    }
    farMesh.instanceMatrix.needsUpdate = true;
    farMesh.visible = true;
    /* grids: per-tile transforms written into the line buffer (chaos tilt → flat ring) */
    const gp = grids.geometry.attributes.position;
    const garr = gp.array;
    for (let t = 0; t < gridSeeds.length; t++) {
      const c = gridSeeds[t];
      const ox = orderXZ(c.col, c.ring);
      const cx = chaosXZ(c);
      const x = lerp(cx[0], ox[0], org);
      const z = lerp(cx[1], ox[1], org);
      const y = wrapY(c.y, scroll, c.v, camY);
      const s2 = lerp(c.s2, 5.4, org);
      const base = t * gridLocal.length; // tile verts are contiguous per tile, same local layout
      dummy.position.set(0, 0, 0);
      dummy.quaternion.identity();
      dummy.rotation.set((1 - org) * c.rx, c.th, (1 - org) * c.rz);
      dummy.updateMatrix();
      const rot = org < 0.999 ? dummy.matrix : null; // fully ordered: flat, axis-aligned tiles
      for (let v = 0; v < gridLocal.length; v += 3) {
        const vx = gridBase[v] * s2;
        const vz = gridBase[v + 2] * s2;
        if (rot) {
          tmpV.set(vx, 0, vz).applyMatrix4(rot);
          garr[base + v] = x + tmpV.x;
          garr[base + v + 1] = y + tmpV.y;
          garr[base + v + 2] = z + tmpV.z;
        } else {
          garr[base + v] = x + vx;
          garr[base + v + 1] = y;
          garr[base + v + 2] = z + vz;
        }
      }
    }
    gp.needsUpdate = true;
    gridGeo.setDrawRange(0, gridCount * (gridLocal.length / 3));
    grids.visible = gridCount > 0;
    /* wires: cubes, same per-instance trick, tumbles fade to axis-alignment */
    const wp = wires.geometry.attributes.position;
    const warr = wp.array;
    for (let t = 0; t < wireSeeds.length; t++) {
      const c = wireSeeds[t];
      const cx = chaosXZ(c);
      const ox = orderXZ(c.col, (c.ring + 1) % ABYSS.lattice.rings);
      const x = lerp(cx[0] * 0.7, ox[0], org);
      const z = lerp(cx[1] * 0.7, ox[1], org);
      const y = wrapY(c.y * 0.7, scroll, c.v * 0.7, camY);
      const spin = (1 - org) * (scroll * 0.02 + c.ph);
      dummy.position.set(0, 0, 0);
      dummy.quaternion.identity();
      dummy.rotation.set((1 - org) * spin * 0.7, c.th + spin, 0);
      dummy.updateMatrix();
      for (let v = 0; v < wireLocal.length; v += 3) {
        tmpV.set(wireBase[v] * c.s2, wireBase[v + 1] * c.s2, wireBase[v + 2] * c.s2).applyMatrix4(dummy.matrix);
        const o2 = t * wireLocal.length + v;
        warr[o2] = x + tmpV.x;
        warr[o2 + 1] = y + tmpV.y;
        warr[o2 + 2] = z + tmpV.z;
      }
    }
    wp.needsUpdate = true;
    wireGeo.setDrawRange(0, wireCount * (wireLocal.length / 3));
    wires.visible = true;
    /* ambient motes */
    const mp = moteGeo.attributes.position.array;
    const mv = Math.round(moteCount * dens * (1 - 0.35 * org));
    moteGeo.setDrawRange(0, mv);
    for (let i = 0; i < mv; i++) {
      const c = moteSeeds2[i];
      const r = lerp(1.2 + c.r * 19, lerp(4, ABYSS.lattice.radius[1], c.sz), org);
      const th = c.th + swirl * 0.05 * (1 - org) + org * (Math.round((c.th / (Math.PI * 2)) * 24) / 24 * Math.PI * 2 - c.th) * 0.8;
      mp[i * 3] = Math.cos(th) * r;
      mp[i * 3 + 1] = wrapY(c.y, scroll, c.v, camY);
      mp[i * 3 + 2] = Math.sin(th) * r;
    }
    moteGeo.attributes.position.needsUpdate = true;
    motes.visible = mv > 0;
    /* ── material-level life: density, late-abysis noise thinning, flicker ── */
    const flick = reduced ? ABYSS.reduced.flicker : ABYSS.motion.flicker;
    for (const set of streamSets) {
      const base = setAlphas[set.k];
      set.im.material.opacity = base * (0.55 + 0.45 * dens) * (1 - 0.25 * org) * (flick > 0 ? 1 + flick * Math.sin(tState * ABYSS.motion.flickerHz + set.k * 2.1) : 1);
    }
    lines.material.opacity = ABYSS.alpha.line * (0.4 + 0.6 * dens) * chaosW;
    for (const pm of panelMeshes) pm.material.opacity = ABYSS.alpha.panel * (0.5 + 0.5 * dens) * (1 - 0.25 * org);
    farMesh.material.opacity = ABYSS.alpha.far * (0.5 + 0.5 * dens);
    grids.material.opacity = ABYSS.alpha.grid * (0.4 + 0.6 * dens) * (1 - 0.3 * org) * chaosW;
    wires.material.opacity = ABYSS.alpha.wire * (0.35 + 0.65 * dens) * (1 - 0.45 * org) * chaosW;
    moteMat.opacity = ABYSS.alpha.mote * dens * (1 - 0.35 * org);
  };
  const tState = { v: 0 }; // flicker clock (opacity only) — positions never read it

  /* boundary values READ from Scene 4's config, so a = 0 is continuous by construction */
  const voidEnd = {
    veil: FALL.void_.veil.opacity,
    fogNear: FALL.void_.fog.near,
    fogFar: FALL.void_.fog.far,
    fogColor: new THREE.Color(FALL.void_.fog.color),
    exposure: 1 - FALL.void_.exposure.amount,
  };
  const fogTo = new THREE.Color(ABYSS.fog.color);

  let last = { a: -1, active: false };
  let s5last = null;

  const layer = {
    get group() {
      return shaft;
    },
    get shatterGroup() {
      return shatter;
    },
    get last() {
      return s5last;
    },
    weights: (a) => abyssWeights(a),
    shatterAt: (p) => shatterAt(p),
    /**
     * @param {number} dampedT01 the DAMPED total pin progress — main.js passes the
     *   SAME value Scene 4 renders (fall.cur), so shatter/abyss can never disagree
     *   with the fall.
     * @param {number} time seconds — opacity flicker only
     */
    update(dampedT01, time = 0) {
      tState.v = time;
      const a = map.a(dampedT01);
      const s = shatterAt(map.p(dampedT01));
      const w = abyssWeights(a);
      s5last = { a, s, w };
      shatterFrame(s);
      if (a <= 1e-6) {
        if (last.active) {
          shaft.visible = false;
          last = { a: -1, active: false };
        }
        return { a: 0, s, w };
      }
      last.active = true;
      shaft.visible = true;
      const moved = Math.abs(a - last.a) > 1e-7;
      /* fall through: Scene 4 latched at p = 1; the abyss extends the descent */
      camera.position.y -= w.scroll;
      // heavy rewrite ONLY when a actually moved — at a scroll stop the frame is
      // frozen, so every stop resolves to ONE deterministic image
      if (moved) {
        shaftFrame(w);
        last.a = a;
      }
      /* veil opens, fog re-arms, exposure recovers — all gated by veil weight,
         each exactly Scene 4's own end value at a → 0+ */
      if (ctx.veil) ctx.veil.material.opacity = voidEnd.veil * (1 - w.veil);
      if (scene?.fog) {
        scene.fog.color.copy(voidEnd.fogColor).lerp(fogTo, w.fogW);
        scene.fog.near = lerp(voidEnd.fogNear, ABYSS.fog.near, w.fogW);
        scene.fog.far = lerp(voidEnd.fogFar, ABYSS.fog.far, w.fogW);
      }
      if (ctx.renderer) ctx.renderer.toneMappingExposure = (ctx.exposureBase ?? 1) * lerp(voidEnd.exposure, ABYSS.exposure, w.veil);
      /* aim: Scene 4 rewrites lookAt/roll from its own fresh state every frame, so
         blending here is pure, never cumulative. Blend toward the shaft vanishing
         point as the veil opens. */
      const aimW = w.veil * 0.85;
      if (aimW > 0.002) {
        const q0 = camera.quaternion.clone();
        tmpV.set(Math.sin(w.a * 3.1) * ABYSS.aim.sway, camera.position.y - ABYSS.aim.depth, Math.cos(w.a * 2.4) * ABYSS.aim.sway * 0.6);
        camera.lookAt(tmpV);
        camera.quaternion.slerpQuaternions(q0, camera.quaternion, aimW);
      }
      return { a, s, w };
    },
    /** headless settle helper: a is already instantaneous (damping lives in Scene 4) */
    settle(dampedT01, time = 0) {
      return this.update(dampedT01, time);
    },
  };
  return layer;
}
