/**
 * camera-path.js — the whole Scene 1 → Scene 2 camera move, in one file.
 *
 * Composition (metres; the artist's spine is the origin, floor is y=0):
 *   · the artist FACES +Z, so his easel/canvas live at +Z. His RIGHT side is -X.
 *   · `azimuth` is measured from "directly behind him":
 *       0° = dead behind · 90° = his right side (clean profile) · 180° = in front.
 *     Scene 1 starts at 5°, Scene 2 settles at 93°. We never cross in front of his
 *     face, so the face is never readable — close-up of the back of the head → silhouette.
 *   · `distance` grows 0.85 → 3.55 m AND the lens opens 30° → 37°, so the shot zooms
 *     out optically as well as physically (a dolly-out), but ends on a slightly longer
 *     lens than the middle of the move, which keeps the final profile flat and filmic
 *     instead of wide and stretched.
 *
 * >>> TUNE THE SHOT HERE: key arrays are position/aim/lens, nothing else matters. <<<
 */

import * as THREE from 'three';

/* ───────────────────────────────── tuning ───────────────────────────────── */

export const PATH = {
  /**
   * 'keyframe' → curve.getPoint(t):  every key gets an equal slice of the scroll, so
   *             the close-up lingers instead of whipping past. (recommended)
   * 'arc'      → curve.getPointAt(t): constant world-speed along the curve — the
   *             `getPointAt(camProxy.t)` from the brief, verbatim.
   */
  mode: 'keyframe',
  tension: 0.5, // Catmull-Rom tension; >0.55 can overshoot with only 5 keys
  damping: 5.5, // how fast the camera catches up with scroll (1/s). low = floaty.
  float: { amp: 0.0045, hz: 0.11 }, // handheld breath; amp 0 = locked-off dolly
  tiltStart: 1.1, // degrees of camera roll at Scene 1
  tiltEnd: -0.35, // ... and at Scene 2
};

/** Camera dolly: tucked behind the shoulder → around to his right side. */
export const CAMERA_KEYS = [
  { t: 0.0, azimuth: 5, distance: 0.85, height: 1.74 }, //  S1 — back of head fills frame
  { t: 0.25, azimuth: 25, distance: 1.35, height: 1.7 }, //  clearing the shoulder
  { t: 0.5, azimuth: 55, distance: 2.05, height: 1.6 }, //  rear 3/4, figure emerging
  { t: 0.75, azimuth: 76, distance: 2.8, height: 1.5 }, //  widening
  { t: 1.0, azimuth: 93, distance: 3.55, height: 1.42 }, //  S2 — side profile + easel
];

/** Moving lookAt. Starts just past his shoulder (on the lit canvas), ends between
 *  artist and easel so both stay framed. Keep this inside the figure volume near the
 *  end or the composition drifts off-screen as the camera backs away. */
export const TARGET_KEYS = [
  { t: 0.0, x: -0.22, y: 1.42, z: 0.66 },
  { t: 0.25, x: -0.17, y: 1.4, z: 0.5 },
  { t: 0.5, x: -0.1, y: 1.36, z: 0.42 },
  { t: 0.75, x: -0.05, y: 1.3, z: 0.4 },
  { t: 1.0, x: 0.0, y: 1.12, z: 0.44 },
];

/** Vertical field of view, degrees — the "zoom" half of the move. */
export const FOV_KEYS = [
  { t: 0.0, v: 30 },
  { t: 0.25, v: 34 },
  { t: 0.5, v: 41 },
  { t: 0.75, v: 40 },
  { t: 1.0, v: 37 },
];

/* ───────────────────────────────── builders ─────────────────────────────── */

/** Polar → world. 0° is behind him (-Z), +90° is his right side (-X). */
export function orbit(azimuthDeg, distance, height, out = new THREE.Vector3()) {
  const a = THREE.MathUtils.degToRad(azimuthDeg);
  return out.set(-Math.sin(a) * distance, height, -Math.cos(a) * distance);
}

/** Catmull-Rom over a scalar key track. Endpoints are duplicated so the curve
 *  passes through the first/last key instead of overshooting. Keys must be sorted
 *  by `t` and evenly spaced if you want 'keyframe' pacing to stay linear. */
export function sampleKeys(keys, t, prop = 'v') {
  const u = THREE.MathUtils.clamp(t, 0, 1) * (keys.length - 1);
  const i = Math.min(Math.floor(u), keys.length - 2);
  const f = u - i;
  const p0 = keys[Math.max(i - 1, 0)][prop];
  const p1 = keys[i][prop];
  const p2 = keys[i + 1][prop];
  const p3 = keys[Math.min(i + 2, keys.length - 1)][prop];
  const f2 = f * f;
  const f3 = f2 * f;
  return 0.5 * (2 * p1 + (p2 - p0) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f2 + (3 * p1 - p0 - 3 * p2 + p3) * f3);
}

/** The two splines the brief asks for: a camera trajectory and a look-target trajectory. */
export function buildCurves() {
  const toVec = (k) =>
    k.azimuth !== undefined ? orbit(k.azimuth, k.distance, k.height, new THREE.Vector3()) : new THREE.Vector3(k.x, k.y, k.z);
  return {
    cameraCurve: new THREE.CatmullRomCurve3(CAMERA_KEYS.map(toVec), false, 'catmullrom', PATH.tension),
    targetCurve: new THREE.CatmullRomCurve3(TARGET_KEYS.map(toVec), false, 'catmullrom', PATH.tension),
  };
}

/* ─────────────────────────────────── rig ────────────────────────────────── */

/**
 * Owns camera position, aim, roll and focal length for a given scroll progress.
 * Scroll never touches the camera directly: GSAP writes `state.t`, and this damps it
 * frame by frame — that separation is what keeps the move smooth on reversals.
 */
export function createCameraRig(camera) {
  const { cameraCurve, targetCurve } = buildCurves();
  const pos = new THREE.Vector3();
  const look = new THREE.Vector3();
  const sample = (curve, t, out) =>
    PATH.mode === 'arc' ? curve.getPointAt(THREE.MathUtils.clamp(t, 0, 1), out) : curve.getPoint(t, out);

  const rig = {
    t: 0, // smoothed progress actually rendered
    cameraCurve,
    targetCurve,

    /** @param {number} target scroll progress 0→1 (from GSAP) @param {number} dt seconds */
    update(target, dt) {
      rig.t += (THREE.MathUtils.clamp(target, 0, 1) - rig.t) * (1 - Math.exp(-PATH.damping * Math.min(dt, 0.05)));
      const t = rig.t;

      sample(cameraCurve, t, pos);
      sample(targetCurve, t, look);

      // handheld float: the body drifts more than the aim, so it reads as breathing
      // rather than as a shake, and it fades out at both ends of the move.
      const amp = PATH.float.amp * (0.35 + 0.65 * Math.sin(Math.PI * t));
      const w = (performance.now() / 1000) * PATH.float.hz * Math.PI * 2;
      pos.x += Math.sin(w + t * 9.7) * amp;
      pos.y += Math.sin(w * 0.73 + 1.7) * amp * 0.8;
      pos.z += Math.cos(w * 0.51 + 0.4) * amp;
      look.x += Math.sin(w * 0.61 + 2.2) * amp * 0.3;
      look.y += Math.cos(w * 0.44 + 0.9) * amp * 0.3;

      camera.position.copy(pos);
      camera.up.set(0, 1, 0);
      camera.lookAt(look);
      // micro roll that eases out as the shot settles (smoothstep so it never jerks)
      const tilt = THREE.MathUtils.lerp(PATH.tiltStart, PATH.tiltEnd, THREE.MathUtils.smoothstep(t, 0, 1));
      camera.rotateZ(THREE.MathUtils.degToRad(tilt));

      const fov = sampleKeys(FOV_KEYS, t);
      if (Math.abs(camera.fov - fov) > 1e-4) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
      return { pos, look, fov };
    },
  };
  return rig;
}
