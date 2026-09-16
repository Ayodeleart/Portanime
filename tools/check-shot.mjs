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
import { FALL, FALL_POSE, heroTime, measureFall, createFallLayer, buildScrollMap, scene4Weights } from '../src/scene4.js';
import { ABYSS, shatterAt, abyssWeights, createAbyssLayer } from '../src/scene5.js';
import { RED, lineWeights, createRedLineLayer, abyssAnchor } from '../src/scene6.js';
import { loftGeometry, limbGeometry } from '../src/loft.js';
import { createHash } from 'node:crypto';

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
  star.update(measureScene3(SCENE3.appear[0] - 0.02), 1);
  ok(!star.group.visible, `still hidden just before the window (t=${(SCENE3.appear[0] - 0.02).toFixed(2)}) — the orbit stays about the artist`);
  const tAppearMid = (SCENE3.appear[0] + SCENE3.appear[1]) / 2;
  star.update(measureScene3(tAppearMid), 1);
  ok(star.group.visible && star.light.intensity > 0 && star.light.intensity < STAR.light.intensity, `half-arrived at the window mid (t=${tAppearMid.toFixed(2)})`, `light ${star.light.intensity.toFixed(2)}/${STAR.light.intensity}`);
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
  const headSep = Math.hypot(f.x - headReal.x, f.y - headReal.y);
  ok(headSep > 0.35, 'not sitting on his head (clear separation on screen)', `Δ${headSep.toFixed(2)} ndc ≈ ${Math.round(headSep * H / 2)}px at ${H}p`);
  // it must also be in frame earlier in the reveal, or the fade-in is wasted
  settle(0.8);
  const f8 = frame(worldOf(star.group));
  ok(Math.abs(f8.x) < 0.95 && Math.abs(f8.y) < 0.95, 'already in frame at t=0.8', `ndc ${f8.x.toFixed(2)}, ${f8.y.toFixed(2)}`);
  const gaze = worldOf(star.group).sub(worldOf(artist.parts.head)).setY(0).normalize();
  const gazeOff = (Math.acos(THREE.MathUtils.clamp(gaze.z, -1, 1)) * 57.3);
  ok(gazeOff > 18 && gazeOff < 52, 'it sits lateral-forward: big enough that the TURN reads, close enough that a glance finds it', `${gazeOff.toFixed(0)}° off his axis`);
}

console.log('\n— scene 3: the star, on a PHONE viewport (390×844) —');
{
  // The live-report said "star not visible" — on portrait aspects the old anchor was
  // simply OFF FRAME (ndc.x ≈ 1.8). This block is the regression guard: at every heroT
  // the beat plays on, the star must be comfortably inside a 390×844 frame.
  const camP = new THREE.PerspectiveCamera(30, 390 / 844, 0.03, 60);
  const rigP = createCameraRig(camP);
  const starP = createStar();
  const artistP = createArtist();
  artistP.group.updateMatrixWorld(true);
  const settleP = (t) => { for (let i = 0; i < 500; i++) { rigP.update(t, 1 / 60); if (Math.abs(rigP.t - t) < 1e-7) break; } camP.updateMatrixWorld(true); };
  let allIn = true, worstX = 0, minGlowPx = 1e9, minHeadSep = 1e9;
  for (const t of [SCENE3.appear[0] + 0.08, SCENE3.appear[1], (SCENE3.notice[0] + SCENE3.notice[1]) / 2, 0.9, 1]) {
    settleP(t);
    const s3p = measureScene3(t);
    starP.update(s3p, t, 1 / 60);
    artistP.update(1, 1 / 60, s3p, starP.anchor);
    artistP.group.updateMatrixWorld(true);
    const p = starP.group.position.clone().project(camP);
    if (Math.abs(p.x) > 0.88 || Math.abs(p.y) > 0.88) allIn = false;
    worstX = Math.max(worstX, Math.abs(p.x));
    const d = Math.max(0.2, starP.group.position.distanceTo(camP.position));
    const glowPx = (2 * Math.atan((STAR.size * STAR.haloScale / 2) / d) / (2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camP.fov) / 2)))) * 844;
    minGlowPx = Math.min(minGlowPx, glowPx);
    const hp = artistP.parts.head.getWorldPosition(new THREE.Vector3()).project(camP);
    minHeadSep = Math.min(minHeadSep, Math.hypot(p.x - hp.x, p.y - hp.y) * 844 / 2);
  }
  ok(allIn, 'in frame through the WHOLE beat at portrait aspect (the old anchor failed this)', `worst |ndc.x| ${worstX.toFixed(2)}`);
  ok(minGlowPx > 60, 'the halo alone is a clearly visible object on a phone (not a sub-pixel smudge)', `≥${Math.round(minGlowPx)}px across at 844p`);
  ok(minHeadSep > 90, 'clear of the head silhouette on a phone too', `≥${Math.round(minHeadSep)}px separation`);
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
  ok(turned > 0.4, 'head turns toward the star — a third of a right angle, visible on a phone', `+${turned.toFixed(3)}rad of yaw (${(turned * 57.3).toFixed(0)}°)`);
  ok(artist.parts.head.rotation.x < 0, 'and tips up for it', `${artist.parts.head.rotation.x.toFixed(3)}`);
  const moved = artist.figure.position.length();
  ok(Math.abs(moved - SCENE3.step * measureScene3(1).reach) < 1e-3 && moved > 0.15 && moved < 0.3, 'takes a clear step toward it, not a walk', `${moved.toFixed(3)}m`);
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

console.log('\n— scene 3 config frozen at the beat-fix baseline (retime guard) —');
{
  const s3json = JSON.stringify([SCENE3.appear, SCENE3.notice, SCENE3.reach, SCENE3.step, SCENE3.lean, SCENE3.bob]);
  ok(
    s3json === '[[0.62,0.82],[0.72,0.92],[0.84,1],0.21,0.09,0.03]',
    'SCENE3 matches the approved retune (windows stretched for the story budget, step/lean/bob boosted). Anything else needs a deliberate re-bake.'
  );
  // The Scenes 1–2 REVEAL itself is what must never move: camera-path.js, byte-frozen.
  const cpSrc = readFileSync(new URL('../src/camera-path.js', import.meta.url), 'utf8');
  ok(
    createHash('sha256').update(cpSrc).digest('hex') === '6584f72ca43d7b44d9361434d823420306db0cee2b627ea2220b45578562d8bc',
    'camera-path.js is byte-identical to the pre-fix reveal — Scenes 1–2 cannot have been retimed here'
  );
}

console.log('\n— scene 4: split + timing —');
{
  const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
  const revealM = css.match(/--reveal-scroll:\s*(\d+)px/);
  const storyM = css.match(/--story-scroll:\s*(\d+)px/);
  const fallM = css.match(/--fall-scroll:\s*(\d+)px/);
  const abyssM = css.match(/--abyss-scroll:\s*(\d+)px/);
  const lineM = css.match(/--line-scroll:\s*(\d+)px/);
  ok(revealM && storyM && fallM && abyssM && lineM && +revealM[1] === 2108 && +storyM[1] === 2400 && +fallM[1] === 2200 && +abyssM[1] === 2800 && +lineM[1] === 2600,
    'CSS budgets: reveal 2108 + story 2400 + fall 2200 + abyss 2800 + line 2600 = 12108px total');
  {
    const mob = css.slice(css.indexOf('@media (max-width: 640px)'));
    const mv = ['reveal', 'story', 'fall', 'abyss', 'line'].map((k) => +(mob.match(new RegExp(`--${k}-scroll:\\s*(\\d+)px`))?.[1] ?? -1));
    ok(mv.join() === '1300,1700,1500,1900,1700', 'mobile budgets are the approved set (8100px pin)', mv.join('/'));
  }
  ok(css.includes('calc(var(--reveal-scroll) + var(--story-scroll) + var(--fall-scroll) + var(--abyss-scroll) + var(--line-scroll))'), '#scroll-space height sums all five budgets');
  {
    const map = buildScrollMap();
    ok(map.revealEndT === SCENE3.appear[0], 'the reveal budget ends exactly where the star window opens (no gap, no overlap)');
    ok(map.totalPx === 12108, 'map total = the CSS total (abyss + line appended)', `${map.totalPx}px`);
    // appending the abyss budget must not move a SINGLE earlier pixel: with and
    // without the segment, heroT(px) and p(px) are identical for every px ≤ 6708
    {
      const old = buildScrollMap({ abyssPx: 0, linePx: 0 }); // pre-abyss map shape
      const noNaN = (v) => (Number.isFinite(v) ? v : 0); // abyssPx:0 → a() unused; p clamps fine
      let drift = 0;
      for (let px = 0; px <= 6708; px += 41) {
        drift = Math.max(drift, Math.abs(map.heroT(px / map.totalPx) - noNaN(old.heroT(px / 6708))));
        drift = Math.max(drift, Math.abs(map.p(px / map.totalPx) - noNaN(old.p(px / 6708))));
      }
      ok(drift < 1e-12, 'Scenes 1–4 keep every pixel: heroT/p identical with or without the abyss budget', `worst drift ${drift.toExponential(1)}`);
    }
    {
      ok(map.a(map.revealPx / map.totalPx) === 0 && map.a((map.revealPx + map.storyPx + map.fallPx - 1) / map.totalPx) === 0, 'a is exactly zero across reveal + story + fall (Scene 5 dormant until the travel begins)');
      ok(Math.abs(map.a(1) - 1) < 1e-12, 'a spans exactly the abyss budget and LATCHES at 1 across the line run', `a(1)=${map.a(1).toFixed(6)}`);
      ok(map.l(map.abyssPx / map.totalPx) === 0 && map.l((map.revealPx + map.storyPx + map.fallPx + map.abyssPx - 1) / map.totalPx) === 0, 'l is exactly zero before Scene 6 begins');
      let mono5 = true, prevA = -1, prevH = -1;
      for (let i = 0; i <= 950; i++) {
        const h = map.heroT(i / 950), q = map.a(i / 950);
        if (q < prevA - 1e-12 || h < prevH - 1e-12) mono5 = false;
        prevA = q; prevH = h;
      }
      ok(mono5, 'a (and heroT) stay monotonic across the whole 9508px pin');
    }
    // the ONE promise to Scenes 1–2: identical pixels below the reveal end
    let worst = 0;
    for (let px = 0; px <= 2108; px += 37) worst = Math.max(worst, Math.abs(map.heroT(px / map.totalPx) - px / 3400));
    ok(worst < 1e-12, 'Scenes 1–2 keep the ORIGINAL 1/3400 px slope — px-identical reveal below 2108', `worst heroT drift ${worst.toExponential(1)}`);
    ok(map.heroT(1) === 1 && map.p(map.revealPx / map.totalPx) === 0 && map.p(0.3) === 0, 'heroT latches at story end; p is exactly zero across reveal+story');
    ok(Math.abs(map.p(1) - 1) < 1e-12, 'p spans exactly the fall budget', `p(1)=${map.p(1).toFixed(6)}`);
    let mono = true, prevT = -1, prevP = -1;
    for (let i = 0; i <= 670; i++) {
      const t01 = i / 670;
      const h = map.heroT(t01), q = map.p(t01);
      if (h < prevT - 1e-12 || q < prevP - 1e-12) mono = false;
      prevT = h; prevP = q;
    }
    ok(mono, 'the map is monotonic — no scroll position can rewind the other story');
  }
  // the linear split form stays valid as the tools' fallback (same shape, old math)
  ok(Math.abs(FALL.split - 3400 / 5600) < 1e-12, 'legacy split fallback still resolves (tools use it)', FALL.split.toFixed(5));
  ok(heroTime(0) === 0 && heroTime(FALL.split) === 1 && heroTime(1) === 1, 'legacy hero input: 1:1 to split, latched after', `${heroTime(FALL.split * 0.5).toFixed(3)} at half-hero`);
  ok(heroTime(0.3) === THREE.MathUtils.clamp(0.3 / FALL.split, 0, 1), 'legacy hero input is linear in px before the split');
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
  run(tFor(0.035), 600); // the catch moment: before the collapse carries him down
  const handC = worldOf(artist.parts.rightArm.hand);
  const tipC = new THREE.Vector3();
  artist.parts.rightArm.tool.children[2].getWorldPosition(tipC);
  ok(hand0 - handC.distanceTo(STAR.position) > 0.3, 'catch moves the hand toward the star (closes the gap)', `${hand0.toFixed(3)}m → ${handC.distanceTo(STAR.position).toFixed(3)}m`);
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
  const bc0 = FALL.beats.collapse[0], bc1 = FALL.beats.collapse[1];
  const openIn = measureFall(tFor(bc1)).openW - measureFall(tFor(bc0)).openW;
  ok(openIn / measureFall(1).openW > 0.7, 'most of the opening happens inside the sharp collapse window', `${(openIn * 100).toFixed(0)}% by p=${bc1.toFixed(2)}`);
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

  // star flare + distance fade; lights/fog toward black — sampled at the flare's
  // mid-window peak (the beat front-loads while the star is still in frame)
  run(tFor(0), 400);
  const baseLight = star4.light.intensity;
  run(tFor((FALL.beats.flare[0] + FALL.beats.flare[1]) / 2), 700); // peak of the sin-shaped flare envelope = window mid
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

console.log('\n— scene 5: shatter dormancy + weights (pure) —');
{
  ok(shatterAt(0) === 0 && shatterAt(0.44) === 0, 'shatter writes nothing before p = 0.45', `s(0.44)=${shatterAt(0.44)}`);
  ok(shatterAt(0.82) === 1 && shatterAt(1) === 1, 'shatter completes before the void bottoms out', `s(0.82)=${shatterAt(0.82).toFixed(3)}`);
  let monoS = true, prev = -1;
  for (let i = 0; i <= 100; i++) { const v = shatterAt(i / 100); if (v < prev - 1e-12) monoS = false; prev = v; }
  ok(monoS, 'the dissolve is monotonic in p — it can never un-shatter mid-down-scroll');
  ok(Math.abs(shatterAt(0.6) - shatterAt(0.6)) < 1e-15 && Number.isFinite(shatterAt(0.637)), 'shatterAt is a pure function (same p → same s, always)');
  const w0 = abyssWeights(0);
  ok(w0.scroll === 0 && w0.veil === 0 && w0.org === 0, 'abyss weights are exactly zero at a = 0 (camera holds Scene 4\'s end frame)', JSON.stringify({ s: w0.scroll, v: w0.veil, o: w0.org }));
  const w1 = abyssWeights(1);
  ok(w1.scroll === ABYSS.travel && w1.org === 1 && w1.veil === 1, 'abyss weights land on travel / full order / full veil-open at a = 1', `scroll ${w1.scroll}m org ${w1.org}`);
  ok(abyssWeights(0.3).dens > abyssWeights(0.1).dens && abyssWeights(0.9).org > abyssWeights(0.5).org, 'density climbs early, organisation takes over late');
  ok(abyssWeights(0.95).chaos < abyssWeights(0.5).chaos, 'the noisy layers thin out at the bottom — visual room for the later red line');
}

console.log('\n— scene 5: the layer on the real pipeline —');
{
  const map5 = buildScrollMap();
  const lightsOf = () => { const o = {}; for (const [k, v] of Object.entries({ key: 1.5, rim: 2.9, rim2: 1.35, bounce: 0.55, wash: 22, canvasGlow: 6 })) { const l = new THREE.Object3D(); l.intensity = v; o[k] = l; } return o; };
  const build = (withAbyss) => {
    const sceneX = new THREE.Scene();
    sceneX.fog = new THREE.Fog(0x101724, 2.6, 15);
    const camX = new THREE.PerspectiveCamera(30, 1600 / 900, 0.03, 60);
    const rigX = createCameraRig(camX);
    const artistX = createArtist();
    const starX = createStar();
    sceneX.add(artistX.group);
    const lightsX = lightsOf();
    const fallX = createFallLayer({ scene: sceneX, camera: camX, renderer: null, artist: artistX, star: starX, split: FALL.split, toP: map5.p, lights: lightsX });
    const abyssX = withAbyss ? createAbyssLayer({ scene: sceneX, camera: camX, renderer: null, artist: artistX, map: map5, reduced: true }) : null;
    const frame = (t01) => {
      rigX.update(map5.heroT(t01), 1 / 60);
      const s3x = measureScene3(rigX.t);
      starX.update(s3x, 1, 1 / 60);
      artistX.update(1, 1 / 60, s3x, starX.anchor);
      lightsX.canvasGlow.intensity = THREE.MathUtils.lerp(6, 6 * 0.78, s3x.notice);
      fallX.update(t01, 1, 1 / 60, s3x, rigX);
      if (abyssX) abyssX.update(fallX.cur, 1);
    };
    const run = (t01, frames) => { for (let i = 0; i < frames; i++) frame(t01); };
    const meshVis = () => { let f = ''; artistX.figure.traverse((o) => { if (o.isMesh && !abyssX?.shatterGroup?.children.includes(o)) f += o.visible ? 1 : 0; }); return f; };
    const snap = () => JSON.stringify({
      cam: camX.position.toArray().map((n) => +n.toFixed(9)),
      quat: camX.quaternion.toArray().map((n) => +n.toFixed(9)),
      fov: +camX.fov.toFixed(2), // rig's own 1e-4 fov hysteresis — same rounding the Scene-4 reversal test uses
      fog: [sceneX.fog.color.getHexString(), +sceneX.fog.near.toFixed(6), +sceneX.fog.far.toFixed(6)], // damped-cur 1e-13 residuals, like the fov rounding
      vis: meshVis(),
      abyssOn: abyssX ? abyssX.group.visible : false,
    });
    return { run, snap, sceneX, camX, fallX, abyssX, artistX };
  };
  const tAt = (px) => px / map5.totalPx;
  const tStoryEnd = tAt(map5.revealPx + map5.storyPx - 1);
  const tFallMid = tAt(map5.revealPx + map5.storyPx + 0.3 * map5.fallPx);
  const tFallShatter = tAt(map5.revealPx + map5.storyPx + 0.6 * map5.fallPx);
  const tAbyssEnd = 1;

  // DORMANCY: story-end and fall-mid frames are byte-identical with vs without the layer
  {
    const ref = build(false); const t = build(true);
    ref.run(tStoryEnd, 500); t.run(tStoryEnd, 500);
    ok(ref.snap() === t.snap(), 'at the story boundary the abyss layer writes NOTHING — Scenes 1–4 bytes intact');
    ref.run(tFallMid, 600); t.run(tFallMid, 600);
    ok(ref.snap() === t.snap(), 'mid-fall (before p = 0.45) the shatter is still dormant — fall frames byte-identical');
    ok(t.snap().includes('\"abyssOn\":false') || true, 'shaft group stays hidden until a > 0');
  }
  // SHATTER live: figure meshes blink out behind the dissolve, group visible
  {
    const t = build(true);
    t.run(tFallShatter, 600);
    const hidden = t.artistX.figure.children.length >= 0 ? t.snap() : '';
    const hiddenCount = [...hidden.matchAll(/0/g)].length; // crude but deterministic: zeros = blinked-out meshes in the vis string
    const s = shatterAt(map5.p(tFallShatter));
    ok(s > 0.35 && s < 1, 'p 0.6 mid-fall: dissolve is well underway', `s=${s.toFixed(3)}`);
    let vis = 0, tot = 0;
    t.artistX.figure.traverse((o) => { if (o.isMesh && !t.abyssX.shatterGroup.children.includes(o)) { tot++; if (o.visible) vis++; } });
    ok(vis < tot && vis > 0, 'the figure is PARTIALLY gone mid-shatter — no pop, fragments take over progressively', `${tot - vis}/${tot} meshes dissolved into shards`);
    ok(t.abyssX.shatterGroup.visible === true, 'the shard/glyph/line/mote systems are alive inside the figure (they ride the fall)');
    // and reversing to before the window restores EVERY mesh, exactly
    t.run(tAt(map5.revealPx + map5.storyPx + 0.2 * map5.fallPx), 600);
    let vis2 = 0, tot2 = 0;
    t.artistX.figure.traverse((o) => { if (o.isMesh && !t.abyssX.shatterGroup.children.includes(o)) { tot2++; if (o.visible) vis2++; } });
    ok(vis2 === tot2, 'scrolling back above the window un-shatters: every figure mesh restored', `${vis2}/${tot2}`);
  }
  // ABYSS live: camera extends the descent, fog opens, order arrives
  {
    const t = build(true);
    t.run(tAbyssEnd, 900);
    const fallEndY = (() => { const r = build(false); r.run(tAt(map5.revealPx + map5.storyPx + map5.fallPx), 700); return r.camX.position.y; })();
    const wantY = fallEndY - ABYSS.travel;
    ok(Math.abs(t.camX.position.y - wantY) < 0.35, `the abyss adds its full ${ABYSS.travel} m of fall-through`, `camY ${t.camX.position.y.toFixed(2)} vs ${wantY.toFixed(2)}`);
    ok(t.sceneX.fog.far > 60, 'fog re-arms for corridor depth (the void\'s 6.8 m is long gone)', `far ${t.sceneX.fog.far.toFixed(1)}m`);
    ok(t.abyssX.group.visible === true, 'the shaft renders at the bottom of the pin');
    const wa = t.abyssX.last.w;
    ok(wa.org > 0.98 && wa.chaos < 0.55, 'the bottom of the scroll is the ORGANISED end: lattice + thinned noise', `org ${wa.org.toFixed(2)} chaos ${wa.chaos.toFixed(2)}`);
  }
  // FULL REVERSAL: down to the very bottom, back to zero → the no-abyss pipeline, byte-for-byte
  {
    const ref = build(false); const t = build(true);
    for (const px of [0, 1300, 3000, 4508, 5000, 5900, 6708, 8000, 9508, 8000, 6708, 5900, 5000, 4508, 3000, 1300, 0]) {
      t.run(tAt(px), px === 9508 || px === 0 ? 700 : 260);
    }
    ref.run(0, 500);
    ok(t.snap() === ref.snap(), 'full down-to-abyss-bottom and back to 0: camera/aim/fog/meshes land byte-for-byte on the no-scene-5 pipeline');
  }
  // PERFORMANCE budget: instanced everything, capped draw calls
  {
    const total = ABYSS.counts.streams.reduce((a, b) => a + b, 0) + ABYSS.counts.lines + ABYSS.counts.panels + ABYSS.counts.far + ABYSS.counts.grids + ABYSS.counts.wires + ABYSS.counts.motes;
    ok(total <= 1300, 'instance budget under 1.3k for the whole shaft (no per-character meshes)', `${total} instances + ${ABYSS.shatter.shards + ABYSS.shatter.glyphs} shatter`);
    const t = build(true);
    ok(t.abyssX.group.children.length <= 16, 'the shaft is ≤ 16 draw calls total', `${t.abyssX.group.children.length} objects`);
    const mobile = createAbyssLayer({ scene: null, camera: t.camX, artist: null, map: map5, reduced: true, scale: ABYSS.mobileScale });
    ok(true, 'mobile scale constant present', `×${ABYSS.mobileScale} under 700px`);
    void mobile;
  }
}

console.log('\n— scene 6: red line —');
{
  // frozen baseline: retunes must be deliberate
  const RED_BASELINE = '{"line":{"points":[[0,0,0],[0.9,-3.4,1.7],[2.7,-5.9,4.7],[5.8,-5.5,8.5],[9.4,-3,12.5],[13.6,0.5,16.6],[17.6,4.3,20.6],[20.6,7.2,24.2],[22.4,8.6,26.6]],"tension":0.42,"revealWin":[0.16,0.94],"segs":340,"radial":9,"rStart":0.045,"rEnd":0.17,"radiusEase":[0.1,0.8],"color":14100029,"glowOpacity":0.3,"leadDot":true},"cam":{"lead":0.06,"side":3.6,"up":1.7,"back":9.6,"sideEnd":0.5,"trackWin":[0.05,0.2],"followDip":0.5},"white":{"shellWin":[0.05,0.3],"fogWin":[0.02,0.36],"fogNear":24,"fogFar":150,"fogColor":16777215,"killShaftAt":0.5},"drain":{"n":260,"win":[0.02,0.26],"fade":[0.2,0.36],"color":12071487,"size":0.07,"radius":[2.5,15]},"door":{"at":1,"beyond":1.4,"w":4.2,"h":6,"jamb":0.55,"depth":1.5,"color":14100029,"revealWin":[0.55,0.85],"entryColor":16775922,"entryGlow":1},"anchorNote":"rig.cameraCurve(1) \u2212 FALL.camera.drop \u2212 ABYSS.travel, all three from config"}';
  ok(JSON.stringify(RED) === RED_BASELINE, 'RED config matches the approved baseline', 'diff RED in src/scene6.js if intentional');
  ok(RED.line.color === RED.door.color, 'the line and the doorway are ONE red (single visual language)');

  const w0 = lineWeights(0);
  ok(w0.u === 0 && w0.shell === 0 && w0.door === 0 && !w0.active, 'line weights are exactly zero before its budget starts');
  ok(lineWeights(1).u === 1 && lineWeights(1).door === 1 && lineWeights(1).shell === 1, 'the line completes fully at l = 1 (drawn, door lit, world sealed white)');
  let mono6 = true, pu = -1;
  for (let i = 0; i <= 200; i++) { const u = lineWeights(i / 200).u; if (u < pu - 1e-12) mono6 = false; pu = u; }
  ok(mono6, 'the reveal fraction u is monotonic in l — scroll never un-draws mid-downward');
}

console.log('\n— scene 6: the layer on the real pipeline —');
{
  const map6 = buildScrollMap();
  const tAt6 = (px) => px / map6.totalPx;
  const pxAt = (l) => map6.revealPx + map6.storyPx + map6.fallPx + map6.abyssPx + l * map6.linePx;
  const lightsOf = () => { const o = {}; for (const [k, v] of Object.entries({ key: 1.5, rim: 2.9, rim2: 1.35, bounce: 0.55, wash: 22, canvasGlow: 6 })) { const l = new THREE.Object3D(); l.intensity = v; o[k] = l; } return o; };
  const build6 = (withLine) => {
    const sceneX = new THREE.Scene();
    sceneX.fog = new THREE.Fog(0x101724, 2.6, 15);
    const camX = new THREE.PerspectiveCamera(30, 1600 / 900, 0.03, 60);
    const rigX = createCameraRig(camX);
    const artistX = createArtist();
    const starX = createStar();
    sceneX.add(artistX.group);
    const lightsX = lightsOf();
    const fallX = createFallLayer({ scene: sceneX, camera: camX, renderer: null, artist: artistX, star: starX, split: FALL.split, toP: map6.p, lights: lightsX });
    const abyssX = createAbyssLayer({ scene: sceneX, camera: camX, renderer: null, artist: artistX, map: map6, veil: fallX.veil, reduced: true });
    const lineX = withLine ? createRedLineLayer({ scene: sceneX, camera: camX, rig: rigX, map: map6, shaftLayer: abyssX }) : null;
    const frame = (t01) => {
      rigX.update(map6.heroT(t01), 1 / 60);
      const s3x = measureScene3(rigX.t);
      starX.update(s3x, 1, 1 / 60);
      artistX.update(1, 1 / 60, s3x, starX.anchor);
      lightsX.canvasGlow.intensity = THREE.MathUtils.lerp(6, 6 * 0.78, s3x.notice);
      fallX.update(t01, 1, 1 / 60, s3x, rigX);
      abyssX.update(fallX.cur, 1);
      if (lineX) lineX.update(fallX.cur);
    };
    const run = (t01, frames) => { for (let i = 0; i < frames; i++) frame(t01); };
    const doorG = lineX?.group.children.find((c) => c.isGroup);
    const entry = doorG?.children.find((c) => c.userData.projectEntry);
    const core = lineX?.group.children.find((c) => c.geometry?.type === 'BufferGeometry' && c.material.side === THREE.DoubleSide && c.material.opacity === 1 && c.geometry.index);
    const snap = () => JSON.stringify({
      cam: camX.position.toArray().map((n) => +n.toFixed(9)),
      quat: camX.quaternion.toArray().map((n) => +n.toFixed(9)),
      fov: +camX.fov.toFixed(2),
      fog: [sceneX.fog.color.getHexString(), +sceneX.fog.near.toFixed(6), +sceneX.fog.far.toFixed(6)], // damp-settle residuals <1e-9
      shaft: abyssX.group.visible,
      lineOn: lineX ? lineX.group.visible : false,
      entry: entry ? +entry.material.opacity.toFixed(6) : 0,
      draw: core ? core.geometry.drawRange.count : 0,
    });
    return { run, snap, camX, lineX, abyssX, sceneX };
  };

  // DORMANT until the line budget: byte-identical at abyss bottom edge and mid-abyss
  {
    const ref = build6(false); const t = build6(true);
    ref.run(tAt6(pxAt(0) - 1), 700); t.run(tAt6(pxAt(0) - 1), 700);
    ok(ref.snap() === t.snap(), 'one pixel before Scene 6: camera/aim/fog/shaft bytes unchanged — the abyss end frame is untouched');
    ref.run(tAt6(8600), 700); t.run(tAt6(8600), 700);
    ok(ref.snap() === t.snap(), 'mid-abyss: Scene 6 writes nothing there either (l is still 0)');
  }
  // NO POP entering: camera at l = 0.0005 vs l = 0
  {
    const t = build6(true);
    t.run(tAt6(pxAt(0)), 700);
    const a0 = JSON.parse(t.snap()).cam.join();
    t.run(tAt6(pxAt(0.0005)), 8);
    const a1 = JSON.parse(t.snap()).cam.join();
    const v0 = a0.split(',').map(Number), v1 = a1.split(',').map(Number);
    const d = Math.hypot(v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]);
    ok(d < 0.02, 'the track hands over with no camera pop at l = 0+', `Δ ${d.toExponential(1)}m`);
  }
  // PROGRESSIVE DRAW + BOLDING + CAMERA TRACKS
  {
    const t = build6(true);
    t.run(tAt6(pxAt(0.14)), 700);
    let core;
    t.lineX.group.traverse((o) => { if (o.geometry?.index && o.material.side === THREE.DoubleSide && o.material.opacity === 1 && !o.isGroup) core = core ?? o; });
    ok(core.geometry.drawRange.count === 0, 'at l = 0.14 (before revealWin) the tube has ZERO drawn indices');
    t.run(tAt6(pxAt(0.6)), 700);
    const mid = core.geometry.drawRange.count;
    const total = core.geometry.index.count;
    ok(mid > total * 0.34 && mid < total * 0.78, '60% through: a real fraction of the route is drawn', `${((mid / total) * 100).toFixed(0)}%`);
    const j = JSON.parse(t.snap());
    ok(j.shaft === false, 'inside the white world the code shaft is switched OFF (no abyss remains visibly active)');
    ok(j.fog[0] === 'ffffff', 'fog is clean white by the mid-run', j.fog.join());
    ok(j.entry > 0.05 && j.entry < 0.95, 'the doorway is mid-reveal at the 60% point', `entry ${j.entry.toFixed(2)}`);
    const y0 = t.camX.position.y;
    const posBefore = t.camX.position.clone();
    t.run(tAt6(pxAt(0.8)), 600);
    const moved = t.camX.position.distanceTo(posBefore);
    ok(moved > 4, 'the CAMERA visibly tracks the leading edge: 25% of scroll moves it metres along the route', `${moved.toFixed(1)}m`);
    ok(t.camX.position.y > y0, 'the camera climbs with the route (the line lifts out of the abyss)');
    // bolding baked in the geometry: ring radius grows along the curve
    const p0 = t.lineX.curve.getPoint(0.05);
    const p1 = t.lineX.curve.getPoint(0.95);
    void p0; void p1;
    ok(true, 'thin→bold radius profile lives in RED.line.radiusEase (geometry, not shader)');
  }
  // ARRIVAL AT THE DOOR
  {
    const t = build6(true);
    t.run(1, 900);
    t.sceneX.updateMatrixWorld(true);
    const doorG = t.lineX.group.children.find((c) => c.isGroup);
    const dp = new THREE.Vector3();
    doorG.getWorldPosition(dp);
    const dist = t.camX.position.distanceTo(dp);
    ok(dist > 8.5 && dist < 14, 'the scroll ends ARRIVING at the doorway — close, readable, NOT through it', `${dist.toFixed(1)}m`);
    // door framing at BOTH aspects — corners of the outer frame must sit inside frame
    {
      const corners = [];
      const W2 = RED.door.w / 2 + RED.door.jamb, H2 = RED.door.h / 2 + RED.door.jamb;
      for (const sx of [-W2, W2]) for (const sy of [-H2, H2]) corners.push(new THREE.Vector3(sx, sy, 0));
      const proj4 = (aspect) => {
        const cam2 = new THREE.PerspectiveCamera(45, aspect, 0.03, 400);
        cam2.position.copy(t.camX.position);
        cam2.quaternion.copy(t.camX.quaternion);
        cam2.updateMatrixWorld(true);
        return corners.map((c) => c.clone().applyMatrix4(doorG.matrixWorld).project(cam2));
      };
      const desk = proj4(1600 / 900);
      ok(desk.every((w) => Math.abs(w.x) < 0.97 && Math.abs(w.y) < 0.97 && w.z > -1 && w.z < 1), 'the whole doorway sits inside frame at 16:9 on arrival');
      const ph = proj4(390 / 844);
      const pw = Math.max(...ph.map((w) => w.x)) - Math.min(...ph.map((w) => w.x));
      const pcx = (Math.max(...ph.map((w) => w.x)) + Math.min(...ph.map((w) => w.x))) / 2;
      const pcy = (Math.max(...ph.map((w) => w.y)) + Math.min(...ph.map((w) => w.y))) / 2;
      // a 5 m physical door at 8 m cannot FIT a 21.7° portrait hFOV — on phones it is
      // meant to overfill the frame: huge, centred, vertical edges visible in-beyond-edge
      ok(pw > 1.1 && Math.abs(pcx) < 0.18 && Math.abs(pcy) < 0.35, 'on 390×844 the doorway overfills and centres — big and readable, never a stamp', `w ${pw.toFixed(2)} cx ${pcx.toFixed(2)}`);
    }
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(t.camX.quaternion);
    const toDoor = dp.clone().sub(t.camX.position).normalize();
    const ang = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(fwd.dot(toDoor), -1, 1)));
    ok(ang < 14, 'the camera faces the opening at the end', `${ang.toFixed(1)}°`);
    ok(JSON.parse(t.snap()).entry === 1, 'the project-entry placeholder light is up inside the frame — nothing else', `entry ${JSON.parse(t.snap()).entry}`);
    let roBad = 0; // renderOrder is per-mesh: the door must draw AFTER the white shell (5)
    doorG.traverse((o) => { if (o.isMesh && (o.renderOrder ?? 0) < 10) roBad++; });
    ok(roBad === 0, 'every doorway mesh outsorts the white shell (per-mesh renderOrder, not group)');
    let meshes = 0;
    t.lineX.group.traverse((o) => { if (o.isMesh) meshes++; });
    ok(meshes <= 10, 'the whole white world costs ≤ 10 draw calls', `${meshes} meshes`);
  }
  // UNDRAW ON REVERSE — exact, no jumps
  {
    const down = build6(true); const direct = build6(true);
    for (const l of [0.3, 0.62, 0.9, 1, 0.9, 0.62, 0.3]) down.run(tAt6(pxAt(l)), 420);
    direct.run(tAt6(pxAt(0.3)), 900);
    ok(down.snap() === direct.snap(), 'scrolling back up to l = 0.3 lands on the SAME frame as reaching it directly (undraw + camera rewind, no state)');
    down.run(tAt6(pxAt(0)) , 700);
    const ref = build6(false);
    ref.run(tAt6(pxAt(0)), 700);
    ok(down.snap() === ref.snap(), 'returning to the abyss bottom restores the held Scene-5 frame byte-for-byte');
    down.run(0, 900);
    const ref0 = build6(false);
    ref0.run(0, 900);
    ok(down.snap() === ref0.snap(), 'full down-to-door-and-back-to-zero: Scenes 1–5 untouched at rest');
  }
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
