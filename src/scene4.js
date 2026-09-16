/**
 * scene4.js — Scene 4: THE FALL, layered on top of the existing pin.
 *
 * Architecture in one sentence: the GSAP scrub now runs over the WHOLE pin
 * (hero 3400px + fall 2200px = 5600px) and writes one `state.t ∈ [0,1]`;
 * Scenes 1–3 read `min(t / split, 1)` so their pixel timing is untouched, and
 * Scene 4 reads the remainder as a local progress `p = (t − split) / (1 − split)`.
 * `camera-path.js` and `scene3.js` are not modified by a single line.
 *
 * Everything in Scene 4 is a *pure function of p*, applied in a post-pass that runs
 * AFTER rig.update / star.update / artist.update each frame:
 *
 *   · the floor is owned by this module (two flush half-discs; while p = 0 they are
 *     indistinguishable from the old single disc) and it splits, tips on far-edge
 *     hinges and sinks — sharply, across p 0.055 → 0.15, creeping open after;
 *   · the star gets a flare envelope (sin-shaped, zero outside p 0.015 → 0.32), then
 *     fades with distance as the camera drops away beneath it;
 *   · the artist blends from the latched Scene-3 reach into a stylised fall pose
 *     (torso tumble, loose arms, legs losing balance) — no physics, no state;
 *   · the camera keeps the Scene-2 end framing and gets a descent bolted on: a lurch
 *     (≈44 % of the depth inside the first 0.135 of p) then acceleration to −18.32 m
 *     (absolute y ≈ −16.9), FOV 37° → 45.5°, brief shake/roll only around the drop;
 *   · fog tightens toward black, the studio lights dim to a floor value, the exposure
 *     drops and a black veil shell closes around the camera: the bottom is a
 *     deliberately deep placeholder void (no matrix, no tunnel, no projects yet).
 *
 * Every write is either absolute (`= capturedBase + f(p)`) or a `+= f(p)` onto a
 * channel that artist/star/rig re-set from scratch every frame — so all deltas are
 * exactly zero at p = 0, the camera overlay self-gates at p ≤ 1e-7, and scrolling
 * back restores floor, pose, star, fog, camera and lights bit-for-bit.
 * `npm run check` asserts that.
 *
 * >>> TUNE THE FALL HERE: FALL (motion / visual) and FALL_POSE (the figure) below. <<<
 */

import * as THREE from 'three';
import { PATH } from './camera-path.js';
import { smoothstep } from './scene3.js';

/* ───────────────────────────── timing + motion (all in local p) ───────────────────────────── */

export const FALL = {
  /** px budgets — the truth lives in style.css (--reveal-scroll, --story-scroll,
   *  --fall-scroll); main.js reads them and builds the scroll map at runtime.
   *  These are the fallback + documentation. */
  scroll: { reveal: 2108, story: 2400, fall: 2200, abyss: 2800, line: 2600 },
  /** legacy two-way split, kept so the linear helpers/tests still resolve */
  split: 3400 / 5600,
  /** heroT at which the Scenes 1–2 reveal ends == SCENE3.appear[0]; the reveal
   *  budget maps linearly to it at 1/3400 px — the ORIGINAL pixels, unchanged */
  revealEndT: 0.62,

  beats: {
    // The windows are deliberately FRONT-loaded: the star must flare, break and
    // start fading while it is still IN FRAME — the dive takes it out of the top
    // of the window by p ≈ 0.16, so a late flare would be a glow the audience
    // never sees. Reach is fully committed by p = 0.04 (Scene 3 + catch pose),
    // the ground answers at 0.07, the star breaks at 0.10, the descent starts.
    catch: [0.0, 0.09], // hand closes toward the star
    flare: [0.03, 0.095], // star brightens / grows — the CAUSE reads; the break lands exactly as the dive starts
    collapse: [0.07, 0.17], // ground splits + sinks, sharply, one breath after the reach settles
    blend: [0.01, 0.55], // reach pose → fall pose
    fall: 0.1, // the descent begins
  },

  /** one descent curve for the camera: a lurch share arrives fast, the rest
   *  accelerates with pow(). Monotonic by construction, so it scrubs cleanly. */
  shape: { lurchStart: 0.1, lurchEnd: 0.24, lurchShare: 0.44, accel: 1.8 },

  ground: {
    radius: 60, // match the old ground disc exactly → Scenes 1–3 look identical
    segs: 36, // 36 per half == the old 72-segment disc
    riftWidth: 5.9, // inner-edge separation at full open (m)
    sink: 4.2, // extra plunge of each half on top of the hinge drop
    hinge: 56, // far edge the halves tip over (m from centre) — tips the near end
    hingeTilt: 0.075, // rad; 56 m × sin(0.075) ≈ 4.2 m of seam drop at full open
    creep: [0.15, 0.52], // …then slow widening after the sharp part
    creepAmt: 0.35, // continues opening this much further during the creep
    propsSink: 8.4, // easel / stool / contact shadows ride the collapsing centre down
  },

  camera: {
    drop: 18.32, // metres; 1.42 − 18.32 ≈ −16.90 by p = 1 (spec target)
    start: 0.075,
    fov: [37, 45.5], // modest widening during the drop
    fovWin: [0.05, 0.9],
    /** the aim dives past the artist late so he drifts UP in the frame.
     *  aim.y = look.y − camDepth − [(artistDepth − camDepth) − lift·liftW + sink·sinkW] */
    follow: { lift: 0.35, liftWin: [0.08, 0.18], sink: 2.6, win: [0.55, 0.98] },
    shake: { win: [0.055, 0.32], pos: 0.05, rot: 0.012, freq: 13.7 },
    roll: { rise: [0.065, 0.125], fall: [0.135, 0.3], kick: 4.5, settle: -1.2, settleWin: [0.2, 0.5] }, // deg
  },

  artist: {
    drop: 21.6, // he falls deeper / faster than the camera (ends ≈ −20.0 m head)
    start: 0.07, // loses the floor a touch before the camera lurches
    lurchShare: 0.3,
    lurchEnd: 0.185,
    accel: 1.45,
    bob: 0.02, // airborne bob (time-driven, gated to zero at p = 0)
  },

  star: {
    flareLight: 2.0, // × base point-light intensity at flare peak
    flareGrow: 0.55, // × core scale at flare peak
    fade: [0.095, 0.42], // …then fade with distance as the camera falls away
  },

  void_: {
    fog: { color: 0x000000, near: 0.45, far: 6.8, win: [0.06, 0.72] },
    lights: { win: [0.1, 0.62], floor: 0.18 }, // studio lights dim TO 18 % — not to zero
    exposure: { win: [0.2, 0.9], amount: 0.45 }, // renderer tone-mapping exposure cut
    veil: { radius: 44, win: [0.12, 0.8], opacity: 0.985 }, // black shell around the camera
    fill: { color: 0x8fb6e8, intensity: 2.1, distance: 6, in: [0.04, 0.16], out: [0.7, 0.96] },
    // small camera-side cool fill keeps the falling figure readable while the room
    // dies; it fades out too, so the bottom goes genuinely black
  },

  debris: {
    dust: 150, // points
    chips: 12, // instanced boxes breaking out of the floor
    dragLo: 0.32, dragHi: 1.15, // parallax spread of the fall speed per piece
    burst: [0.05, 0.16], burstOut: [0.45, 0.95],
  },
};

/* ───────────────────────────── fall pose (artist deltas, rad / m) ───────────────────────── */

export const FALL_POSE = {
  /** final small step off the collapsing floor, toward the star */
  step: { dist: 0.09, win: [0.0, 0.08] },
  /** brush arm reaches up-and-across toward the star at the catch */
  catchArm: { pivotX: -1.141, pivotY: 0.531, pivotZ: 0.516, elbowX: -0.063, toolX: 0.281, chestLeanX: 0.1, win: [0.002, 0.03] },
  /** whole-body fall pose, scaled by the blend window FALL.beats.blend */
  body: {
    pitch: -0.5, // figure.rotation.x — back-tumble, face to the sky
    roll: -0.18, // figure.rotation.z — tips toward the star side
    archX: -0.12, // chest arches a touch past the figure
    headUpX: -0.14, // chin stays lifted toward the star as he drops
    headHoldY: 0.2, // head counter-turns so the eyeline holds on the light
    rightArmX: 0.26, // brush arm loosens up off the canvas
    rightArmZ: -0.3, // …and out
    rightElbowX: 0.3,
    leftArmX: 0.4, // palette arm flails back / out
    leftArmZ: 0.5,
    leftElbowX: 0.36,
    rightHipX: 0.34, // weight leg kicks back, trailing
    rightKneeX: 0.3,
    leftHipX: -0.45, // free leg tucks up
    leftKneeX: 0.85,
  },
  /** subtle continuous tumble while airborne (time-driven, gated by the air weight) */
  tumble: { rollAmp: 0.03, rollHz: 0.5, pitchAmp: 0.025, pitchHz: 0.7 },
  /** bases of channels artist.update never rewrites — the fall owns these absolutely */
  bases: { figureRotX: 0, rightHipX: 0, rightKneeX: -0.02, toolRotX: 1.26 },
};

/* ───────────────────────────── pure helpers ───────────────────────────── */

const win = (x, a, b) => smoothstep(x, a, b);
const winW = (x, [a, b]) => smoothstep(x, a, b);

/** Scenes 1–3 input: total pin progress remapped so their window owns the first
 *  `split` of the scroll, then Scene 3 latches while the fall plays out. */
export const heroTime = (t, split = FALL.split) => THREE.MathUtils.clamp(t / split, 0, 1);

/**
 * The three-budget scroll map — how px of pin translate to the two stories:
 *
 *   px 0 → reveal           heroT 0 → revealEndT        Scenes 1–2's orbit, at the
 *        (--reveal-scroll)                               ORIGINAL 1/3400 px slope:
 *                                                        every pre-Scene-3 frame keeps
 *                                                        the pixels it always had
 *   px reveal → reveal+story heroT revealEndT → 1       Scene 3's beat (star appears,
 *        (--story-scroll)                                notice, reach) on its own
 *                                                        stretched budget — the story
 *                                                        breathes here
 *   px reveal+story → +fall   p 0 → 1                     Scene 4's fall
 *        (--fall-scroll)
 *   px +fall → +fall+abyss    a 0 → 1                     Scene 5's abyss travel
 *        (--abyss-scroll)                                  (p stays latched at 1: the
 *                                                          void holds while the abyss runs)
 *   px +abyss → total         l 0 → 1                     Scene 6's red-line run
 *        (--line-scroll)                                   (a stays latched at 1)
 *
 * Monotonic and continuous; flat latches at each end. main.js builds this from the
 * CSS variables; everything downstream (rig input, Scene-3 windows, the fall) reads it.
 * Adding an abyss budget can NEVER move an earlier frame: every segment is defined by
 * PIXELS, and the heroT/p formulas ignore totalPx above their own breakpoints.
 */
export function buildScrollMap({ revealPx = FALL.scroll.reveal, storyPx = FALL.scroll.story, fallPx = FALL.scroll.fall, abyssPx = FALL.scroll.abyss, linePx = FALL.scroll.line, revealEndT = FALL.revealEndT } = {}) {
  const totalPx = revealPx + storyPx + fallPx + abyssPx + linePx;
  const heroT = (t) => {
    const px = THREE.MathUtils.clamp(t, 0, 1) * totalPx;
    if (px <= revealPx) return (px / revealPx) * revealEndT; // px-identical to the old /3400 slope when revealPx = revealEndT·3400
    if (px >= revealPx + storyPx) return 1;
    return revealEndT + ((px - revealPx) / storyPx) * (1 - revealEndT);
  };
  const p = (t) => {
    const px = THREE.MathUtils.clamp(t, 0, 1) * totalPx;
    return THREE.MathUtils.clamp((px - revealPx - storyPx) / fallPx, 0, 1);
  };
  const a = (t) => {
    const px = THREE.MathUtils.clamp(t, 0, 1) * totalPx;
    return THREE.MathUtils.clamp((px - revealPx - storyPx - fallPx) / abyssPx, 0, 1);
  };
  const l = (t) => {
    const px = THREE.MathUtils.clamp(t, 0, 1) * totalPx;
    return THREE.MathUtils.clamp((px - revealPx - storyPx - fallPx - abyssPx) / linePx, 0, 1);
  };
  return { totalPx, revealPx, storyPx, fallPx, abyssPx, linePx, revealEndT, heroT, p, a, l };
}

/** one descent curve: the lurch share arrives fast, the rest accelerates with pow(). */
export function depthShape(p, { drop, lurchStart = FALL.shape.lurchStart, lurchEnd = FALL.shape.lurchEnd, lurchShare = FALL.shape.lurchShare, accel = FALL.shape.accel }) {
  const u = THREE.MathUtils.clamp((p - lurchStart) / (1 - lurchStart), 0, 1);
  return drop * (lurchShare * smoothstep(p, lurchStart, lurchEnd) + (1 - lurchShare) * Math.pow(u, accel));
}

export const cameraDepth = (p, cfg = FALL.camera) =>
  depthShape(p, { drop: cfg.drop, lurchStart: cfg.start, lurchEnd: FALL.shape.lurchEnd, lurchShare: FALL.shape.lurchShare, accel: FALL.shape.accel });

export const artistDepth = (p, cfg = FALL.artist) =>
  depthShape(p, { drop: cfg.drop, lurchStart: cfg.start, lurchEnd: cfg.lurchEnd, lurchShare: cfg.lurchShare, accel: cfg.accel });

/** every Scene-4 weight from the local progress alone — the canonical entry point. */
export function scene4Weights(p, t = 0, split = FALL.split) {
  const b = FALL.beats;
  const flareU = winW(p, b.flare);
  const collapseW = winW(p, b.collapse);
  const creepW = winW(p, FALL.ground.creep);
  return {
    t,
    split,
    p,
    catch: winW(p, b.catch),
    flare: Math.pow(Math.sin(Math.PI * flareU), 1.15), // 0 → peak ≈ p .17 → 0; never an explosion
    collapse: collapseW,
    blend: winW(p, b.blend),
    camDepth: cameraDepth(p),
    artistDepth: artistDepth(p),
    /** floor open-amount: 0→1 across collapse, +creepAmt× across creep, normalised so
     *  the inner edges end exactly riftWidth apart */
    openW: (collapseW + FALL.ground.creepAmt * creepW) / (1 + FALL.ground.creepAmt),
    starFade: winW(p, FALL.star.fade),
    dust: winW(p, FALL.debris.burst) * (1 - winW(p, FALL.debris.burstOut)),
  };
}

/** the linear-split form, kept as the fallback + for tools */
export function measureFall(t, split = FALL.split) {
  return scene4Weights(THREE.MathUtils.clamp((t - split) / (1 - split), 0, 1), t, split);
}

/* ───────────────────────────── the layer ───────────────────────────── */

/** tiny LCG so debris scatter is irregular but identical every reload */
function seeded(n) {
  let s = n;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296 - 0.5) * 2;
}

/**
 * Builds the floor (always — it replaces main.js's disc so it CAN split), the debris
 * field and the void veil, and applies every Scene-4 delta as a post-pass.
 * @param {{ scene, camera, artist, star, rig, renderer?, lights?, split? }} ctx
 *        renderer / lights are optional so the headless check can run this for real.
 */
export function createFallLayer(ctx) {
  const split = ctx.split ?? FALL.split;
  const toP = ctx.toP ?? ((t) => THREE.MathUtils.clamp((t - split) / (1 - split), 0, 1));
  const { scene, camera, artist, star, renderer } = ctx;
  const conf = FALL;

  /* ── the floor: two flush halves == the old full disc while closed ─────────
     The seam runs along Z through the artist's feet, so the rift opens exactly
     under him and the halves slide out of the profile frame left/right. */
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x0a0e16, roughness: 0.96, metalness: 0, side: THREE.DoubleSide });
  const makeHalf = (a0, side) => {
    const pivot = new THREE.Group(); // hinge pivot sits at the far edge (x = ±hinge)
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(conf.ground.radius, conf.ground.segs, a0, Math.PI), floorMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.x = -side * conf.ground.hinge; // …so the half-disc itself stays centred at x = 0
    pivot.position.set(side * conf.ground.hinge, 0, 0);
    pivot.add(mesh);
    return pivot;
  };
  const floor = {
    left: makeHalf(Math.PI / 2, -1), // x ≤ 0 half (camera side in the end frame)
    right: makeHalf((3 * Math.PI) / 2, 1), // x ≥ 0 half (easel side)
  };
  if (scene) scene.add(floor.left, floor.right);

  /* ── void veil: a black shell that rides the camera and swallows the room ── */
  const veilMat = new THREE.MeshBasicMaterial({
    color: 0x000000, side: THREE.BackSide, transparent: true, opacity: 0, depthWrite: false, fog: false, toneMapped: false,
  });
  const veil = new THREE.Mesh(new THREE.SphereGeometry(conf.void_.veil.radius, 20, 14), veilMat);
  veil.renderOrder = 3;
  if (scene) scene.add(veil);

  /* ── camera-side fill so the fall stays readable while the room dies ─────── */
  const fill = new THREE.PointLight(conf.void_.fill.color, 0, conf.void_.fill.distance, 2);
  if (scene) scene.add(fill);

  /* ── debris: one InstancedMesh of chips + one Points cloud of dust ───────── */
  const r0 = seeded(4021);
  const chips = [];
  for (let i = 0; i < conf.debris.chips; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    chips.push({
      p0: new THREE.Vector3(side * (0.35 + Math.abs(r0()) * 2.4), 0.04 + Math.abs(r0()) * 0.1, r0() * 3.4),
      s: 0.05 + Math.abs(r0()) * 0.16,
      dir: new THREE.Vector3(side * (0.5 + Math.abs(r0())), 0.7 + Math.abs(r0()) * 1.4, r0()),
      drag: conf.debris.dragLo + Math.abs(r0()) * (conf.debris.dragHi - conf.debris.dragLo),
      spin: new THREE.Vector3(r0() * 3, r0() * 3, r0() * 3),
      delay: Math.abs(r0()) * 0.12,
    });
  }
  const chipMat = new THREE.MeshStandardMaterial({ color: 0x241c12, roughness: 0.92, metalness: 0 });
  const chipsMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.32, 1), chipMat, chips.length);
  chipsMesh.castShadow = false;
  chipsMesh.visible = false;
  const dummy = new THREE.Object3D();
  if (scene) scene.add(chipsMesh);

  const dustGeo = new THREE.BufferGeometry();
  const dustBase = new Float32Array(conf.debris.dust * 3);
  const dustDrag = new Float32Array(conf.debris.dust);
  const dustRise = new Float32Array(conf.debris.dust);
  for (let i = 0; i < conf.debris.dust; i++) {
    dustBase.set([r0() * 9, 0.05 + Math.abs(r0()) * 2.6, r0() * 9 - 0.5], i * 3);
    dustDrag[i] = conf.debris.dragLo + Math.abs(r0()) * (conf.debris.dragHi - conf.debris.dragLo);
    dustRise[i] = 0.4 + Math.abs(r0()) * 1.1;
  }
  const dustPos = Float32Array.from(dustBase);
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dustMat = new THREE.PointsMaterial({ color: 0x8d8471, size: 0.028, sizeAttenuation: true, transparent: true, depthWrite: false, opacity: 0 });
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.visible = false;
  if (scene) scene.add(dust);

  /* ── captured bases: absolute writes are base + f(p), so p = 0 is identity ── */
  const P = artist.parts;
  const bases = {
    propsY: artist.props.position.y,
    fog: scene?.fog ? { color: scene.fog.color.clone(), near: scene.fog.near, far: scene.fog.far } : null,
    exposure: renderer ? renderer.toneMappingExposure : 1,
    glowBase: ctx.lights?.canvasGlow ? ctx.lights.canvasGlow.intensity : 0,
    lights: ctx.lights
      ? Object.values(ctx.lights)
          .filter((l) => l && l !== ctx.lights.canvasGlow)
          .map((l) => [l, l.intensity])
      : null,
  };

  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const tmpColor = new THREE.Color();

  /* damped total: Scene 4 reads the *rendered* progress — the same λ the rig uses —
     so the fall can never disagree with the shot, and reversals ease identically. */
  let cur = 0;
  let s4 = scene4Weights(0);

  const apply = (time, s3) => {
    const p = s4.p;
    const g = conf.ground;

    /* floor: spread + hinge-sink, sharp during collapse, creeping open after */
    const open = s4.openW;
    const half = (g.riftWidth / 2) * 1; // openW already normalises the creep → max gap == riftWidth
    floor.left.position.set(-g.hinge - half * open, -g.sink * open, 0);
    floor.left.rotation.z = -g.hingeTilt * open;
    floor.right.position.set(g.hinge + half * open, -g.sink * open, 0);
    floor.right.rotation.z = g.hingeTilt * open;

    /* props + contact shadows ride the collapsing centre down — the easel is a
       reference for the first half-second of the break, then it is swallowed */
    artist.props.position.y = bases.propsY - g.propsSink * win(p, 0.06, 0.45);
    for (const b of P.contactBlobs) if (b) b.material.opacity = 1 - win(p, 0.06, 0.28);

    /* star: flare at the catch, then fade with distance as we leave it behind.
       star.update() has already written absolute opacities/scales this frame →
       multiplying its output is exact and non-accumulating; ×1 at p = 0. */
    const L = star.layers;
    if (L) {
      const fl = 1 + s4.flare;
      L.nucleus.material.opacity = Math.min(1, L.nucleus.material.opacity * (1 + 0.8 * (fl - 1)));
      L.halo.material.opacity *= fl;
      L.flare.material.opacity *= fl;
      L.scatter.material.opacity *= fl;
      L.nucleus.scale.multiplyScalar(1 + 0.3 * s4.flare);
      L.halo.scale.multiplyScalar(1 + 0.4 * s4.flare);
      L.flare.scale.x *= 1 + 0.45 * s4.flare;
      star.core.scale.multiplyScalar(1 + conf.star.flareGrow * s4.flare);
      const fade = 1 - s4.starFade;
      L.nucleus.material.opacity *= fade;
      L.halo.material.opacity *= fade;
      L.flare.material.opacity *= fade;
      L.scatter.material.opacity *= fade;
      if (star.motes?.children[0]) star.motes.children[0].material.opacity *= fade;
      star.light.intensity *= (1 + conf.star.flareLight * s4.flare) * fade;
    }

    /* artist: catch → lose the floor → stylised fall pose (every delta f(p)) */
    const FP = FALL_POSE;
    const B = FP.body;
    const W = s4.blend;
    const airW = win(p, conf.artist.start, conf.artist.start + 0.2);
    const catchW = s4.catch;
    const cW = winW(p, FP.catchArm.win);
    if (catchW > 0) {
      P.head.getWorldPosition(tmpA);
      tmpB.copy(star.anchor).sub(tmpA).setY(0).normalize();
      artist.figure.position.addScaledVector(tmpB, FP.step.dist * winW(p, FP.step.win)); // last small step off the edge
    }
    artist.figure.position.y -= s4.artistDepth;
    artist.figure.position.y += Math.sin(time * 2.1 + 0.4) * conf.artist.bob * airW;
    // figure pitch/roll: rotation.x is never re-written by artist.update → own it absolutely
    artist.figure.rotation.x =
      FP.bases.figureRotX + B.pitch * W + Math.sin(time * FP.tumble.pitchHz + 0.8) * FP.tumble.pitchAmp * airW;
    artist.figure.rotation.z += B.roll * W + Math.sin(time * FP.tumble.rollHz) * FP.tumble.rollAmp * airW;

    const A = P.rightArm;
    A.pivot.rotation.x += FP.catchArm.pivotX * cW + B.rightArmX * W;
    A.pivot.rotation.y += FP.catchArm.pivotY * cW;
    A.pivot.rotation.z += FP.catchArm.pivotZ * cW + B.rightArmZ * W;
    A.elbow.rotation.x += FP.catchArm.elbowX * cW + B.rightElbowX * W;
    P.chest.rotation.x += FP.catchArm.chestLeanX * cW; // commit the torso into the reach (chest.x is re-set every frame → += is exact)
    if (A.tool) A.tool.rotation.x = FP.bases.toolRotX + FP.catchArm.toolX * cW; // absolute: only posed at build
    const LA = P.leftArm;
    LA.pivot.rotation.x += B.leftArmX * W;
    LA.pivot.rotation.z += B.leftArmZ * W;
    LA.elbow.rotation.x += B.leftElbowX * W;
    // left leg is absolute-written by artist.update every frame → += is exact;
    // right leg is only posed at build → write absolute from the captured bases
    P.legs.left.hip.rotation.x += B.leftHipX * W;
    P.legs.left.knee.rotation.x += B.leftKneeX * W;
    P.legs.right.hip.rotation.x = FP.bases.rightHipX + B.rightHipX * W;
    P.legs.right.knee.rotation.x = FP.bases.rightKneeX + B.rightKneeX * W;
    P.head.rotation.x += B.headUpX * W;
    P.head.rotation.y += B.headHoldY * W;
    P.chest.rotation.x += B.archX * W;

    /* void: fog → black, lights dim to floor, exposure drops, veil + fill in */
    if (bases.fog && scene?.fog) {
      const fw = winW(p, conf.void_.fog.win);
      scene.fog.color.lerpColors(bases.fog.color, tmpColor.setHex(conf.void_.fog.color), fw);
      scene.fog.near = THREE.MathUtils.lerp(bases.fog.near, conf.void_.fog.near, fw);
      scene.fog.far = THREE.MathUtils.lerp(bases.fog.far, conf.void_.fog.far, fw);
    }
    if (bases.lights) {
      const lf = 1 - (1 - conf.void_.lights.floor) * winW(p, conf.void_.lights.win);
      for (const [l, base] of bases.lights) l.intensity = base * lf;
      if (ctx.lights.canvasGlow) {
        const s3Dim = THREE.MathUtils.lerp(1, 0.78, s3?.notice ?? 0); // keep main.js's Scene-3 rule
        ctx.lights.canvasGlow.intensity = bases.glowBase * s3Dim * lf;
      }
    }
    if (renderer) renderer.toneMappingExposure = bases.exposure * (1 - conf.void_.exposure.amount * winW(p, conf.void_.exposure.win));
    const vw = winW(p, conf.void_.veil.win);
    veil.position.copy(camera.position);
    veilMat.opacity = conf.void_.veil.opacity * vw;
    P.chest.getWorldPosition(tmpA);
    fill.position.set(tmpA.x, tmpA.y + 0.35, tmpA.z + 0.25);
    fill.intensity =
      conf.void_.fill.intensity * winW(p, conf.void_.fill.in) * (1 - winW(p, conf.void_.fill.out));

    /* debris: burst up off the split, then fall with per-piece parallax (pure in p) */
    const show = open > 0.01;
    chipsMesh.visible = show;
    dust.visible = show;
    if (show) {
      const camD = s4.camDepth;
      for (let i = 0; i < chips.length; i++) {
        const c = chips[i];
        const local = win(p, 0.05 + c.delay, 0.2 + c.delay);
        dummy.position.set(
          c.p0.x + c.dir.x * 1.35 * open,
          c.p0.y + c.dir.y * 0.95 * local - camD * c.drag,
          c.p0.z + c.dir.z * 1.1 * open
        );
        dummy.rotation.set(c.spin.x * time * 0.4, c.spin.y * time * 0.35, c.spin.z * time * 0.3);
        dummy.scale.setScalar(c.s);
        dummy.updateMatrix();
        chipsMesh.setMatrixAt(i, dummy.matrix);
      }
      chipsMesh.instanceMatrix.needsUpdate = true;
      dustMat.opacity = 0.34 * s4.dust * (1 - vw);
      for (let i = 0; i < conf.debris.dust; i++) {
        const j = i * 3;
        dustPos[j] = dustBase[j] + Math.sin(i * 7.31) * 0.9 * open;
        dustPos[j + 1] = dustBase[j + 1] + dustRise[i] * s4.dust - camD * dustDrag[i];
        dustPos[j + 2] = dustBase[j + 2] + Math.cos(i * 5.13) * 0.9 * open;
      }
      dustGeo.attributes.position.needsUpdate = true;
    }
  };

  return {
    floor,
    /** the void veil mesh — Scene 4 owns its opacity while p runs; Scene 5 may open it
     *  during the abyss travel (never before a > 0), so the handle is exposed. */
    veil,
    get cur() {
      return cur;
    },
    get s4() {
      return s4;
    },
    measure: (t) => scene4Weights(toP(t), t, split),
    /**
     * Damp the total pin progress, then apply every Scene-4 delta.
     * @param {number} totalT whole-pin progress 0→1 over the full 5600 px
     * @param {number} time seconds — drives only bob/spin/shake, gated to zero at p = 0
     * @param {number} dt
     * @param {object} s3 Scene-3 weights (for the canvas-glow rule)
     * @param {object} rig the camera rig (its damped target feeds the fall aim)
     */
    update(totalT, time, dt, s3, rig) {
      cur += (THREE.MathUtils.clamp(totalT, 0, 1) - cur) * (1 - Math.exp(-PATH.damping * Math.min(dt, 0.05)));
      s4 = scene4Weights(toP(cur), cur, split);
      apply(time, s3);

      /* camera overlay. Skipped entirely while p ≈ 0 (and after a return to 0): the
         rig's own lookAt/roll/fov stand, so Scenes 1–3 are provably untouched. At
         p > 0 the aim is recomputed absolutely — continuous into the fall because
         every follow term is 0 at the first frame p switches on. */
      if (s4.p > 1e-7) {
        camera.position.y -= s4.camDepth;
        if (rig) {
          const F = conf.camera.follow;
          const follow = s4.artistDepth - s4.camDepth - F.lift * winW(s4.p, F.liftWin) + F.sink * winW(s4.p, F.win);
          rig.targetCurve.getPoint(THREE.MathUtils.clamp(rig.t, 0, 1), tmpA);
          tmpA.y -= s4.camDepth + follow;
          camera.lookAt(tmpA);
          const R = conf.camera.roll;
          const rollDeg =
            R.kick * win(s4.p, R.rise[0], R.rise[1]) * (1 - winW(s4.p, R.fall)) +
            (R.settle - PATH.tiltEnd) * winW(s4.p, R.settleWin);
          camera.rotateZ(THREE.MathUtils.degToRad(rollDeg));
        }
        const S = conf.camera.shake;
        const sw = win(s4.p, S.win[0], 0.09) * (1 - win(s4.p, 0.16, S.win[1]));
        if (sw > 0) {
          const f = S.freq * Math.PI * 2;
          const a = S.pos * sw;
          camera.position.x += Math.sin(time * f + 1.3) * a;
          camera.position.y += Math.sin(time * f * 0.71 + 4.1) * a * 0.8;
          camera.position.z += Math.cos(time * f * 0.53) * a;
          camera.rotateX(Math.sin(time * f * 0.9 + 2.7) * S.rot * sw);
          camera.rotateY(Math.cos(time * f * 0.77 + 0.9) * S.rot * sw);
        }
        const fov = THREE.MathUtils.lerp(conf.camera.fov[0], conf.camera.fov[1], winW(s4.p, conf.camera.fovWin));
        if (Math.abs(camera.fov - fov) > 1e-5) {
          camera.fov = fov;
          camera.updateProjectionMatrix();
        }
      }
      return s4;
    },
    /** headless tuning helper: drive the damping to a fixed total progress and settle */
    settle(totalT, time, dt, s3, rig, frames = 1000) {
      for (let i = 0; i < frames; i++) {
        this.update(totalT, time, dt, s3, rig);
        if (Math.abs(cur - totalT) < 1e-7) break;
      }
      return s4;
    },
  };
}
