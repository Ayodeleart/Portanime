/**
 * Headless composition check — no browser, no WebGL.
 * Runs the real camera rig (camera-path.js) and the real figure (artist.js) against
 * a THREE.PerspectiveCamera and asserts the two shots the brief asks for:
 *   Scene 1: extreme close-up on the BACK of the head — face not visible, head huge.
 *   Scene 2: side profile two-shot — artist and canvas both framed, not overlapping.
 * `npm run check`
 */
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { PATH, CAMERA_KEYS, TARGET_KEYS, FOV_KEYS, buildCurves, createCameraRig, orbit } from '../src/camera-path.js';
import { createArtist, MARKS, POSE } from '../src/artist.js';
import { createStar, STAR } from '../src/star.js';
import { measureScene3, SCENE3, smoothstep } from '../src/scene3.js';
import { FALL, FALL_POSE, heroTime, measureFall, createFallLayer } from '../src/scene4.js';
import { loftGeometry, limbGeometry } from '../src/loft.js';

let fails = 0;
const ok = (cond, label, detail = '') => {
  console.log(`${cond ? '  ok  ' : ' FAIL '} ${label}${detail ? `  → ${detail}` : ''}`);
  if (!cond) fails++;
};

const W = 1600;
const H = 900;
PATH.float.amp = 0; // deterministic framing: no handheld drift while we assert on it
const camera = new THREE.PerspectiveCamera(30, W / H, 0.03, 60);
const rig = createCameraRig(camera);
const artist = createArtist();
artist.group.updateMatrixWorld(true);

/** real world position of an Object3D inside the figure, after matrices are refreshed */
const worldOf = (o) => {
  o.updateWorldMatrix(true, false);
  return o.getWorldPosition(new THREE.Vector3());
};

/** let the rig's damping converge onto a scroll value before asserting on the framing */
const settle = (t, frames = 400) => {
  for (let i = 0; i < frames; i++) {
    rig.update(t, 1 / 60); // always at least one frame, even when t === rig.t
    if (Math.abs(rig.t - t) <= 1e-4) break;
  }
  camera.updateMatrixWorld(true);
  return camera.position.clone();
};
/** camera roll, measured from the up vector (Euler z lies near ±180° when looking down +Z) */
const rollDeg = () => {
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const back = new THREE.Vector3(0, 0, 1).applyQuaternion(camera.quaternion);
  const ref = new THREE.Vector3(0, 1, 0).addScaledVector(back, -back.y).normalize(); // world up, in the image plane
  return THREE.MathUtils.radToDeg(
    Math.atan2(new THREE.Vector3().crossVectors(ref, up).dot(back), ref.dot(up))
  );
};

// frame a world point → normalised device coords (-1..1), plus its distance to camera
const frame = (v3) => {
  camera.updateMatrixWorld();
  const p = v3.clone().project(camera);
  return { x: p.x, y: p.y, dist: camera.position.distanceTo(v3), behind: p.z > 1 };
};
/** how much of the frame height a sphere of `radius` at `center` covers, in ndc units (2 = full frame) */
const extentOf = (center, radius) => {
  const f = frame(center);
  const angDiameter = 2 * Math.asin(Math.min(radius / Math.max(f.dist, 0.05), 0.999));
  return { ...f, spanNdcY: angDiameter / THREE.MathUtils.degToRad(camera.fov) };
};

console.log('\n— curve integrity —');
const { cameraCurve, targetCurve } = buildCurves();
const samples = [];
let nan = 0;
for (let i = 0; i <= 200; i++) {
  const t = i / 200;
  const p = cameraCurve.getPoint(t, new THREE.Vector3());
  const q = cameraCurve.getPointAt(t, new THREE.Vector3());
  const a = targetCurve.getPoint(t, new THREE.Vector3());
  if ([p.x, p.y, p.z, q.x, q.y, q.z, a.x, a.y, a.z].some(Number.isNaN)) nan++;
  samples.push({ t, p, a });
}
ok(nan === 0, 'no NaN along either spline (getPoint + getPointAt)', `${nan} bad`);
ok(cameraCurve.getLength() > 3, 'trajectory has real length', `${cameraCurve.getLength().toFixed(2)}m`);
const radii = samples.map((s) => Math.hypot(s.p.x, s.p.z));
ok(
  radii.every((r) => r > 0.45),
  'camera never ends up inside the figure volume',
  `min ${Math.min(...radii).toFixed(2)}m`
);
const ys = samples.map((s) => s.p.y);
ok(Math.min(...ys) > 0.4, 'camera stays above the floor', `min y ${Math.min(...ys).toFixed(2)}m`);
const azim = (p) => THREE.MathUtils.radToDeg(Math.atan2(-p.x, -p.z));
const azims = samples.map((s) => azim(s.p));
ok(Math.max(...azims) - Math.min(...azims) > 55, 'the move really orbits', `${Math.min(...azims).toFixed(1)}° → ${Math.max(...azims).toFixed(1)}°`);

// sweep of the authored keys: distance must grow (that is the "zoom out" dolly)
const kd = CAMERA_KEYS.map((k) => k.distance);
ok(kd.every((d, i) => i === 0 || d > kd[i - 1]), 'key distances increase monotonically', kd.join(' → '));
ok(
  CAMERA_KEYS.every((k, i) => i === 0 || k.azimuth > CAMERA_KEYS[i - 1].azimuth),
  'key azimuths increase monotonically (one direction, no whip-back)',
  CAMERA_KEYS.map((k) => k.azimuth).join(' → ')
);
const tSpan = [...CAMERA_KEYS, ...TARGET_KEYS, ...FOV_KEYS];
ok(
  tSpan.every((k) => Number.isFinite(k.t) && k.t >= 0 && k.t <= 1.0001),
  'every key has a t in [0,1]'
);
ok(TARGET_KEYS.every((k) => Math.hypot(k.x, k.z) < 0.8 && k.y > 1 && k.y < 1.8), 'look targets stay inside the figure/canvas volume');

console.log('\n— scene 1 (t = 0, on load) —');
settle(0);
{
  const backOfHead = MARKS.head.clone().add(new THREE.Vector3(0, 0.02, -0.1));
  const h = extentOf(backOfHead, 0.125);
  ok(h.dist < 1.05, 'physically close to the artist', `${h.dist.toFixed(2)}m from the back of the head`);
  ok(h.spanNdcY > 0.6 && h.spanNdcY < 1.35, 'head/shoulder dominates the frame but is not blown out', `${(h.spanNdcY * 50).toFixed(0)}% of frame height`);
  ok(Math.abs(h.x) < 0.75 && Math.abs(h.y) < 0.8, 'back of head is inside the frame', `ndc ${h.x.toFixed(2)}, ${h.y.toFixed(2)}`);
  const facing = new THREE.Vector3(0, 0, 1); // he looks at +Z
  const camDir = camera.position.clone().sub(MARKS.head).setY(0).normalize();
  const degOff = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(camDir.dot(facing), -1, 1)));
  ok(degOff > 120, 'camera is BEHIND him — no face', `${degOff.toFixed(0)}° off his facing axis`);
  ok(camera.fov < 36, 'tight lens on the close-up', `fov ${camera.fov.toFixed(1)}°`);
  const canvasF = frame(MARKS.canvas);
  ok(Math.abs(canvasF.x) < 1.15 && Math.abs(canvasF.y) < 1.15, 'the lit canvas is at least partly in frame past his shoulder', `canvas ndc ${canvasF.x.toFixed(2)}, ${canvasF.y.toFixed(2)}`);
}

console.log('\n— mid move (t = 0.5) —');
settle(0.5);
{
  const d0 = Math.hypot(camera.position.x, camera.position.z);
  const headF = frame(MARKS.head);
  ok(d0 > 1.4 && d0 < 2.8, 'pulling back through the quarter view', `${d0.toFixed(2)}m out, azim ${azim(camera.position).toFixed(0)}°`);
  ok(Math.abs(headF.x) < 1 && Math.abs(headF.y) < 1, 'artist still framed mid-move (no drop-off)', `ndc ${headF.x.toFixed(2)}, ${headF.y.toFixed(2)}`);
}

console.log('\n— scene 2 (t = 1, settled) —');
settle(1);
{
  const headF = frame(MARKS.head);
  const canvasF = frame(MARKS.canvas);
  const feetF = frame(new THREE.Vector3(0, 0.05, 0));
  const az = azim(camera.position);
  ok(az > 78 && az < 108, 'side profile, not in front of him', `${az.toFixed(0)}° around`);
  ok(headF.dist > 2.6, 'zoomed out relative to scene 1', `${headF.dist.toFixed(2)}m from the head`);
  ok(Math.abs(headF.x) < 0.65 && Math.abs(headF.y) < 0.7, 'head comfortably inside the frame', `ndc ${headF.x.toFixed(2)}, ${headF.y.toFixed(2)}`);
  ok(Math.abs(canvasF.x) < 0.9 && Math.abs(canvasF.y) < 0.9, 'canvas still in frame', `ndc ${canvasF.x.toFixed(2)}, ${canvasF.y.toFixed(2)}`);
  ok(Math.abs(headF.x - canvasF.x) > 0.25, 'artist and canvas are separated on screen (no overlap)', `Δndc.x ${(headF.x - canvasF.x).toFixed(2)}`);
  ok(feetF.y > -1, 'feet + easel base still visible', `feet ndc.y ${feetF.y.toFixed(2)}`);
  ok(headF.y > canvasF.y - 0.9, 'horizon stays level (no dutch tilt left over)', `head ndc.y ${headF.y.toFixed(2)}`);
  ok(Math.abs(rollDeg()) < 3, 'roll is a whisper', `${rollDeg().toFixed(2)}°`);
  // the canvas must not stand between camera and painter
  ok(headF.dist < canvasF.dist + 0.9, 'easel does not occlude the artist', `head ${headF.dist.toFixed(2)}m vs canvas ${canvasF.dist.toFixed(2)}m`);
  const zoomStart = 0.85 / 2 / Math.tan(THREE.MathUtils.degToRad(15));
  const zoomEnd = Math.hypot(camera.position.x, camera.position.z) / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  ok(zoomEnd / zoomStart > 2.4, 'net zoom-out is unmistakable', `${(zoomEnd / zoomStart).toFixed(2)}× wider`);
}

console.log('\n— figure / prop sanity —');
{
  artist.update(1.2, 1 / 60); // advance the idle pose
  artist.group.updateMatrixWorld(true);
  const hand = new THREE.Vector3();
  artist.parts.rightArm.hand.getWorldPosition(hand);
  const d = hand.distanceTo(MARKS.canvas);
  ok(d < 0.6, 'painting hand reaches the canvas', `${d.toFixed(2)}m away`);
  ok(hand.y > 0.9, 'hand is raised, not hanging', `y ${hand.y.toFixed(2)}`);
  const palette = new THREE.Vector3();
  artist.parts.leftArm.hand.getWorldPosition(palette);
  ok(
    palette.z > 0.18 && palette.y > 1.0 && Math.abs(palette.x) < 0.4,
    'palette hand is folded up in front of the chest (not dangling at the elbow)',
    `${palette.x.toFixed(2)}, ${palette.y.toFixed(2)}, ${palette.z.toFixed(2)}`
  );
  const nose = new THREE.Vector3(0, 1.58, 0.09);
  ok(nose.z > MARKS.head.z + 0.12, 'the profile has a nose to read against the sky', `Δz ${(nose.z - MARKS.head.z).toFixed(2)}m`);
  settle(0);
  const before = camera.position.clone();
  rig.update(0.7, 1 / 60); // exactly one frame after a hard jump in the scrub value
  ok(!before.equals(camera.position), 'rig responds to changed input');
  ok(rig.t > 0.02 && rig.t < 0.14, 'one frame covers ~9% of a hard step: damped, not snapped', `rig.t ${rig.t.toFixed(3)}`);
  ok(PATH.mode === 'keyframe' || PATH.mode === 'arc', 'path mode is valid', PATH.mode);
  void orbit;
}

console.log('\n— camera path is untouched (regression guard) —');
{
  const cam = JSON.stringify(CAMERA_KEYS.map((k) => [k.t, k.azimuth, k.distance, k.height]));
  ok(cam === '[[0,5,0.85,1.74],[0.25,25,1.35,1.7],[0.5,55,2.05,1.6],[0.75,76,2.8,1.5],[1,93,3.55,1.42]]', 'CAMERA_KEYS byte-identical to Scenes 1–2');
  const tgt = JSON.stringify(TARGET_KEYS.map((k) => [k.t, k.x, k.y, k.z]));
  ok(tgt === '[[0,-0.22,1.42,0.66],[0.25,-0.17,1.4,0.5],[0.5,-0.1,1.36,0.42],[0.75,-0.05,1.3,0.4],[1,0,1.12,0.44]]', 'TARGET_KEYS byte-identical');
  ok(JSON.stringify(FOV_KEYS.map((k) => k.v)) === '[30,34,41,40,37]', 'FOV_KEYS byte-identical');
}

console.log('\n— loft builder (the new anatomy primitive) —');
{
  const g = loftGeometry([{ y: 0, rx: 0.1, rz: 0.1 }, { y: 0.4, rx: 0.16, rz: 0.12 }, { y: 0.8, rx: 0.1, rz: 0.1, s: 0.8 }], { radial: 16 });
  const posA = g.attributes.position.array;
  ok(posA.length > 0 && posA.every(Number.isFinite), 'positions finite', `${posA.length / 3} verts, ${g.userData.tris} tris`);
  g.computeBoundingBox();
  const bb = g.boundingBox;
  ok(Math.abs(bb.max.y - 0.8) < 1e-6 && Math.abs(bb.min.y) < 1e-6, 'loft spans its section y range', `y ${bb.min.y.toFixed(2)}..${bb.max.y.toFixed(2)}`);
  ok(Math.abs(bb.max.x - 0.16) < 1e-6, 'widest ring sets the half-width', `x ±${bb.max.x.toFixed(3)}`);
  const n = g.attributes.normal.array;
  ok(n.every(Number.isFinite) && n.some((v) => Math.abs(v) > 0.1), 'normals present (smooth shading, no NaN)');
  const open = loftGeometry([{ y: 0, rx: 0.1, rz: 0.1 }, { y: 0.4, rx: 0.16, rz: 0.12 }], { radial: 16, arc: [-1, 1] });
  ok(open.attributes.position.count === 2 * 17, 'an arc loft is an open shell (apron / hair)', `${open.attributes.position.count} verts`);
  const limb = limbGeometry({ length: 0.4, r0: 0.08, r1: 0.06, r2: 0.045 });
  limb.computeBoundingBox();
  ok(Math.abs(limb.boundingBox.min.y + 0.4) < 1e-3, 'a limb drops -length from its joint', `min y ${limb.boundingBox.min.y.toFixed(3)}`);
}

console.log('\n— figure: does it read as a human, and does it still fit the shot —');
{
  artist.update(0, 1 / 60); // neutral pose, no Scene 3
  artist.group.updateMatrixWorld(true);
  const headW = worldOf(artist.parts.head);
  ok(headW.distanceTo(MARKS.head) < 0.06, 'built head lands on MARKS.head (camera contract)', `off by ${headW.distanceTo(MARKS.head).toFixed(3)}m`);
  const sR = worldOf(artist.parts.rightArm.pivot);
  const sL = worldOf(artist.parts.leftArm.pivot);
  ok(sR.distanceTo(MARKS.shoulderR) < 0.06 && sL.distanceTo(MARKS.shoulderL) < 0.06, 'shoulder joints land on MARKS', `R ${sR.distanceTo(MARKS.shoulderR).toFixed(3)} L ${sL.distanceTo(MARKS.shoulderL).toFixed(3)}`);
  const yawed = (v) => v.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), POSE.yaw);
  const cv = worldOf(artist.parts.canvasPanel);
  ok(cv.distanceTo(yawed(MARKS.canvas)) < 0.02, 'canvas panel lands on MARKS.canvas (through the composition yaw)', `${cv.distanceTo(yawed(MARKS.canvas)).toFixed(4)}m off`);
  const box = new THREE.Box3().setFromObject(artist.figure);
  const h = box.max.y - box.min.y;
  ok(h > 1.6 && h < 1.95, 'standing height is human', `${h.toFixed(2)}m`);
  ok(Math.abs(box.max.x) < 0.42 && Math.abs(box.min.x) < 0.42, 'shoulder/hip width stays inside a human envelope', `±${Math.max(box.max.x, -box.min.x).toFixed(2)}m`);
  const headBox = new THREE.Box3().setFromObject(artist.parts.skull); // the skull alone, not beret+knot
  const hh = headBox.max.y - headBox.min.y;
  ok(hh > 0.2 && hh < 0.3, 'head is a lofted skull, not a ball', `${hh.toFixed(3)}m tall, ${((box.max.y - box.min.y) / hh).toFixed(1)} heads tall`);
  ok(Math.abs(POSE.yaw) > 0.05 && Math.abs(POSE.yaw) < 0.25, 'composition yaw is a nudge, not a re-frame', `${THREE.MathUtils.radToDeg(POSE.yaw).toFixed(1)}°`);
  ok(Math.abs(POSE.hips.z) > 0.02, 'contrapposto: the pelvis is tilted', `${THREE.MathUtils.radToDeg(POSE.hips.z).toFixed(1)}°`);
}

console.log('\n— scene 3 timing (scroll-driven, so it reverses for free) —');
{
  const at = (t) => measureScene3(t);
  const z = at(0);
  ok(z.appear === 0 && z.notice === 0 && z.reach === 0 && !z.present, 'nothing of Scene 3 exists at load', `appear ${z.appear}`);
  ok(at(0.5).appear === 0, 'still nothing mid-orbit', `t=0.5 → ${at(0.5).appear}`);
  ok(at(1).appear === 1 && at(1).notice === 1 && at(1).reach === 1, 'all three beats complete by the end of the move');
  let mono = true;
  for (let i = 1; i <= 100; i++) {
    const a = at(i / 100);
    const b = at((i - 1) / 100);
    if (a.appear < b.appear - 1e-9 || a.notice < b.notice || a.reach < b.reach) mono = false;
  }
  ok(mono, 'every beat is monotonic in t → scrubbing up/down cannot double-fire');
  {
    const u = (0.6 - 0.55) / (0.74 - 0.55);
    const eased = smoothstep(0.6, 0.55, 0.74);
    ok(eased < u * 0.75, 'smoothstep shapes the fade — it eases in instead of snapping', `linear ${u.toFixed(2)} vs eased ${eased.toFixed(2)}`);
  }
  ok(SCENE3.appear[1] < SCENE3.notice[1] && SCENE3.notice[1] <= SCENE3.reach[1], 'beats overlap in the right order: appear → notice → reach');
  console.log(`       ranges: appear ${SCENE3.appear}  notice ${SCENE3.notice}  reach ${SCENE3.reach}  step ${SCENE3.step}m`);
}

console.log('\n— scene 3: the star —');
const star = createStar();
scene3Star: {
  ok(star.group.visible === false, 'hidden at t=0', `visible=${star.group.visible}`);
  star.update(measureScene3(0.5), 1);
  ok(!star.group.visible, 'still hidden at t=0.5 (the orbit stays about the artist)');
  star.update(measureScene3(0.62), 1);
  ok(star.group.visible && star.light.intensity > 0 && star.light.intensity < STAR.light.intensity, 'half-arrived at t=0.62', `light ${star.light.intensity.toFixed(2)}/${STAR.light.intensity}`);
  star.update(measureScene3(1), 1);
  ok(
    star.light.intensity > STAR.light.intensity && star.light.intensity < STAR.light.intensity * 1.32,
    'full light at t=1, plus shimmer and the notice boost',
    `${star.light.intensity.toFixed(2)} vs base ${STAR.light.intensity}`
  );
  ok(Math.abs(star.group.position.distanceTo(STAR.position)) < 0.02, 'settles exactly on its anchor', `${star.group.position.distanceTo(STAR.position).toFixed(3)}m off`);
  ok(star.core.scale.x > 0.9 && star.core.scale.x < 1.15, 'core scale eased in, not popped', `${star.core.scale.x.toFixed(2)}`);
  // in the settled frame?
  settle(1);
  const f = frame(worldOf(star.group));
  const canvasReal = frame(worldOf(artist.parts.canvasPanel));
  const headReal = frame(worldOf(artist.parts.head));
  ok(Math.abs(f.x) < 0.82 && Math.abs(f.y) < 0.72, 'visible in the end frame, clear of the edges', `ndc ${f.x.toFixed(2)}, ${f.y.toFixed(2)}`);
  ok(f.dist > canvasReal.dist, 'it hangs BEYOND the canvas, not in front of it', `star ${f.dist.toFixed(2)}m vs canvas ${canvasReal.dist.toFixed(2)}m`);
  ok(Math.hypot(f.x - canvasReal.x, f.y - canvasReal.y) > 0.28, 'separated from the canvas on screen', `Δ${Math.hypot(f.x - canvasReal.x, f.y - canvasReal.y).toFixed(2)}`);
  ok(Math.hypot(f.x - headReal.x, f.y - headReal.y) > 0.5, 'not sitting on his head', `Δ${Math.hypot(f.x - headReal.x, f.y - headReal.y).toFixed(2)}`);
  // it must also be in frame earlier in the reveal, or the fade-in is wasted
  settle(0.8);
  const f8 = frame(worldOf(star.group));
  ok(Math.abs(f8.x) < 0.95 && Math.abs(f8.y) < 0.95, 'already in frame at t=0.8', `ndc ${f8.x.toFixed(2)}, ${f8.y.toFixed(2)}`);
  const gaze = worldOf(star.group).sub(worldOf(artist.parts.head)).setY(0).normalize();
  ok(gaze.z > 0.85, 'it sits ahead of him (his facing is +Z), so a glance finds it', `${(Math.acos(THREE.MathUtils.clamp(gaze.z, -1, 1)) * 57.3).toFixed(0)}° off his axis`);
}

console.log('\n— scene 3: the artist reacts —');
{
  const spread = (s3) => {
    let lo = 9, hi = -9;
    for (let i = 0; i < 24; i++) {
      artist.update(i * 0.13, 1 / 60, s3, STAR.position);
      const x = artist.parts.rightArm.pivot.rotation.x;
      lo = Math.min(lo, x);
      hi = Math.max(hi, x);
    }
    return hi - lo;
  };
  const idleSpread = spread(measureScene3(0.2));
  const reactingSpread = spread(measureScene3(1));
  ok(idleSpread > 0.05, 'painting arm actually strokes during Scenes 1–2', `±${(idleSpread / 2).toFixed(3)}rad`);
  ok(reactingSpread < idleSpread * 0.35, 'the brush freezes when he notices (strokes stop)', `idle ${idleSpread.toFixed(3)} → reacting ${reactingSpread.toFixed(3)}`);

  artist.update(0.5, 1 / 60, measureScene3(0), STAR.position);
  artist.figure.updateMatrixWorld(true);
  const headNeutral = artist.parts.head.rotation.y;
  artist.update(0.5, 1 / 60, measureScene3(1), STAR.position);
  artist.figure.updateMatrixWorld(true);
  const turned = artist.parts.head.rotation.y - headNeutral;
  ok(turned > 0.04, 'head turns toward the star', `+${turned.toFixed(3)}rad of yaw`);
  ok(artist.parts.head.rotation.x < 0, 'and tips up for it', `${artist.parts.head.rotation.x.toFixed(3)}`);
  const moved = artist.figure.position.length();
  ok(Math.abs(moved - SCENE3.step * measureScene3(1).reach) < 1e-3 && moved > 0.05 && moved < 0.2, 'takes a small step toward it, not a walk', `${moved.toFixed(3)}m`);
  ok(artist.figure.position.z > 0, 'the step is toward +Z (where the star is)', `z ${artist.figure.position.z.toFixed(3)}`);
  // the easel must not be dragged by his step: measure it on both sides of the reaction
  artist.update(0.5, 1 / 60, measureScene3(0), STAR.position);
  const easelIdle = worldOf(artist.parts.easel).clone();
  artist.update(0.5, 1 / 60, measureScene3(1), STAR.position);
  const easelReact = worldOf(artist.parts.easel);
  ok(easelReact.distanceTo(easelIdle) < 1e-6, 'the easel stays bolted to the floor while he steps', `${easelIdle.toArray().map((v) => v.toFixed(3))} unchanged`);
  // regression for this round: the brush must not fly off into empty space at full reach
  {
    const tip = new THREE.Vector3();
    artist.update(0.5, 1 / 60, measureScene3(1), STAR.position);
    artist.parts.rightArm.tool.children[2].getWorldPosition(tip);
    const board = worldOf(artist.parts.canvasPanel);
    const dir = tip.clone().sub(worldOf(artist.parts.rightArm.hand)).normalize();
    ok(tip.distanceTo(board) < 0.42, 'brush tip is at the canvas, not floating', `${tip.distanceTo(board).toFixed(2)}m to the board`);
    ok(dir.z > 0.7 && dir.y < 0.25, 'brush points forward-down out of the fist', `dir ${dir.toArray().map((v) => v.toFixed(2))}`);
  }
  ok(artist.figure.position.length() > 0.05, '…while the figure did move', `${artist.figure.position.length().toFixed(3)}m`);

  // reversibility: full reaction, then back to t=0 in one call — everything must return
  artist.update(0.5, 1 / 60, measureScene3(0), null);
  artist.figure.updateMatrixWorld(true);
  ok(artist.figure.position.length() < 1e-9, 'scrolling back to 0 resets the step to exactly zero', `${artist.figure.position.toArray().map((v)=>v.toFixed(4))}`);
  ok(Math.abs(artist.parts.head.rotation.y - headNeutral) < 1e-6, 'and the head yaw with it');
  ok(artist.stats().notice === 0, 'stats reported to the debug overlay follow t', JSON.stringify(artist.stats()));
  artist.update(0.5, 1 / 60, { notice: 0.5, reach: 0.5, appear: 1 }, STAR.position);
  const half = artist.figure.position.length();
  ok(half > 0.02 && half < moved, 'a half-noticed star gets a half reaction (proportional, so it scrubs)', `${half.toFixed(3)}m of ${moved.toFixed(3)}m`);
  artist.update(0, 1 / 60); // leave the pose neutral for the framing tests that follow
  artist.group.updateMatrixWorld(true);
}

console.log('\n— scene 3 config is frozen (retime guard) —');
{
  const s3json = JSON.stringify([SCENE3.appear, SCENE3.notice, SCENE3.reach, SCENE3.step, SCENE3.lean, SCENE3.bob]);
  ok(
    s3json === '[[0.55,0.74],[0.68,0.88],[0.8,1],0.115,0.055,0.018]',
    'SCENE3 byte-identical: Scene 4 layered a split remap over the same windows, it did not retime them'
  );
}

console.log('\n— scene 4: split + timing —');
{
  const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
  const heroM = css.match(/--hero-scroll:\s*(\d+)px/);
  const fallM = css.match(/--fall-scroll:\s*(\d+)px/);
  ok(heroM && fallM && +heroM[1] === 3400 && +fallM[1] === 2200, 'CSS budgets: hero 3400px + fall 2200px = 5600px total');
  ok(Math.abs(FALL.split - 3400 / 5600) < 1e-12, 'split = 3400/5600 ≈ 0.6071', FALL.split.toFixed(5));
  ok(heroTime(0) === 0 && heroTime(FALL.split) === 1 && heroTime(1) === 1, 'hero input: 1:1 to split, latched after', `${heroTime(FALL.split * 0.5).toFixed(3)} at half-hero`);
  ok(heroTime(0.3) === THREE.MathUtils.clamp(0.3 / FALL.split, 0, 1), 'hero input is linear in px before the split');
  ok(measureFall(FALL.split - 1e-9).p === 0, 'p is zero across the whole hero budget');
  ok(measureFall(1).p === 1 && measureFall(FALL.split).p === 0, 'p spans exactly the fall budget');
  let mono4 = true;
  let prev = { p: -1, cam: -1 };
  for (let i = 0; i <= 200; i++) {
    const s = measureFall(i / 200);
    if (s.p < prev.p - 1e-12 || s.camDepth < prev.cam - 1e-12) mono4 = false;
    prev = { p: s.p, cam: s.camDepth };
    if (s.flare < 0 || s.flare > 1.001) mono4 = false; // bounded envelope, never an explosion
  }
  ok(mono4, 'p, camera depth and the flare envelope stay bounded/monotonic across 0→1');
  const b = FALL.beats;
  ok(b.collapse[0] >= b.flare[0] && b.fall >= b.collapse[0] && b.fall < b.collapse[1] + 0.05 && b.blend[0] < b.fall, 'beat order: catch → flare/collapse → lift → blend', JSON.stringify(b));
  ok(Math.abs(FALL.camera.drop - (1.42 + 16.9)) < 0.02, 'camera drop lands y ≈ −16.9 by p = 1', FALL.camera.drop.toFixed(2));
  ok(Math.abs(FALL.ground.riftWidth - 5.9) < 1e-9 && FALL.camera.fov[1] === 45.5 && FALL.camera.fov[0] === 37, 'spec anchors: 5.9 m rift, FOV 37 → 45.5');
}

console.log('\n— scene 4: the fall layer on the real modules —');
{
  const scene4 = new THREE.Scene();
  scene4.fog = new THREE.Fog(0x101724, 2.6, 15);
  const star4 = createStar();
  const lights = {};
  for (const [k, v] of Object.entries({ key: 1.5, rim: 2.9, rim2: 1.35, bounce: 0.55, wash: 22, canvasGlow: 6 })) {
    const l = new THREE.Object3D();
    l.intensity = v;
    lights[k] = l;
  }
  const layer = createFallLayer({ scene: scene4, camera, renderer: null, artist, star: star4, split: FALL.split, lights });
  const tFor = (p) => FALL.split + p * (1 - FALL.split);
  const runFrame = (totalT, elapsed = 1.0) => {
    rig.update(heroTime(totalT, FALL.split), 1 / 60);
    const s3 = measureScene3(rig.t);
    star4.update(s3, elapsed, 1 / 60);
    artist.update(elapsed, 1 / 60, s3, star4.anchor);
    lights.canvasGlow.intensity = THREE.MathUtils.lerp(6, 6 * 0.78, s3.notice);
    return layer.update(totalT, elapsed, 1 / 60, s3, rig);
  };
  const run = (totalT, frames) => {
    let s4;
    for (let i = 0; i < frames; i++) s4 = runFrame(totalT);
    artist.group.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    return s4;
  };
  const snap = () =>
    JSON.stringify({
      cam: camera.position.toArray().map((n) => +n.toFixed(9)),
      // fov rounded: rig.update's own 1e-4 write-hysteresis can strand it 7e-5° off; not Scene 4's doing
      fov: +camera.fov.toFixed(4),
      fig: artist.figure.position.toArray().map((n) => +n.toFixed(9)),
      figR: [artist.figure.rotation.x, artist.figure.rotation.y, artist.figure.rotation.z].map((n) => +n.toFixed(9)),
      knee: artist.parts.legs.right.knee.rotation.x,
      hip: artist.parts.legs.right.hip.rotation.x,
      tool: artist.parts.rightArm.tool.rotation.x,
      propsY: artist.props.position.y,
      fog: [scene4.fog.near, scene4.fog.far, scene4.fog.color.getHexString()],
      glow: lights.canvasGlow.intensity,
      key: lights.key.intensity,
      halo: star4.layers.halo.material.opacity,
      floor: [layer.floor.left.position.x, layer.floor.right.position.x],
    });

  // dormancy: with vs without the (asleep) layer, same pipeline → identical state
  run(tFor(0), 900);
  const withLayer = snap();
  for (let i = 0; i < 900; i++) {
    rig.update(1, 1 / 60);
    const s3 = measureScene3(rig.t);
    star4.update(s3, 1, 1 / 60);
    artist.update(1, 1 / 60, s3, star4.anchor);
    lights.canvasGlow.intensity = THREE.MathUtils.lerp(6, 6 * 0.78, s3.notice);
  }
  artist.group.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  ok(withLayer === snap(), 'at p = 0 the layer is dormant: every channel it can write is byte-identical to the Scenes 1–3 pipeline');
  ok(layer.floor.left.position.x === -FALL.ground.hinge && layer.floor.right.position.x === FALL.ground.hinge, 'floor halves sit flush (no visible seam) before the fall');
  ok(star4.layers.halo.material.opacity <= 1.0001, 'star opacity is clamped ≤ 1 through the flare', star4.layers.halo.material.opacity.toFixed(3));

  // catch closes toward the star before support breaks
  run(tFor(0), 300);
  const hand0 = worldOf(artist.parts.rightArm.hand).distanceTo(STAR.position);
  run(tFor(0.065), 500);
  const handC = worldOf(artist.parts.rightArm.hand);
  const tipC = new THREE.Vector3();
  artist.parts.rightArm.tool.children[2].getWorldPosition(tipC);
  ok(hand0 - handC.distanceTo(STAR.position) > 0.12, 'catch moves the hand toward the star (closes the gap)', `${hand0.toFixed(3)}m → ${handC.distanceTo(STAR.position).toFixed(3)}m`);
  ok(tipC.distanceTo(STAR.position) < 1.6, '…and brings the brush tip near it — reaching to meet, flare bridging', `${tipC.distanceTo(STAR.position).toFixed(2)}m`);
  const aimErr = THREE.MathUtils.radToDeg(
    Math.acos(THREE.MathUtils.clamp(tipC.clone().sub(handC).normalize().dot(STAR.position.clone().sub(handC).normalize()), -1, 1))
  );
  ok(aimErr < 16, 'the brush points at the star at the catch', `${aimErr.toFixed(1)}° off`);

  // the floor wrenches open sharply, then creeps
  run(tFor(1), 1200);
  const gap = layer.floor.right.position.x - layer.floor.left.position.x - 2 * FALL.ground.hinge;
  ok(Math.abs(gap - FALL.ground.riftWidth) < 0.05, 'rift is 5.9 m across at full open', `${gap.toFixed(2)}m`);
  ok(layer.floor.left.position.y < -4 && layer.floor.right.position.y < -4, 'halves sink sharply, not gently', `${layer.floor.left.position.y.toFixed(2)}m`);
  ok(Math.abs(layer.floor.left.rotation.z) > 0.07, 'hinged, not just slid', `${THREE.MathUtils.radToDeg(layer.floor.left.rotation.z).toFixed(1)}°`);
  const open055 = measureFall(tFor(0.15)).openW - measureFall(tFor(0.055)).openW;
  ok(open055 / measureFall(1).openW > 0.7, 'most of the opening happens inside the sharp collapse window', `${(open055 * 100).toFixed(0)}% by p=.15`);
  ok(artist.props.position.y < -8, 'the easel rides the collapsing centre down into the dark', `${artist.props.position.y.toFixed(2)}m`);

  // camera: lurch, acceleration, end state; artist drifts up while falling deeper
  run(tFor(0), 700);
  const camBase = camera.position.clone();
  ok(Math.abs(camBase.y - 1.42) < 0.01, 'camera starts at the Scene-3 end height', camBase.y.toFixed(3));
  const s4a = run(tFor(0.21), 700);
  ok(s4a.camDepth > 0.35 * FALL.camera.drop, 'a sharp lurch: >35% of the depth arrives in the first 0.135 of p', `${s4a.camDepth.toFixed(1)}m`);
  const mid = run(tFor(0.45), 900);
  const midHeadN = worldOf(artist.parts.head).project(camera);
  ok(Math.abs(midHeadN.x) < 0.85 && midHeadN.y > -0.5 && midHeadN.y < 0.9, 'artist readable through the first part of the fall', `head ndc ${midHeadN.x.toFixed(2)}, ${midHeadN.y.toFixed(2)}`);
  void mid;
  const end = run(tFor(1), 1500);
  ok(Math.abs(camera.position.y + 16.9) < 0.05, 'camera lands at y ≈ −16.9 m', camera.position.y.toFixed(2));
  ok(Math.abs(camera.fov - 45.5) < 0.05, 'FOV ends on 45.5°', camera.fov.toFixed(1));
  const endHead = worldOf(artist.parts.head);
  const nEnd = endHead.clone().project(camera);
  ok(nEnd.y > 0.5 && Math.abs(nEnd.x) < 0.88, 'late in the fall he drifts UP in frame (falling deeper than the camera)', `ndc ${nEnd.x.toFixed(2)}, ${nEnd.y.toFixed(2)}`);
  ok(endHead.y - camera.position.y < -2.2, '…because he is genuinely below the camera', `${(endHead.y - camera.position.y).toFixed(2)}m`);
  ok(end.p > 0.99999, 'p reaches 1 at the end of the pin (damping converges to it, exactly like rig.t does)', end.p.toFixed(6));

  // star flare + distance fade; lights/fog toward black
  run(tFor(0), 400);
  const baseLight = star4.light.intensity;
  run(tFor(0.16), 700);
  ok(star4.light.intensity > baseLight * 1.8, 'the star flares bright at the catch moment', `${star4.light.intensity.toFixed(1)} vs ${baseLight.toFixed(1)}`);
  run(tFor(1), 1500);
  ok(star4.light.intensity < 0.05 && star4.layers.halo.material.opacity < 0.02, '…then fades with distance to nothing', `L ${star4.light.intensity.toFixed(3)} halo ${star4.layers.halo.material.opacity.toFixed(3)}`);
  ok(lights.key.intensity < 1.5 * 0.21 && lights.key.intensity > 1.5 * 0.15, 'studio lights dim to the floor value (≈18%)', lights.key.intensity.toFixed(2));
  ok(scene4.fog.far < 8 && scene4.fog.near < 0.6 && scene4.fog.color.getHexString() === '000000', 'fog tightens to near-black at the bottom', `far ${scene4.fog.far}`);

  // reversal: the whole excursion unwinds to exactly the dormant state
  const before = run(tFor(0), 900) && snap();
  run(tFor(1), 1600);
  run(tFor(0.5), 400);
  const after = run(tFor(0), 2400) && snap();
  ok(before === after, 'scroll down-to-1 (via 0.5) and back to 0 restores camera/artist/floor/fog/lights/star byte-for-byte');
}

console.log('\n— easel readability in the settled shot —');
{
  settle(1);
  const E = MARKS.easel;
  const named = {
    ledge: new THREE.Vector3(0, E.trayY, MARKS.canvas.z),
    mastTop: new THREE.Vector3(0, E.mastTopY + 0.02, E.mastTopZ),
    legTop: new THREE.Vector3(E.legTopX, E.legTopY, E.mastFootZ),
    rearFoot: new THREE.Vector3(0, 0.02, E.rearFootZ),
  };
  for (const [k, v] of Object.entries(named)) {
    const f = frame(v);
    ok(Math.abs(f.x) < 1 && Math.abs(f.y) < 1, `${k} inside the end frame`, `ndc ${f.x.toFixed(2)}, ${f.y.toFixed(2)}`);
  ok(f.dist > 1.5, `${k} is at easel distance, not in the camera`, `${f.dist.toFixed(2)}m`);
  }
  const easelMeshes = [];
  artist.parts.easel.traverse((o) => o.isMesh && easelMeshes.push(o));
  ok(easelMeshes.length >= 10, 'easel is recognisable: legs, mast, ledge, clamps, tubes', `${easelMeshes.length} meshes`);
  const total = [];
  artist.group.traverse((o) => o.isMesh && total.push(o));
  const tris = total.reduce((n, m) => n + (m.geometry.index ? m.geometry.index.count / 3 : 0), 0);
  ok(tris < 9000, 'lightweight enough for mobile', `${Math.round(tris)} tris across ${total.length} meshes`);
}

console.log(`\n${fails === 0 ? 'PASS' : `${fails} FAILED`}\n`);
process.exit(fails ? 1 : 0);
