/* =============================================================================
 *  SCROLL-DRIVEN CINEMATIC HERO — Scenes 1, 2, 3 and 4
 *  One pinned section, one scroll, one camera move, four beats:
 *    Scene 1  extreme close-up on the back of a painter's head/shoulder (no face)
 *    Scene 2  orbit + zoom-out settling beside him, side-profile against the easel
 *    Scene 3  a light appears over the canvas at the END of the SAME move — on its own
 *             2400px story budget: it sits, he turns (~40°), he steps and reaches before anything falls
 *    Scene 4  the fall: the floor breaks open under him and the camera plunges after
 *             him; Scene 5/6  he shatters into code on the way down and the scroll
 *             keeps falling through a procedural coding abyss that organises itself
 *  The pin now scrolls reveal(2108px) + story(2400px) + fall(2200px) = 6708px.
 *  A single piecewise map (scene4.js buildScrollMap) turns the pin into heroT and
 *  fall-local p: Scenes 1–2 run at their ORIGINAL 1/3400 px slope until the side
 *  view settles, Scene 3's beat then owns a stretched 2400px budget so the star,
 *  the turn and the reach are visible on a phone, and Scene 4 keeps its 2200px.
 *  Scene 4 only POST-PASSES on top (see src/scene4.js) — camera-path.js is
 *  untouched by design.
 *  Scrolling up reverses all of it (GSAP scrub + damping in the render loop).
 *
 *  ── RUN ────────────────────────────────────────────────────────────────────
 *    npm install
 *    npm run dev            # vite, on http://localhost:5173
 *    npm run check          # headless framing/timing assertions, no browser needed
 *    npm run build          # static bundle in ./dist
 *    npm run preview        # serve the build
 *  Append ?debug to the URL → trajectories drawn in the scene + a t / azimuth /
 *  distance / FOV readout and the Scene-3 beats (star, notice, reach, step, stroke).
 *  window.__hero exposes { state, rig, camera, scene, PATH, MARKS, STAR, SCENE3,
 *  star, artist, measureScene3, tween, ScrollTrigger } for live poking.
 *
 *  ── FILES ───────────────────────────────────────────────────────────────────
 *    src/main.js         renderer, lights, ground, GSAP ScrollTrigger wiring, loop
 *    src/camera-path.js  the camera trajectory, the lookAt trajectory, lens, roll
 *    src/artist.js       the figure (lofted primitives), the easel, props, idle anim
 *    src/loft.js         the two geometry helpers that build organic forms from rings
 *    src/star.js         Scene 3's light: crystal core, halo, flare, point light, dust
 *    src/scene3.js       the Scene-3 timing map: when the star, the notice, the reach
 *    src/style.css       fullscreen canvas, 100vh pinned section, scroll length
 *
 *  ── WHAT TO TWEAK ───────────────────────────────────────────────────────────
 *  1. THE CAMERA CURVE → src/camera-path.js  (CAMERA_KEYS / TARGET_KEYS / FOV_KEYS).
 *       UNCHANGED by Scene 3, deliberately: the new beats are mapped onto the tail of
 *       the same normalised t, so the pin, the scrub and the timing are untouched.
 *  2. SCROLL LENGTH → src/style.css `--reveal-scroll` + `--story-scroll` + `--fall-scroll`
 *     (2108 + 2400 + 2200px desktop), read by main.js and composed by scene4.js buildScrollMap.
 *     Scenes 1–2 keep the exact 1/3400 px slope below 2108 — never retime that segment casually.
 *  3. WHEN SCENE 3 HAPPENS → `SCENE3` in src/scene3.js: appear / notice / reach are
 *       [start, end] windows of t. Everything else (fade, head turn, frozen brush,
 *       step distance) is a pure function of that map, so scrolling back is exact.
 *  4. THE STAR → `STAR` in src/star.js: position, size, colours, halo/flare scale,
 *       point-light intensity, pulse. Its position was solved against the END frame —
 *       if you move it, re-run `npm run check` (it asserts the star stays in frame and
 *       inside his cone of attention).
 *  5. HIS REACTION → the weights inside Artist.update() in src/artist.js (how much of
 *       the head/chest/hips turn toward the light, how still the brush goes) and
 *       POSE / IDLE / MARKS.easel at the top of that file for the stance and the easel.
 *
 *  Still out of scope, on purpose: the fall, the abyss / code tunnel, projects.
 * ========================================================================== */

import * as THREE from 'three';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { createArtist, MARKS } from './artist.js';
import { createCameraRig, PATH } from './camera-path.js';
import { createStar, STAR } from './star.js';
import { measureScene3, SCENE3 } from './scene3.js';
import { createFallLayer, FALL, buildScrollMap } from './scene4.js';
import { createAbyssLayer, ABYSS } from './scene5.js';
import './style.css';

gsap.registerPlugin(ScrollTrigger);
// Mobile fix for the whole-screen shake while scrolling: iOS/Android resize the visible
// viewport as the address bar hides/shows mid-scroll, which was re-triggering ScrollTrigger's
// layout refresh and yanking the pin. This only smooths the SCROLL MECHANISM — it doesn't touch
// FALL/FALL_POSE in scene4.js, so the fall itself stays exactly as rough as it's tuned to be.
ScrollTrigger.config({ ignoreMobileResize: true });
ScrollTrigger.normalizeScroll(true);

/* ───────────────────────────── config ───────────────────────────── */

const CONFIG = {
  /** seconds ScrollTrigger takes to catch up to the scrollbar (0 = 1:1, no inertia) */
  scrub: 1.15,
  /** tone-mapping / grade */
  exposure: 1.06,
  clearColor: 0x000000, // keep 0 alpha so the CSS gradient in style.css is the fallback sky
  fog: { color: 0x101724, near: 2.6, far: 15.0 }, // == the sky dome's horizon colour, so the floor melts into the sky
  maxPixelRatio: 2,
};

const hero = document.getElementById('hero');
const cssNumber = (name, fallback) => {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isFinite(v) ? v : fallback;
};
/** single source of truth for how far you scroll: --reveal-scroll + --story-scroll +
 *  --fall-scroll + --abyss-scroll in style.css. The reveal budget runs Scenes 1–2 at
 *  exactly the old pixels (2108 px = the old heroT 0→0.62 of a 3400 px budget); Scene
 *  3's beat gets a dedicated stretch budget; Scene 4 keeps its own; and the abyss
 *  travel is APPENDED — adding it cannot move any earlier frame, because every segment
 *  of the map is defined by pixels. buildScrollMap wires all four. */
const revealScroll = cssNumber('--reveal-scroll', 2108);
const storyScroll = cssNumber('--story-scroll', 2400);
const fallScroll = cssNumber('--fall-scroll', 2200);
const abyssScroll = cssNumber('--abyss-scroll', 2800);
const storyMap = buildScrollMap({
  revealPx: revealScroll,
  storyPx: storyScroll,
  fallPx: fallScroll,
  abyssPx: abyssScroll, // Scenes 5–6's travel
  revealEndT: SCENE3.appear[0], // the reveal ends exactly where Scene 3's star window opens
});
const scrollLength = storyMap.totalPx; // the pin is one section: reveal + story + fall
const heroSplit = (revealScroll + storyScroll) / scrollLength; // legacy label: hero-likes end of the map
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
if (reducedMotion) {
  PATH.float.amp = 0; // no handheld drift; the scroll-driven move still works
  PATH.damping = 10;
  FALL.camera.shake.pos *= 0.35; // the fall lurch keeps its punch, the jitter does not
  FALL.camera.shake.rot *= 0.35;
  FALL.camera.roll.kick *= 0.4;
}

/* ───────────────────────────── renderer ──────────────────────────── */

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, CONFIG.maxPixelRatio));
renderer.setSize(hero.clientWidth, hero.clientHeight, false);
renderer.setClearColor(CONFIG.clearColor, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = CONFIG.exposure;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoft was removed from three r18x
hero.appendChild(renderer.domElement); // lives inside #hero so transform-pinning carries it

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(CONFIG.fog.color, CONFIG.fog.near, CONFIG.fog.far);

/** In-scene haze instead of a CSS-only background: the ground fades into the exact
 *  colour of the sky at the horizon, so there is no hard seam to give the shot away. */
function createSky() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256); // row 0 = zenith … row 255 = nadir
  g.addColorStop(0, '#03040a'); // zenith
  g.addColorStop(0.3, '#070b13');
  g.addColorStop(0.44, '#16203a');
  g.addColorStop(0.492, '#1d2b46'); // the glow, sitting just above the horizon
  g.addColorStop(0.508, '#101724'); // horizon — exactly the fog colour, so no seam
  g.addColorStop(1, '#0c1119');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(46, 32, 24),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: true })
  );
  sky.renderOrder = -1;
  return sky;
}
scene.add(createSky());

const camera = new THREE.PerspectiveCamera(30, hero.clientWidth / hero.clientHeight, 0.03, 60);
camera.position.set(0, 1.7, -0.85); // overwritten on the first frame

/* ───────────────────────────── light: dark room, one window ──────── */
/* Ambient + directional is the brief; the extra rim + canvas bounce is what makes
   the silhouette read instead of becoming a flat black blob. */

// the hemisphere's ground colour is what keeps his legs off a black floor
scene.add(new THREE.HemisphereLight(0x2c3a55, 0x101826, 0.7));

const key = new THREE.DirectionalLight(0xbcd2ff, 1.5); // cool, from high front-left (kept low:
key.castShadow = true;                                   // his face should stay unreadable)
key.position.set(-3.4, 4.6, 5.2);
key.target.position.set(0, 1.2, 0.2);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.near = 1;
key.shadow.camera.far = 16;
key.shadow.camera.left = -3;
key.shadow.camera.right = 3;
key.shadow.camera.top = 3;
key.shadow.camera.bottom = -2;
key.shadow.bias = -0.0016;
key.shadow.radius = 3;
scene.add(key, key.target);

// double rim: two cool edge lights from behind, one each side, so the silhouette is drawn
// in light instead of painted black on black. This is the single most important setting
// for "reads as human" at these exposure levels.
const rim = new THREE.DirectionalLight(0xa8c8ff, 2.9);
rim.position.set(1.9, 2.7, -3.4);
const rim2 = new THREE.DirectionalLight(0x7fa6e8, 1.35);
rim2.position.set(-2.9, 1.5, -2.9);
scene.add(rim, rim2);

const bounce = new THREE.DirectionalLight(0xffd9a8, 0.55); // warm spill off the easel
bounce.position.set(2.6, 1.4, 4.4);
scene.add(bounce);

// a dim wash on the floor behind him: enough to separate the silhouette from the dark
const wash = new THREE.SpotLight(0x35507f, 22, 9, 0.72, 1, 1.5);
wash.position.set(0.2, 2.9, -2.3);
wash.target.position.set(0, 0, -0.35);
scene.add(wash, wash.target);

const canvasGlow = new THREE.PointLight(0xffc27a, 6, 3.4, 2); // light "leaking" off the canvas
canvasGlow.position.set(MARKS.canvas.x - 0.05, MARKS.canvas.y + 0.18, MARKS.canvas.z + 0.22);
scene.add(canvasGlow);
const baseGlow = canvasGlow.intensity;

/* ───────────────────────────── ground ─────────────────────────────── */
/* Scene 4 needed a floor that can break, so the disc now lives in scene4.js as two
   flush half-discs — same radius/segments/material as the old single disc, so Scenes 1–3
   render identically (the seam is sub-pixel); `openW` pries them apart and hinges them
   down. No floor shadows either before or after: props are grounded by soft blobs in
   artist.js, and a shadow-receiving floor would print the key light's ortho frustum on it. */

/* ───────────────────────────── the actor ─────────────────────────── */

const artist = createArtist();
scene.add(artist.group);

/* Scene 3: the light he notices. It lives in the world (not on the camera) so it is
   occluded, lit and reversed by the same scroll that drives everything else.
   No postprocessing pass — the halos are additive sprites, which is the cheapest way to
   fake bloom on mobile. If you want real bloom later, add EffectComposer +
   UnrealBloomPass(threshold ~0.9, strength ~0.35) around renderer.render() below and give
   the core `layers.enable(1)`. */
const star = createStar();
scene.add(star.group);

/* ───────────────────────────── scroll → t ────────────────────────── */

const state = { t: 0 }; // GSAP writes this; the render loop reads it. Nothing else touches the camera.
const rig = createCameraRig(camera);
rig.update(0, 1 / 60); // place the camera before the first paint (no flash of the wrong shot)

/* Scene 4: the fall. Its layer owns the split floor (see the ground note above), the
   debris, the void veil — and post-passes camera/artist/star/light changes that are
   pure functions of its own damped local progress p. No second pin, no second tween. */
const fall = createFallLayer({
  scene,
  camera,
  renderer,
  artist,
  star,
  split: heroSplit,
  toP: storyMap.p, // the fall reads p straight off the budget map
  lights: { key, rim, rim2, bounce, wash, canvasGlow },
});
/* Scenes 5–6: the shatter + the coding abyss. The layer reads the SAME damped pin
   value the fall renders (fall.cur), so the dissolve can never disagree with the
   fall, and it writes exactly nothing while its a = 0 (see src/scene5.js). */
const abyss = createAbyssLayer({
  scene,
  camera,
  renderer,
  artist,
  map: storyMap,
  veil: fall.veil,
  exposureBase: CONFIG.exposure,
  reduced: reducedMotion,
  scale: innerWidth < 700 ? ABYSS.mobileScale : 1,
});

const tween = gsap.to(state, {
  t: 1,
  ease: 'none',
  scrollTrigger: {
    trigger: '#hero',
    start: 'top top',
    end: () => `+=${scrollLength}`, // 1:1 with the three CSS budgets summed
    pin: true,
    pinType: 'transform',
    anticipatePin: 1,
    scrub: CONFIG.scrub,
    invalidateOnRefresh: true,
  },
});

/* ───────────────────────────── optional debug ────────────────────── */

const debug = new URLSearchParams(location.search).has('debug');
let readout;
let markerStar, markerHand, markerTip; // ?debug-only: depth-proof reticles, absent from the default build
if (debug) {
  // Three markers that answer the three questions the preview raised:
  //   star  → is the light in frame and on top? (ring + cross at star.group.position)
  //   hand  → does it actually travel at the star? (dots on the brush hand + tip)
  // All are Mesh/Sprite with depthTest:false, fog:false, toneMapped:false and a loud
  // flat colour, so if one of THEM is ever not visible, the geometry or frustum is the
  // culprit — not the star's own material. Removed automatically when ?debug is absent.
  const reticle = (color, size) => {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(size, size * 1.35, 28),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthTest: false, fog: false, toneMapped: false, side: THREE.DoubleSide })
    );
    const dot = new THREE.Mesh(
      new THREE.CircleGeometry(size * 0.34, 16),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, depthTest: false, fog: false, toneMapped: false, side: THREE.DoubleSide })
    );
    g.add(ring, dot);
    g.renderOrder = 12;
    g.frustumCulled = false;
    return g;
  };
  markerStar = reticle(0xff2fd6, 0.045);
  markerHand = reticle(0x35e0ff, 0.02);
  markerTip = reticle(0x7dff6a, 0.015);
  scene.add(markerStar, markerHand, markerTip);

  const pts = rig.cameraCurve.getPoints(160);
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0x35e0ff, transparent: true, opacity: 0.5 })
  );
  scene.add(line);
  scene.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(rig.targetCurve.getPoints(80)),
    new THREE.LineBasicMaterial({ color: 0xff5ea8, transparent: true, opacity: 0.45 })
  ));
  readout = document.createElement('div');
  Object.assign(readout.style, {
    position: 'fixed', top: '12px', left: '12px', zIndex: 10, pointerEvents: 'none',
    font: '11px/1.5 ui-monospace, monospace', color: '#9fe8ff', textShadow: '0 1px 2px #000',
    whiteSpace: 'pre',
  });
  document.body.appendChild(readout);
}
window.__hero = { state, rig, camera, scene, PATH, MARKS, STAR, SCENE3, FALL, ABYSS, heroSplit, storyMap, star, artist, fall, abyss, measureScene3, tween, ScrollTrigger };

/* ───────────────────────────── render loop ───────────────────────── */

let elapsed = 0;
let last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 1 / 20); // clamp: a backgrounded tab must not teleport the rig
  last = now;
  elapsed += dt;
  // Scenes 1–2 run the reveal budget at their original px; Scene 3's beat plays across
  // the story budget; past it the rig latches at t = 1 (end-frame framing) while Scene 4
  // descends *on top of it* — see scene4.js buildScrollMap.
  const { pos, fov } = rig.update(storyMap.heroT(state.t), dt);

  // Scene 3 reads the *rendered* progress, so his reaction can never disagree with the shot.
  const s3 = measureScene3(rig.t);
  star.update(s3, elapsed, dt);
  artist.update(elapsed, dt, s3, star.anchor);
  // as the star takes over, the canvas light steps back — one source of truth in the frame
  // the board dims only slightly as he turns away from it — enough to shift the picture's
  // weight onto the star, not enough to lose the canvas in the end frame
  canvasGlow.intensity = THREE.MathUtils.lerp(baseGlow, baseGlow * 0.78, s3.notice);
  // Scene 4 post-pass: floor, flare, fall pose, camera descent, fog/lights/veil — all
  // pure functions of its own damped local p; exactly zero writes before it starts.
  const s4 = fall.update(state.t, elapsed, dt, s3, rig);
  // Scene 5 post-pass: shatter off the fall's own damped progress; the abyss travel
  // extends the descent, opens the veil/fog, blends the aim down the shaft.
  const s5 = abyss.update(fall.cur, elapsed);
  if (debug) {
    // billboard the reticles at the camera each frame; they follow the live objects
    const tmpV = new THREE.Vector3();
    markerStar.position.copy(star.group.position);
    markerStar.quaternion.copy(camera.quaternion);
    markerStar.visible = s3.appear > 0.02;
    artist.parts.rightArm.hand.getWorldPosition(tmpV);
    markerHand.position.copy(tmpV);
    markerHand.quaternion.copy(camera.quaternion);
    artist.parts.rightArm.tool.children[2].getWorldPosition(tmpV);
    markerTip.position.copy(tmpV);
    markerTip.quaternion.copy(camera.quaternion);
  }
  renderer.render(scene, camera);
  if (readout) {
    // read-only on `pos`: mutating it would move the camera
    const azim = THREE.MathUtils.radToDeg(Math.atan2(-pos.x, -pos.z));
    readout.textContent =
      `t ${state.t.toFixed(3)}  rendered ${rig.t.toFixed(3)}\n` +
      `azim ${azim.toFixed(1)}°  dist ${Math.hypot(pos.x, pos.z).toFixed(2)}m  y ${pos.y.toFixed(2)}m  fov ${fov.toFixed(1)}°\n` +
      `scroll ${Math.round(window.scrollY)} / ${Math.round(scrollLength)}px  heroT ${storyMap.heroT(state.t).toFixed(3)}\n` +
      `star ${s3.appear.toFixed(2)}  notice ${s3.notice.toFixed(2)}  reach ${s3.reach.toFixed(2)}  ` +
      `step ${artist.stats().step.toFixed(3)}m  stroke ${artist.stats().strokeGate.toFixed(3)}\n` +
      `fall p ${s4.p.toFixed(3)}  camY ${camera.position.y.toFixed(2)}m  drop ${s4.camDepth.toFixed(1)}m  ` +
      `open ${s4.openW.toFixed(2)}  flare ${s4.flare.toFixed(2)}  p ${s4.p.toFixed(3)}\n` +
      `shatter ${s5.s.toFixed(2)}  abyss a ${s5.a.toFixed(3)}  org ${s5.w.org.toFixed(2)}  dens ${s5.w.dens.toFixed(2)}  camY ${camera.position.y.toFixed(1)}m`;
  }
});

/* ───────────────────────────── resize ────────────────────────────── */

const onResize = () => {
  const w = hero.clientWidth;
  const h = hero.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio, CONFIG.maxPixelRatio));
  renderer.setSize(w, h, false);
  gsap.delayedCall(0.15, () => ScrollTrigger.refresh());
};
window.addEventListener('resize', onResize, { passive: true });
onResize();
