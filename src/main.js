/* =============================================================================
 *  SCROLL-DRIVEN CINEMATIC HERO — Scenes 1, 2 and 3
 *  One pinned section, one scroll, one camera move, three beats:
 *    Scene 1  extreme close-up on the back of a painter's head/shoulder (no face)
 *    Scene 2  orbit + zoom-out settling beside him, side-profile against the easel
 *    Scene 3  a light appears beyond the canvas late in the SAME move, he notices it,
 *             stops painting and shifts a step closer as the scroll finishes
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
 *  2. SCROLL LENGTH → src/style.css `--hero-scroll` (3400px), read by main.js.
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
import './style.css';

gsap.registerPlugin(ScrollTrigger);

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
/** single source of truth for how far you scroll: --hero-scroll in style.css */
const scrollLength = cssNumber('--hero-scroll', 3400);
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
if (reducedMotion) {
  PATH.float.amp = 0; // no handheld drift; the scroll-driven move still works
  PATH.damping = 10;
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

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(60, 72), // huge: its far edge is fully fogged, so no visible disc rim
  new THREE.MeshStandardMaterial({ color: 0x0a0e16, roughness: 0.96, metalness: 0 })
);
ground.rotation.x = -Math.PI / 2;
// no floor shadows: props are grounded by soft blobs in artist.js, and letting the floor
// receive the map would print the directional light's rectangular ortho frustum on it
ground.receiveShadow = false;
scene.add(ground);

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

const tween = gsap.to(state, {
  t: 1,
  ease: 'none',
  scrollTrigger: {
    trigger: '#hero',
    start: 'top top',
    end: () => `+=${scrollLength}`, // 1:1 with --hero-scroll
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
if (debug) {
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
window.__hero = { state, rig, camera, scene, PATH, MARKS, STAR, SCENE3, star, artist, measureScene3, tween, ScrollTrigger };

/* ───────────────────────────── render loop ───────────────────────── */

let elapsed = 0;
let last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 1 / 20); // clamp: a backgrounded tab must not teleport the rig
  last = now;
  elapsed += dt;
  const { pos, fov } = rig.update(state.t, dt);

  // Scene 3 reads the *rendered* progress, so his reaction can never disagree with the shot.
  const s3 = measureScene3(rig.t);
  star.update(s3, elapsed, dt);
  artist.update(elapsed, dt, s3, star.anchor);
  // as the star takes over, the canvas light steps back — one source of truth in the frame
  // the board dims only slightly as he turns away from it — enough to shift the picture's
  // weight onto the star, not enough to lose the canvas in the end frame
  canvasGlow.intensity = THREE.MathUtils.lerp(baseGlow, baseGlow * 0.78, s3.notice);
  renderer.render(scene, camera);
  if (readout) {
    // read-only on `pos`: mutating it would move the camera
    const azim = THREE.MathUtils.radToDeg(Math.atan2(-pos.x, -pos.z));
    readout.textContent =
      `t ${state.t.toFixed(3)}  rendered ${rig.t.toFixed(3)}\n` +
      `azim ${azim.toFixed(1)}°  dist ${Math.hypot(pos.x, pos.z).toFixed(2)}m  y ${pos.y.toFixed(2)}m  fov ${fov.toFixed(1)}°\n` +
      `scroll ${Math.round(window.scrollY)} / ${Math.round(scrollLength)}px\n` +
      `star ${s3.appear.toFixed(2)}  notice ${s3.notice.toFixed(2)}  reach ${s3.reach.toFixed(2)}  ` +
      `step ${artist.stats().step.toFixed(3)}m  stroke ${artist.stats().strokeGate.toFixed(3)}`;
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
