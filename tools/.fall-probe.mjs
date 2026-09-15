/**
 * Headless Scene-4 probe — tuning + sanity for the fall (no browser, no WebGL).
 *   node tools/.fall-probe.mjs
 * Steps the REAL per-frame pipeline (rig → s3 → star → artist → canvasGlow → fall)
 * so nothing accumulates that shouldn't. Prints: p=0 identity, catch hand→star
 * distance, camera depth/fov/head-framing along the fall, floor kinematics,
 * monotonic descent, and exact reversibility on scrub-back.
 */
import * as THREE from 'three';
import { createCameraRig, PATH } from '../src/camera-path.js';
import { createArtist } from '../src/artist.js';
import { createStar, STAR } from '../src/star.js';
import { measureScene3 } from '../src/scene3.js';
import { FALL, FALL_POSE, createFallLayer, heroTime } from '../src/scene4.js';

PATH.float.amp = 0;
const W = 1600, H = 900;
const camera = new THREE.PerspectiveCamera(30, W / H, 0.03, 60);
const rig = createCameraRig(camera);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x101724, 2.6, 15);
const artist = createArtist();
const star = createStar();
const layers = {}; // stand-ins for main.js's lights so the dim pass is exercised
for (const [k, v] of Object.entries({ key: 1.5, rim: 2.9, rim2: 1.35, bounce: 0.55, wash: 22, canvasGlow: 6 })) {
  const l = new THREE.Object3D();
  l.intensity = v;
  layers[k] = l;
}
const fall = createFallLayer({ scene, camera, renderer: null, artist, star, split: FALL.split, lights: layers });

/** one faithful frame */
const frame = (totalT, elapsed) => {
  rig.update(heroTime(totalT, FALL.split), 1 / 60);
  const s3 = measureScene3(rig.t);
  star.update(s3, elapsed, 1 / 60);
  artist.update(elapsed, 1 / 60, s3, star.anchor);
  layers.canvasGlow.intensity = THREE.MathUtils.lerp(6, 6 * 0.78, s3.notice); // main.js's rule
  return fall.update(totalT, elapsed, 1 / 60, s3, rig);
};
const run = (totalT, frames, elapsed = 1.0) => {
  let s4;
  for (let i = 0; i < frames; i++) s4 = frame(totalT, elapsed);
  artist.figure.updateMatrixWorld(true);
  artist.group.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  return s4;
};
const tFor = (p) => FALL.split + p * (1 - FALL.split);
const worldOf = (o) => (o.updateWorldMatrix(true, false), o.getWorldPosition(new THREE.Vector3()));
const ndc = (v) => { const q = v.clone().project(camera); return `${q.x.toFixed(2)},${q.y.toFixed(2)}`; };
const snap = () => ({
  cam: camera.position.toArray().map((n) => n.toFixed(9)),
  fov: camera.fov,
  fig: artist.figure.position.toArray().map((n) => n.toFixed(9)),
  figRotX: artist.figure.rotation.x,
  figRotZ: artist.figure.rotation.z,
  headRotY: artist.parts.head.rotation.y,
  rightKnee: artist.parts.legs.right.knee.rotation.x,
  rightHip: artist.parts.legs.right.hip.rotation.x,
  toolX: artist.parts.rightArm.tool.rotation.x,
  propY: artist.props.position.y,
  fog: [scene.fog.near, scene.fog.far, `#${scene.fog.color.getHexString()}`],
  glow: layers.canvasGlow.intensity,
  key: layers.key.intensity,
  halo: star.layers.halo.material.opacity,
  nucleus: star.layers.nucleus.material.opacity,
  coreS: star.core.scale.x,
  starLight: star.light.intensity,
  floorX: [fall.floor.left.position.x, fall.floor.right.position.x],
  floorRz: [fall.floor.left.rotation.z, fall.floor.right.rotation.z],
});

console.log('split', FALL.split.toFixed(5), ' t(p=.075) =', tFor(0.075).toFixed(4));

// ── p = 0 dormancy: same pipeline with vs without the (dormant) fall layer.
//    Identical inputs → identical outputs proves the layer writes nothing at p = 0. ──
{
  run(tFor(0), 900);
  const withFall = snap();
  // now WITHOUT ever calling the layer: re-run the same number of upstream frames
  for (let i = 0; i < 900; i++) {
    rig.update(heroTime(tFor(0), FALL.split), 1 / 60);
    const s3 = measureScene3(rig.t);
    star.update(s3, 1, 1 / 60);
    artist.update(1, 1 / 60, s3, star.anchor);
    layers.canvasGlow.intensity = THREE.MathUtils.lerp(6, 6 * 0.78, s3.notice);
  }
  artist.figure.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  const bare = snap();
  const drift = Object.keys(withFall).filter((k) => withFall[k] !== null && JSON.stringify(withFall[k]) !== JSON.stringify(bare[k]));
  console.log('p0 dormancy:', drift.length ? `DRIFT in ${drift}` : 'IDENTICAL');
  if (drift.length) for (const k of drift) console.log(`  ${k}: with ${JSON.stringify(withFall[k])} vs bare ${JSON.stringify(bare[k])}`);
}

// ── catch: hand/tip → star at p = 0 vs p = .065 (before support breaks) ──
run(tFor(0), 900);
const d0 = worldOf(artist.parts.rightArm.hand).distanceTo(STAR.position);
run(tFor(0.065), 900);
const handC = worldOf(artist.parts.rightArm.hand);
const tipC = new THREE.Vector3();
artist.parts.rightArm.tool.children[2].getWorldPosition(tipC);
console.log(`catch: hand→star  ${d0.toFixed(3)}m → ${handC.distanceTo(STAR.position).toFixed(3)}m   tip→star ${tipC.distanceTo(STAR.position).toFixed(3)}m`);

// ── catch solver: search FALL_POSE.catchArm deltas so the hand closes toward the
//    star AND the brush tip points at it (the "reaches to meet it" read) ──
if (process.argv.includes('--solve')) {
  const zero = { ...FALL_POSE.catchArm };
  Object.assign(FALL_POSE.catchArm, { pivotX: 0, pivotY: 0, pivotZ: 0, elbowX: 0, toolX: 0, chestLeanX: 0 });
  run(tFor(0.065), 160); // base pose at the catch moment with no catch deltas
  const A = artist.parts.rightArm;
  const base = {
    px: A.pivot.rotation.x, py: A.pivot.rotation.y, pz: A.pivot.rotation.z, ex: A.elbow.rotation.x,
    tip: worldOf(A.tool.children[2]).clone(), hand: worldOf(A.hand).clone(), sh: worldOf(A.pivot).clone(),
  };
  const starV = STAR.position;
  const dir = starV.clone().sub(base.sh).normalize(); // the axis the hand should travel along
  const evaluate = (px, py, pz, ex) => {
    A.pivot.rotation.set(base.px + px, base.py + py, base.pz + pz);
    A.elbow.rotation.x = base.ex + ex;
    artist.group.updateMatrixWorld(true);
    const hand = worldOf(A.hand);
    const tip = worldOf(A.tool.children[2]);
    // reach: projection of (hand − shoulder) onto the star axis — maximise → minimise −proj
    const proj = hand.clone().sub(base.sh).dot(dir);
    // pointing: brush tip must stay roughly on the line hand → star (soft, one-sided)
    const aim = tip.clone().sub(hand).normalize();
    const toStar = starV.clone().sub(hand).normalize();
    const ang = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(aim.dot(toStar), -1, 1)));
    return -proj + 0.03 * Math.pow(Math.max(0, ang - 10), 2) * 0.01;
  };
  let best = { px: 0, py: 0, pz: 0, ex: 0, v: evaluate(0, 0, 0, 0) };
  const sweep = (cx, cy, cz, ce, step) => {
    for (const px of [cx - step, cx, cx + step]) for (const py of [cy - step, cy, cy + step])
      for (const pz of [cz - step, cz, cz + step]) for (const ex of [ce - step, ce, ce + step]) {
        const v = evaluate(px, py, pz, ex);
        if (v < best.v) best = { px, py, pz, ex, v };
      }
  };
  for (const s of [0.8, 0.4, 0.2, 0.1, 0.05, 0.02]) sweep(best.px, best.py, best.pz, best.ex, s);
  A.pivot.rotation.set(base.px + best.px, base.py + best.py, base.pz + best.pz);
  A.elbow.rotation.x = base.ex + best.ex;
  artist.group.updateMatrixWorld(true);
  const hand = worldOf(A.hand);
  const tip = worldOf(A.tool.children[2]);
  const ang = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(tip.clone().sub(hand).normalize().dot(starV.clone().sub(hand).normalize()), -1, 1)));
  const reach = hand.clone().sub(base.sh).dot(dir);
  console.log(`  dbg: sh ${base.sh.toArray().map((n) => n.toFixed(3))} |sh→star| ${base.sh.distanceTo(STAR.position).toFixed(3)} |sh→hand| ${base.sh.distanceTo(hand).toFixed(3)} hand ${hand.toArray().map((n) => n.toFixed(3))}`);
  console.log(`SOLVED catchArm: pivotX ${best.px.toFixed(3)}, pivotY ${best.py.toFixed(3)}, pivotZ ${best.pz.toFixed(3)}, elbowX ${best.ex.toFixed(3)}`);
  console.log(`  hand→star ${hand.distanceTo(STAR.position).toFixed(3)}m (was ${d0.toFixed(3)})  extension along star axis ${reach.toFixed(3)}m  aim error ${ang.toFixed(1)}°  tip→star ${tip.distanceTo(STAR.position).toFixed(3)}m`);
  Object.assign(FALL_POSE.catchArm, zero);
  process.exit(0);
}

// ── states along the fall ──
for (const p of [0.02, 0.075, 0.11, 0.15, 0.3, 0.6, 1]) {
  const s4 = run(tFor(p), 900);
  const head = worldOf(artist.parts.head);
  const disp = (fall.floor.right.position.x - fall.floor.left.position.x) / 2 - 56; // half-rift travel
  console.log(
    `p ${p.toFixed(3)}  camY ${camera.position.y.toFixed(2)} fov ${camera.fov.toFixed(1)}  artistY ${artist.figure.position.y.toFixed(2)}  ` +
    `head ndc ${ndc(head)}  rift/2 ${disp.toFixed(2)}m sink ${fall.floor.left.position.y.toFixed(2)}m rot ${(THREE.MathUtils.radToDeg(fall.floor.left.rotation.z)).toFixed(1)}°  ` +
    `flare ${s4.flare.toFixed(2)}  starOp ${star.layers.halo.material.opacity.toFixed(2)} starL ${star.light.intensity.toFixed(2)}  lights×${(layers.key.intensity / 1.5).toFixed(2)}`
  );
}

// ── monotonic descent: the depth curve always; camera y after the shake window ends ──
{
  let mono = true, monoCam = true, prevD = -1, prevY = Infinity;
  run(tFor(0), 900);
  for (let i = 0; i <= 100; i++) {
    const s4 = run(tFor(i / 100), 300);
    if (s4.camDepth < prevD - 1e-12) mono = false;
    prevD = s4.camDepth;
    if (i / 100 > 0.34) {
      if (camera.position.y > prevY + 1e-9) monoCam = false;
      prevY = camera.position.y;
    }
  }
  console.log('camDepth monotonic:', mono, '| camera y monotonic after shake (p>.34):', monoCam, '| final camY', camera.position.y.toFixed(2));
}

// ── reversibility: 0 → 1 → 0 through the real pipeline, exact float compare ──
const before = run(tFor(0), 900) && snap();
run(tFor(1), 1200);
const after = run(tFor(0), 2000) && snap();
const same = JSON.stringify(before) === JSON.stringify(after);
console.log('reversal exact:', same ? 'IDENTICAL' : 'DRIFT');
if (!same) {
  const a = before, b = after;
  for (const k of Object.keys(a)) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) console.log(`  ${k}: ${JSON.stringify(a[k])} vs ${JSON.stringify(b[k])}`);
}
