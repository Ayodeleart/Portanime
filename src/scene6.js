/**
 * scene6.js — Scene 6: the abyss RESOLVES into a white world, and a bold red line
 * draws itself through it, leading to an architectural doorway (the future project
 * entry — intentionally empty right now).
 *
 * Local progress `l` = the fifth budget (--line-scroll), read off the SAME damped
 * pin value every other scene renders (fall.cur). Everything is a closed-form
 * function of l: the line undraws, the camera re-tracks backwards, and at l = 0
 * this module writes NOTHING at all — Scenes 1–5 stay byte-identical.
 *
 * The chain of cause and effect (no crossfade):
 *   l 0.00 → 0.30   the organised code DRAINS: residual glyph motes are pulled into
 *                   the line's leading point as it wakes; the white shell closes over
 *                   the dark shaft; fog re-arms to clean white depth.
 *   l 0.16 → 0.94   the line is DRAWN along a CatmullRom route — it begins as a short
 *                   thin curved mark diving downward (the fall hands over to it),
 *                   then straightens into bold geometric diagonals while the camera
 *                   glides along an offset companion of the same curve, tracking the
 *                   leading edge. Tube radius grows along the length: thin→bold.
 *   l 0.55 → 0.85   the red doorway assembles at the route's end: a thick extruded
 *                   frame with real depth in the white space, a soft light inside,
 *                   `project-entry` (the only placeholder content).
 *   l → 1           arrival, ~5.6 m from the opening, facing it. Not through it.
 *
 * Reveal mechanism: an animated draw range over a custom variable-radius tube
 * (ordered triangle strips along the curve) — exact, cheap, reversible.
 */
import * as THREE from 'three';
import { ABYSS, abyssWeights } from './scene5.js';
import { FALL } from './scene4.js';

const winW = (x, [a, b]) => THREE.MathUtils.smoothstep(x, a, b);
const clamp01 = (x) => Math.min(1, Math.max(0, x));

/* ───────────────────────────── the one config block ───────────────────────── */

export const RED = {
  /** route control points, LOCAL to the abyss-bottom anchor (the camera's exact
   *  end position — computed from PATH/FALL/ABYSS, never hardcoded). The first
   *  three points dive with the fall (short curved mark), then the route lifts
   *  into long geometric diagonals toward the door. */
  line: {
    points: [
      [0.0, 0.0, 0.0],
      [0.9, -3.4, 1.7],
      [2.7, -5.9, 4.7],
      [5.8, -5.5, 8.5],
      [9.4, -3.0, 12.5],
      [13.6, 0.5, 16.6],
      [17.6, 4.3, 20.6],
      [20.6, 7.2, 24.2],
      [22.4, 8.6, 26.6],
    ],
    tension: 0.42, // catmullrom tension: low = straighter, more geometric segments
    revealWin: [0.16, 0.94], // l window over which drawRange sweeps 0 → full
    segs: 340, // tube length segments
    radial: 9, // tube cross-section segments
    rStart: 0.045, // thin mark…
    rEnd: 0.17, // …bold route (radius also eases along length)
    radiusEase: [0.1, 0.8], // where along u the thin→bold transition runs
    color: 0xd7263d, // the red. no other red exists anywhere in the story before this.
    glowOpacity: 0.3, // soft red edge = a second translucent fatter tube (lightweight)
    leadDot: true, // bright disc riding the leading edge (the "pen")
  },

  cam: {
    lead: 0.06, // look-ahead along the curve (fraction of route length)
    side: 3.6, // companion offset: how far beside the line the camera flies…
    up: 1.7, // …and above it
    back: 9.6, // trailing distance behind the leading edge at full frame arrival
    sideEnd: 0.5, // lateral offset eases toward the route for a centred door arrival
    trackWin: [0.05, 0.2], // l window: blend from Scene 5's held aim into tracking
    followDip: 0.5, // look target sits slightly into the drawn part, not exactly on it
  },

  white: {
    shellWin: [0.05, 0.3], // opaque white shell (swallows the abyss; depth-test-free)
    fogWin: [0.02, 0.36], // fog re-arms dark-blue → clean white depth haze
    fogNear: 24,
    fogFar: 150,
    fogColor: 0xffffff,
    killShaftAt: 0.5, // scene 5's shaft group is switched off beyond this (l)
  },

  drain: {
    n: 260, // code motes pulled into the line's leading point
    win: [0.02, 0.26],
    fade: [0.2, 0.36],
    color: 0xb8323f, // embering code red, not neon
    size: 0.07,
    radius: [2.5, 15], // scatter shell the motes start from (around the anchor)
  },

  door: {
    at: 1.0, // route fraction the door sits on (the end of the line)
    beyond: 1.4, // metres past the last route point
    w: 4.2, // clear opening (m) — sized so the arrival fits a PHONE aspect with margin
    h: 6.0, //   (guard: all four door corners inside frame at 16/9 AND 390×844)
    jamb: 0.55, // frame thickness — deliberately architectural
    depth: 1.5, // extruded into the white space
    color: 0xd7263d,
    revealWin: [0.55, 0.85], // assembles (fades/scales in) as the line completes
    entryColor: 0xfffaf2, // the placeholder light inside: `project-entry`
    entryGlow: 1, // its opacity — flat soft light, no content
  },

  /** where the line's world sits: derived, never typed — see anchor() below */
  anchorNote: 'rig.cameraCurve(1) − FALL.camera.drop − ABYSS.travel, all three from config',
};

/* ─────────────────────────── pure helpers (testable) ──────────────────────── */

export const lineWeights = (l) => {
  const x = clamp01(l);
  const u = winW(x, RED.line.revealWin);
  return {
    l: x,
    u, // drawn fraction of the route
    shell: winW(x, RED.white.shellWin),
    fog: winW(x, RED.white.fogWin),
    track: winW(x, RED.cam.trackWin),
    door: winW(x, RED.door.revealWin),
    drain: winW(x, RED.drain.win),
    drainFade: 1 - winW(x, RED.drain.fade),
    active: x > 1e-6,
  };
};

/** the abyss-bottom anchor: EXACTLY where Scene 5 leaves the camera (config-derived,
 *  so retuning any earlier budget moves the door with it instead of breaking it) */
export function abyssAnchor(rig) {
  const p = rig.cameraCurve.getPoint(1);
  return new THREE.Vector3(p.x, p.y - FALL.camera.drop - ABYSS.travel, p.z);
}

const T2 = new THREE.Vector3(); // scratch for variableTube (build-time only)

/** variable-radius tube along a curve, triangulated IN LENGTH ORDER so a drawRange
 *  over the index buffer reveals it from the start — the whole reveal mechanism. */
function variableTube(curve, segs, radial, radiusFn) {
  const pos = [];
  const idx = [];
  const F = new THREE.Vector3();
  const N = new THREE.Vector3();
  const B = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const P = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    curve.getPoint(u, P);
    curve.getTangent(u, T2);
    F.copy(T2).normalize();
    N.crossVectors(up, F);
    if (N.lengthSq() < 1e-6) N.set(1, 0, 0);
    N.normalize();
    B.crossVectors(F, N).normalize();
    const r = radiusFn(u);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const ca = Math.cos(a) * r;
      const sa = Math.sin(a) * r;
      pos.push(P.x + N.x * ca + B.x * sa, P.y + N.y * ca + B.y * sa, P.z + N.z * ca + B.z * sa);
    }
  }
  const ring = radial + 1;
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radial; j++) {
      const a0 = i * ring + j;
      const b0 = a0 + ring;
      idx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1);
    }
  }
  // closed end-cap at the far end (only visible when the reveal completes; the
  // leading-edge open end is hidden by the lead disc riding the same point)
  const cEnd = pos.length / 3;
  curve.getPoint(1, P);
  pos.push(P.x, P.y, P.z);
  for (let j = 0; j < radial; j++) idx.push(cEnd, (segs + 1) * ring + j, (segs + 1) * ring + j + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
/* ───────────────────────────── the layer ──────────────────────────────────── */

/**
 * @param {{ scene, camera, rig, map, shaft? }} ctx — `shaft` is Scene 5's layer
 * (optional; used only to switch its group off inside the white world).
 */
export function createRedLineLayer(ctx) {
  const { scene, camera, map } = ctx;
  const anchor = abyssAnchor(ctx.rig);

  // local space: the world group sits at the anchor, so the authored points ARE local
  const curve = new THREE.CatmullRomCurve3(RED.line.points.map((p) => new THREE.Vector3(...p)), false, 'catmullrom', RED.line.tension);
  // world-space centre of the doorway — the arrival aim/position blend to THIS, so the
  // composition is robust at every aspect instead of tuned against the route's last point
  const doorWorld = curve.getPoint(1).add(curve.getTangent(1).normalize().multiplyScalar(RED.door.beyond)).add(anchor);
  const radiusFn = (u) => THREE.MathUtils.lerp(RED.line.rStart, RED.line.rEnd, winW(u, RED.line.radiusEase));

  const world = new THREE.Group();
  world.position.copy(anchor); // local space = the authored route above
  world.visible = false;
  if (scene) scene.add(world);

  const mat = (extra) => new THREE.MeshBasicMaterial({ color: RED.line.color, toneMapped: false, transparent: true, ...extra });

  /* the line: core tube (revealed by draw range) + fatter soft-edge tube + lead disc */
  const coreGeo = variableTube(curve, RED.line.segs, RED.line.radial, radiusFn);
  const coreIdxTotal = coreGeo.index.count;
  coreGeo.setDrawRange(0, 0); // dormant until apply() reveals — never the Infinity default
  const core = new THREE.Mesh(coreGeo, mat({ opacity: 1, side: THREE.DoubleSide }));
  core.renderOrder = 12;
  core.frustumCulled = false;
  core.userData.flatPass = true; // proof-compositor tag (see tools/.visual-proof.mjs)

  const glowGeo = variableTube(curve, RED.line.segs, RED.line.radial, (u) => radiusFn(u) * 2.9 + 0.03);
  const glowIdxTotal = glowGeo.index.count;
  glowGeo.setDrawRange(0, 0);
  const glow = new THREE.Mesh(glowGeo, mat({ opacity: RED.line.glowOpacity, blending: THREE.NormalBlending, depthWrite: false, side: THREE.DoubleSide }));
  glow.renderOrder = 11;
  glow.frustumCulled = false;
  glow.userData.flatPass = true;

  let lead = null;
  if (RED.line.leadDot) {
    lead = new THREE.Mesh(new THREE.CircleGeometry(1, 22), mat({ opacity: 0.95 }));
    lead.renderOrder = 13;
    lead.userData.flatPass = true;
  }

  /* the white shell: depth-test-free, renderOrder 5 → swallows everything the
     earlier scenes draw (that IS the transition; the abyss is gone, not faded) */
  const shell = new THREE.Mesh(new THREE.SphereGeometry(90, 18, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide, transparent: true, opacity: 0, depthWrite: false, depthTest: false, fog: false, toneMapped: false }));
  shell.renderOrder = 5;
  shell.userData.flatPass = true;
  shell.visible = false;

  /* drain: the remaining code pulled into the leading point */
  const dn = RED.drain.n;
  const dPos = new Float32Array(dn * 3);
  const dSeed = [];
  let rs = 20260916;
  const rnd = () => ((rs = (rs * 1664525 + 1013904223) % 4294967296) / 4294967296 - 0.5) * 2;
  for (let i = 0; i < dn; i++) {
    const th = ((i * 137) % 61) / 61 * Math.PI * 2;
    const r = THREE.MathUtils.lerp(RED.drain.radius[0], RED.drain.radius[1], ((i * 89) % 47) / 47);
    const y = ((i * 53) % 37) / 37 - 0.5;
    dSeed.push({ sc: new THREE.Vector3(Math.cos(th) * r, y * 16 - 3, Math.sin(th) * r), jit: new THREE.Vector3(rnd() * 0.7, rnd() * 0.7, rnd() * 0.7), stag: ((i * 31) % 19) / 19 });
  }
  const dGeo = new THREE.BufferGeometry();
  dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
  const drain = new THREE.Points(dGeo, new THREE.PointsMaterial({ color: RED.drain.color, size: RED.drain.size, transparent: true, opacity: 0, depthWrite: false, fog: false, sizeAttenuation: true }));
  drain.frustumCulled = false;
  drain.renderOrder = 10;
  drain.userData.flatPass = true;

  /* the doorway: thick red frame with real depth + the `project-entry` placeholder.
     Built once at the route's end, oriented to the final tangent. */
  const doorG = new THREE.Group();
  {
    const t = curve.getTangent(1).normalize();
    doorG.position.copy(curve.points[curve.points.length - 1].clone().addScaledVector(t, RED.door.beyond)); // straight past the route's end, facing the arriving camera
    doorG.lookAt(curve.getPoint(0.985).add(anchor)); // lookAt reads WORLD space
    const D = RED.door;
    const mDoor = new THREE.MeshBasicMaterial({ color: D.color, toneMapped: false, transparent: true, opacity: 0, side: THREE.DoubleSide });
    const halfW = D.w / 2;
    const halfH = D.h / 2;
    const jamb = (w, h, x, y) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, D.depth), mDoor);
      b.position.set(x, y, 0);
      b.userData.flatPass = true;
      return b;
    };
    doorG.add(
      jamb(D.jamb, D.h + D.jamb * 2, -(halfW + D.jamb / 2), 0), // left post
      jamb(D.jamb, D.h + D.jamb * 2, halfW + D.jamb / 2, 0), // right post
      jamb(D.w + D.jamb * 2, D.jamb, 0, halfH + D.jamb / 2), // lintel
      jamb(D.w + D.jamb * 2, D.jamb * 0.7, 0, -(halfH + D.jamb * 0.35)) // threshold
    );
    // the soft light inside: the placeholder for the future project — nothing else
    const entry = new THREE.Mesh(new THREE.PlaneGeometry(D.w, D.h), new THREE.MeshBasicMaterial({ color: D.entryColor, toneMapped: false, transparent: true, opacity: 0, depthWrite: false, fog: true }));
    entry.position.set(0, 0, -D.depth * 0.55);
    entry.name = 'project-entry';
    entry.userData.projectEntry = true; // the hook: Scene 7 replaces THIS plane
    entry.userData.flatPass = true;
    doorG.add(entry);
    // renderOrder is per-MESH in three.js (a group's order does not cascade) — the
    // frame must draw after the white shell (5) or the doorway hides inside the ball
    for (const c of doorG.children) c.renderOrder = c.userData.projectEntry ? 13 : 12;
    doorG.userData.frameMat = mDoor;
    doorG.userData.entryMat = entry.material;
  }
  world.add(shell, glow, core, drain, doorG);
  if (lead) world.add(lead);

  /* fog end states read from config (scene 5's at-rest values) — continuous at l→0 */
  const fromFog = { color: new THREE.Color(ABYSS.fog.color), near: ABYSS.fog.near, far: ABYSS.fog.far };
  const toFog = { color: new THREE.Color(RED.white.fogColor), near: RED.white.fogNear, far: RED.white.fogFar };

  const tmpP = new THREE.Vector3();
  const tmpT = new THREE.Vector3();
  const doorFace = new THREE.Vector3(0, 0, 1).applyQuaternion(doorG.getWorldQuaternion(new THREE.Quaternion())).normalize();
  const tmpLead = new THREE.Vector3();
  const tmpPrev = new THREE.Vector3();
  const tmpSide = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const q1 = new THREE.Quaternion();
  const UP = new THREE.Vector3(0, 1, 0);
  const lookLocal = new THREE.Vector3();
  let lastL = -1;
  let lastOut = { l: 0, u: 0, w: lineWeights(0) };

  const apply = (t01Damped) => {
    const l = map.l ? map.l(t01Damped) : 0;
    const w = lineWeights(l);
    lastOut = { l, u: w.u, w };
    if (!w.active && lastL <= 1e-6) return lastOut; // fully dormant — write nothing
    const on = w.active;
    world.visible = on;
    if (on) {
      /* line reveal: animated draw range over length-ordered tube indices */
      const nCore = Math.floor(coreIdxTotal * w.u);
      coreGeo.setDrawRange(0, nCore);
      glowGeo.setDrawRange(0, Math.floor(glowIdxTotal * w.u));
      core.visible = glow.visible = w.u > 0.0005;
      if (lead) {
        curve.getPoint(w.u, tmpP);
        lead.position.copy(tmpP); // local, like the geometry
        lead.quaternion.copy(camera.quaternion);
        const rr = radiusFn(w.u) * (2.3 + 1.6 * w.u);
        lead.scale.setScalar(Math.max(0.001, rr));
        lead.visible = w.u > 0.0005 && w.u < 0.9995;
      }
      /* door assembles at the route end */
      const dw = w.door;
      doorG.visible = dw > 0.001;
      doorG.scale.setScalar(0.82 + 0.18 * dw);
      doorG.userData.frameMat.opacity = dw;
      doorG.userData.entryMat.opacity = dw * RED.door.entryGlow;
      /* drain: code motes converge into the leading point, then fade */
      const dN = Math.floor(dn * (1 - w.u * 0.85)); // as the line completes, motes are spent
      dGeo.setDrawRange(0, Math.max(0, dN));
      drain.visible = dN > 0 && w.drainFade > 0.01;
      if (drain.visible) {
        curve.getPoint(Math.min(1, w.u + 0.015), tmpLead); // local space, shared by the drain points
        for (let i = 0; i < dN; i++) {
          const sd = dSeed[i];
          const t = THREE.MathUtils.smoothstep(l, 0.02 + sd.stag * 0.16, 0.26);
          tmpT.lerpVectors(sd.sc, tmpLead, t).addScaledVector(sd.jit, (1 - t) * 2.2 + 0.12);
          dPos.set([tmpT.x, tmpT.y, tmpT.z], i * 3);
        }
        dGeo.attributes.position.needsUpdate = true;
        drain.material.opacity = 0.62 * w.drain * w.drainFade;
      }
      /* the white world */
      shell.visible = w.shell > 0.002;
      shell.material.opacity = w.shell;
      if (scene?.fog) {
        scene.fog.color.copy(fromFog.color).lerp(toFog.color, w.fog);
        scene.fog.near = THREE.MathUtils.lerp(fromFog.near, toFog.near, w.fog);
        scene.fog.far = THREE.MathUtils.lerp(fromFog.far, toFog.far, w.fog);
      }
      // the shaft has no business being visible inside a white ball — scene 5
      // re-asserts visibility each frame at a > 0, so this is written every frame
      // here: an absolute function of l, exact both directions
      if (ctx.shaftLayer) ctx.shaftLayer.group.visible = w.shell < RED.white.killShaftAt;
    }
    /* camera: the ONLY world-motion owner once the line wakes. At track = 0 the
       frame is Scene 5's exact output (nothing written); the blend reads the live
       quaternion every frame, so it is pure and never accumulates. */
    if (w.track > 1e-6) {
      const u = w.u;
      const ease = THREE.MathUtils.smoothstep(l, RED.cam.trackWin[0], RED.cam.trackWin[1] + 0.12);
      curve.getPoint(Math.max(0, u - RED.cam.back / curve.getLength()), tmpP);
      curve.getTangent(clamp01(u), tmpT);
      tmpSide.crossVectors(UP, tmpT).normalize();
      const sideNow = THREE.MathUtils.lerp(RED.cam.side, RED.cam.sideEnd, THREE.MathUtils.smoothstep(u, 0.72, 1));
      tmpP.addScaledVector(tmpSide, sideNow * ease);
      tmpP.y += RED.cam.up * ease;
      tmpP.add(anchor); // route is local; the camera is world space
      lookLocal.copy(curve.getPoint(Math.min(1, u + RED.cam.lead))).add(anchor); // world target
      lookLocal.y -= RED.cam.followDip * (1 - u); // early: gaze stays a touch into the fall
      const fin = THREE.MathUtils.smoothstep(u, 0.9, 1); // final approach: square up on the door
      if (fin > 0) {
        // square to the DOOR's own facing (its frame normal), not the route tangent —
        // the last segment curves, and any yaw mismatch would push it off-centre on phones
        tmpP.copy(doorWorld).addScaledVector(doorFace, -RED.cam.back);
        tmpP.y += RED.cam.up * 0.35 * ease;
        camera.position.lerpVectors(camera.position, tmpP, fin); // FROM the tracked pose — pure
        lookLocal.lerp(doorWorld, fin);
      } else {
        tmpPrev.copy(camera.position); // blend FROM the live frame — never accumulates
        camera.position.lerpVectors(tmpPrev, tmpP, ease);
      }
      tmpQ.copy(camera.quaternion);
      camera.lookAt(lookLocal);
      q1.copy(camera.quaternion); // receiver must never double as an operand of slerpQuaternions
      camera.quaternion.copy(tmpQ).slerp(q1, Math.max(ease, w.track * 0.35));
    }
    lastL = l;
    return lastOut;
  };

  return {
    get group() {
      return world;
    },
    get last() {
      return lastOut;
    },
    curve,
    weights: lineWeights,
    update(t01Damped) {
      return apply(t01Damped);
    },
  };
}
