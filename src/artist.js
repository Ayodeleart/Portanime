/**
 * artist.js — Scene 1–3 actor: a stylised human painter, his easel, and his reaction.
 *
 * Why it is built this way
 * -----------------------
 * Every part is a *loft through elliptical cross-sections* (see loft.js) rather than a
 * capsule or a sphere, because a human silhouette is carried by tapering: a ribcage that
 * narrows into a waist, a jaw under a skull, a forearm into a wrist. Two things do more
 * work than any amount of geometry:
 *
 *   · contrapposto — weight on his right leg, so the pelvis rises on that side, the chest
 *     counter-tilts and the head levels. A symmetric standing figure always reads as a
 *     mannequin; an asymmetric one reads as a person even in pure silhouette.
 *   · the head is not a ball. Skull → brow → jaw → chin, plus ears, a nose and hair with
 *     a low knot at the nape. From the close-up you see hair, beret, the trapezius slope
 *     into the shoulders; from the side you see a profile with a chin and an ear.
 *
 * The easel is a studio tripod: two front legs and a rear leg, a central mast with a
 * turnable knob, a lower ledge the canvas rests on, and two top clamps gripping it —
 * those clamps are what make it read as an easel at 3 m in silhouette.
 *
 * `MARKS` is the contract with camera-path.js: build any replacement figure so that its
 * world anchors land inside ~0.05 m of these numbers and the existing framing still holds.
 * `npm run check` asserts exactly that.
 */

import * as THREE from 'three';
import { loftGeometry, limbGeometry, blob } from './loft.js';
import { SCENE3 } from './scene3.js';

/* ───────────────────────────── anchors (camera contract) ───────────────────────────── */

/** Floor-space anchors in the *artist's own* frame (before POSE.yaw turns the whole
 *  composition): he FACES +Z, his right side is -X, the floor is y = 0. To compare these
 *  with world positions, rotate them by POSE.yaw — that is exactly what the check asserts. */
export const MARKS = {
  head: new THREE.Vector3(0, 1.62, -0.06),
  nape: new THREE.Vector3(0, 1.5, 0.04),
  chest: new THREE.Vector3(0, 1.24, 0.03),
  shoulderR: new THREE.Vector3(-0.205, 1.44, -0.02),
  shoulderL: new THREE.Vector3(0.205, 1.44, -0.02),
  hipR: new THREE.Vector3(-0.088, 0.9, -0.01),
  hipL: new THREE.Vector3(0.088, 0.9, -0.01),
  canvas: new THREE.Vector3(0, 1.13, 0.97),
  canvasSize: { w: 0.56, h: 0.44 },
  canvasTilt: -0.17, // radians about X: top leans away from the painter
  /** A studio A-frame. Everything converges on the mast, because a side profile only reads
   *  as "easel" when the members visibly meet: legs → post → rear prop → tray → clamps. */
  easel: {
    legSplayX: 0.34, // front legs' half-spacing at the floor
    legTopX: 0.06, // …and where they close on the mast
    legTopY: 1.62,
    frontFootZ: 0.36,
    mastFootZ: 1.3,
    mastTopY: 1.74,
    mastTopZ: 1.12,
    rearFootZ: 1.95,
    rearJoinY: 0.95,
    trayY: 0.87,
    trayW: 0.52,
  },
  height: 1.79,
};

/* ───────────────────────────── pose (tweak freely) ───────────────────────────── */

export const POSE = {
  yaw: -0.12, // whole composition turned ~7° toward the end camera, for a 3/4 profile
  hips: { z: -0.05, y: 0.04 }, // pelvis drops over the free (left) leg
  chest: { x: -0.05, y: -0.06, z: 0.035 }, // lean toward the canvas, twist to the brush
  head: { x: 0.02, y: 0.05, z: -0.02 },
  brushArm: { x: -1.5, y: -0.12, z: 0.3, elbow: 0.55 },
  paletteArm: { x: -0.15, y: -0.34, z: 0.16, elbow: -1.45 },
  freeLeg: { hip: -0.1, knee: 0.17, splay: 0.07 }, // relaxed left leg
  /**
   * The easel + board are turned this far about Y (0.5 rad ≈ 29°) for one reason: at the
   * Scene-2 camera (azimuth 93°) an unturned easel is *exactly* edge-on — the board becomes a
   * black slat and the two front legs overlap into one stick, so it reads as a pile of poles.
   * Turning it presents a 3/4 trapezoid to that camera, puts the top clamps in silhouette and
   * lets the painted face catch the light at a raking angle. It still faces the painter, and it
   * pivots about the board's own centre so MARKS.canvas — the anchor his brush aims at — does
   * not move. Set to 0 to see the difference for yourself.
   */
  easelTurn: 0.5,
};

export const IDLE = {
  breathHz: 0.135,
  swayHz: 0.037,
  strokeHz: 0.247,
  strokeAmp: 0.085,
  strokeGate: 0.29, // how often the arm pauses to study the canvas
};

/* ───────────────────────────── materials (procedural, no downloads) ───────────────── */

const hasDom = typeof document !== 'undefined';

/** tiny canvas-generated textures: grain and a half-finished painting. ~128px, then reused. */
function makeTexture(w, h, draw) {
  if (!hasDom) return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const grainTex = makeTexture(64, 256, (ctx, w, h) => {
  ctx.fillStyle = '#8c8477';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * w;
    ctx.strokeStyle = `rgba(${Math.random() > 0.5 ? '60,48,38' : '170,158,140'},${0.05 + Math.random() * 0.14})`;
    ctx.lineWidth = 0.6 + Math.random() * 2.2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.bezierCurveTo(x + Math.random() * 6 - 3, h * 0.35, x + Math.random() * 6 - 3, h * 0.7, x + Math.random() * 4 - 2, h);
    ctx.stroke();
  }
});

const paintTex = makeTexture(128, 128, (ctx, w, h) => {
  // warm linen primer, not a mid-blue rectangle: lit by the scene the way a real canvas is,
  // a blue-grey fill reads as a screen (and the shot starts looking like a UI)
  ctx.fillStyle = '#4c4437';
  ctx.fillRect(0, 0, w, h);
  const tones = ['#63594a', '#7a6a52', '#8d8471', '#413a31', '#93805f', '#556579'];
  for (let i = 0; i < 26; i++) {
    ctx.save();
    ctx.translate(Math.random() * w, Math.random() * h);
    ctx.rotate((Math.random() - 0.5) * 1.7);
    ctx.globalAlpha = 0.22 + Math.random() * 0.5;
    ctx.fillStyle = tones[(Math.random() * tones.length) | 0];
    const sw = 12 + Math.random() * 66;
    ctx.fillRect(-sw / 2, -(3 + Math.random() * 9), sw, 6 + Math.random() * 18);
    ctx.restore();
  }
  // a horizon-ish band so it reads as a landscape in progress, not noise
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = '#a9b0bd';
  ctx.fillRect(0, h * 0.52, w, 4);
  ctx.globalAlpha = 1;
});

function materials() {
  const mk = (o) => new THREE.MeshStandardMaterial(o);
  return {
    skin: mk({ color: 0x0d1119, roughness: 0.78, metalness: 0.0 }),
    cloth: mk({ color: 0x101725, roughness: 1.0, map: grainTex }), // the smock is the LIGHTEST
    trouser: mk({ color: 0x080b12, roughness: 0.95 }),            // dark tone: two tones, or the
    trouserSeam: mk({ color: 0x05070c, roughness: 1.0 }),        // legs read as one block
    hair: mk({ color: 0x05070c, roughness: 0.42, metalness: 0.05, side: THREE.DoubleSide }), // glossier: catches the rim
    leather: mk({ color: 0x0b0c10, roughness: 0.6 }),
    wood: mk({ color: 0x4a3c2e, roughness: 0.72, map: grainTex }),
    canvasFront: mk({ color: 0xb9af9a, roughness: 0.95, map: paintTex }),
    tin: mk({ color: 0x2a2d33, roughness: 0.55, metalness: 0.35 }), // a bright specular tab by the board reads as a UI accent
    paint: mk({ color: 0x6f7f9f, roughness: 0.4, emissive: 0x0a1018, emissiveIntensity: 0.12 }),
    palette: mk({ color: 0x241b13, roughness: 0.85 }),
    dab: mk({ color: 0x3d465e, roughness: 0.4, emissive: 0x0b1220, emissiveIntensity: 0.35 }), // palette dabs stay dim: a bright disc beside the torso reads as a plate
  };
}

/* ───────────────────────────── build helpers ───────────────────────────── */

const place = (obj, x, y, z) => (obj.position.set(x, y, z), obj);

function part(geo, mat, parent, pos, rot, scale) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  if (pos) m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  if (scale) m.scale.set(...scale);
  if (parent) parent.add(m);
  return m;
}

const loftPart = (sections, mat, parent, opts, ...rest) => part(loftGeometry(sections, opts), mat, parent, ...rest);

/** a cylinder between two points — easel legs, mast, clamps */
function strut(from, to, r0, r1, mat, parent) {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const dir = b.clone().sub(a);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(r1, r0, len, 12, 1);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  if (parent) parent.add(m);
  return m;
}

/** soft radial blob on the floor — grounds props without a second shadow pass */
function contactBlob(rx, rz, at, opacity, parent) {
  if (!hasDom) return null;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 3, 64, 64, 62);
  g.addColorStop(0, `rgba(0,0,0,${opacity})`);
  g.addColorStop(0.5, `rgba(0,0,0,${opacity * 0.6})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(rx, rz),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(at[0], at[1] ?? 0.003, at[2]);
  parent.add(m);
  return m;
}

/** shoulder → upper arm → elbow → forearm → wrist → hand (all poseable via the pivots) */
function makeArm({ shoulder, mats, pose, brush = false }) {
  const pivot = new THREE.Group();
  pivot.position.set(shoulder.x, shoulder.y, shoulder.z);
  pivot.rotation.set(pose.x, pose.y, pose.z);

  part(limbGeometry({ length: 0.28, r0: 0.06, r1: 0.05, r2: 0.044, bulge: 0.009, radial: 20 }), mats.skin, pivot);
  part(blob(0.062, 1.05, 2), mats.skin, pivot, [0, -0.012, 0], null, [1, 1.1, 0.95]); // deltoid caps the joint

  const elbow = new THREE.Group();
  elbow.position.y = -0.3;
  elbow.rotation.x = pose.elbow;
  pivot.add(elbow);
  part(limbGeometry({ length: 0.26, r0: 0.047, r1: 0.04, r2: 0.03, radial: 14 }), mats.skin, elbow);
  part(blob(0.046, 1, 1), mats.skin, elbow, [0, -0.006, -0.002]); // elbow point, big enough to hide the step

  const hand = new THREE.Group();
  hand.position.y = -0.285;
  elbow.add(hand);
  // a hand as a loft: wrist → palm → knuckles → fingers, flattened front to back
  part(
    loftGeometry(
      [
        { y: 0.01, rx: 0.024, rz: 0.019 },
        { y: -0.035, rx: 0.038, rz: 0.026 },
        { y: -0.075, rx: 0.041, rz: 0.021 },
        { y: -0.105, rx: 0.032, rz: 0.014, s: 0.9 },
      ],
      { radial: 18 }
    ),
    mats.skin,
    hand,
    [0, -0.01, 0],
    [0.2, 0, 0]
  );
  part(blob(0.017, 1, 1), mats.skin, hand, [0.028, -0.05, 0.014], null, [1.5, 0.85, 1]); // thumb

  let tool = null;
  if (brush) {
    tool = new THREE.Group();
    // 1.26 rad is solved, not guessed: the brush line runs along the tool's +z, and the arm
    // pose (pivot -1.5 + elbow 0.55) puts the hand's frame about -0.95 rad from world, so this
    // is the value that makes the tip leave the fist FORWARD-and-slightly-down toward the board.
    // Any smaller and it lies along the forearm like a cross; any larger and it juts past the
    // knuckles into empty air. Handle stays short for the same reason.
    tool.rotation.x = 1.26;
    tool.position.set(0, -0.058, 0.004);
    hand.add(tool);
    part(new THREE.CylinderGeometry(0.0095, 0.008, 0.17, 10), mats.wood, tool, [0, 0, 0.078]);
    part(new THREE.CylinderGeometry(0.011, 0.0085, 0.038, 10), mats.tin, tool, [0, 0, 0.178]);
    part(new THREE.CylinderGeometry(0.0055, 0.0105, 0.045, 10), mats.paint, tool, [0, 0, 0.216]);
  }
  return { pivot, elbow, hand, tool };
}

/* ───────────────────────────── the figure ───────────────────────────── */

export function createArtist(conf = MARKS) {
  const mats = materials();

  const group = new THREE.Group(); // composition root: shares its yaw with the props
  group.rotation.y = POSE.yaw;
  const figure = new THREE.Group(); // the body only — this is what steps toward the star
  const props = new THREE.Group(); // easel, canvas, stool: bolted to the floor
  group.add(figure, props);

  const hips = new THREE.Group();
  place(hips, 0, 0.92, 0);
  hips.rotation.set(0, POSE.hips.y, POSE.hips.z);
  figure.add(hips);

  /* pelvis + waist -------------------------------------------------- */
  loftPart(
    [
      { y: -0.17, rx: 0.126, rz: 0.108 },
      { y: -0.07, rx: 0.148, rz: 0.122 },
      { y: 0.01, rx: 0.163, rz: 0.128 },
      { y: 0.1, rx: 0.15, rz: 0.12 },
    ],
    mats.trouser,
    hips
  );
  for (const s of [-1, 1]) part(blob(0.05, 1, 1), mats.trouser, hips, [s * 0.086, -0.11, 0.005], null, [1, 1.1, 1]); // greater trochanter

  /* legs: weight on his right, left leg relaxed -------------------- */
  const legs = {};
  for (const side of [-1, 1]) {
    const weight = side < 0;
    const hip = new THREE.Group();
    place(hip, side * 0.088, -0.055, weight ? -0.012 : 0.03);
    if (!weight) hip.rotation.set(POSE.freeLeg.hip, 0, -POSE.freeLeg.splay);
    hips.add(hip);
    part(limbGeometry({ length: 0.44, r0: 0.088, r1: 0.068, r2: 0.062, bulge: 0.006, radial: 20 }), mats.trouser, hip);

    const knee = new THREE.Group();
    knee.position.y = -0.44;
    knee.rotation.x = weight ? -0.02 : POSE.freeLeg.knee;
    hip.add(knee);
    part(blob(0.052, 1, 1), mats.trouser, knee, [0, 0.006, weight ? 0.006 : 0.002]);
    part(limbGeometry({ length: 0.4, r0: 0.058, r1: 0.045, r2: 0.033, radial: 20 }), mats.trouser, knee);
    part(new THREE.BoxGeometry(0.012, 0.34, 0.012), mats.trouserSeam, knee, [side * 0.052, -0.2, 0.032]); // inner seam: splits the legs
    // calf belly, then a shoe: a slab with a lifted toe
    part(blob(0.046, 1.5, 1), mats.trouser, knee, [0, -0.13, -0.016], null, [1, 1, 1]);
    part(new THREE.BoxGeometry(0.1, 0.052, 0.2), mats.leather, knee, [0, -0.42, 0.052], [0.06, side * -0.1, 0], [1, 1, 1]);
    part(blob(0.034, 0.6, 1), mats.leather, knee, [0, -0.415, 0.14], [0.2, 0, 0], [1.5, 0.8, 1.2]);
    legs[side < 0 ? 'right' : 'left'] = { hip, knee };
  }

  /* torso ------------------------------------------------------------ */
  const chest = new THREE.Group();
  place(chest, 0, 0.1, 0);
  chest.rotation.set(POSE.chest.x, POSE.chest.y, POSE.chest.z);
  hips.add(chest);
  const chestBaseY = chest.position.y;

  loftPart(
    [
      { y: -0.1, rx: 0.15, rz: 0.118 }, // over the pelvis
      { y: 0.02, rx: 0.139, rz: 0.107, cz: -0.004 }, // waist, slightly tucked
      { y: 0.14, rx: 0.157, rz: 0.121, cz: 0.004 }, // floating ribs
      { y: 0.28, rx: 0.173, rz: 0.131, cz: 0.006 }, // ribcage
      { y: 0.4, rx: 0.176, rz: 0.116, cz: 0.002 }, // pecs / collar base
      { y: 0.485, rx: 0.16, rz: 0.094 }, // shelf, narrower than the deltoids on purpose
    ],
    mats.skin,
    chest
  );
  // Trapezius: without these two wedges the neck meets the shoulders at a 90° step and the
  // figure reads as a chess piece. They are the single most humanising pair of meshes here.
  for (const side of [-1, 1])
    part(blob(0.072, 0.78, 2), mats.skin, chest, [side * 0.095, 0.44, -0.008], [0, 0, side * -0.55], [1.42, 0.52, 1]);
  part(blob(0.042, 0.8, 1), mats.skin, chest, [0, 0.452, -0.016]); // the ridge at C7, felt from behind

  // painter's smock: an open-fronted apron (arc leaves the back of the legs free)
  // The smock tracks the body at ~1.05× instead of standing off it — a tent reads as a bell.
  const apronSections = [
    { y: -0.06, rx: 0.158, rz: 0.128 },
    { y: 0.14, rx: 0.163, rz: 0.134 },
    { y: 0.3, rx: 0.176, rz: 0.14 },
    { y: 0.4, rx: 0.184, rz: 0.128 },
  ];
  loftPart(apronSections, mats.cloth, hips, { radial: 30, arc: [-2.3, 2.3], caps: false }, [0, -0.14, 0.004]);
  part(loftGeometry([{ y: 0.02, rx: 0.152, rz: 0.03 }, { y: 0.3, rx: 0.14, rz: 0.028 }], { radial: 16, arc: [-1.2, 1.2], caps: false }), mats.cloth, chest, [0, 0.14, 0.116]); // bib
  part(new THREE.BoxGeometry(0.03, 0.02, 0.012), mats.tin, chest, [0.1, 0.3, 0.13], [0, -0.3, 0.1]); // brush in the bib
  part(new THREE.BoxGeometry(0.03, 0.02, 0.012), mats.wood, chest, [0.128, 0.298, 0.128], [0, -0.1, 0.16]);

  /* neck + head ------------------------------------------------------- */
  loftPart(
    [
      { y: 0.45, rx: 0.066, rz: 0.058, cz: -0.01 }, // into the trapezius
      { y: 0.54, rx: 0.047, rz: 0.048, cz: -0.012 }, // the narrow part of the neck
      { y: 0.62, rx: 0.052, rz: 0.056, cz: -0.01 }, // skull base
    ],
    mats.skin,
    chest,
    { radial: 20 }
  );
  // (no separate nape mass: it poked out behind the skull as a second ball — the hair
  //  shell's lowest ring already covers the nape)

  const head = new THREE.Group();
  place(head, conf.head.x, 0.6, conf.head.z); // → world (0, 1.62, -0.06) = MARKS.head
  head.rotation.set(POSE.head.x, POSE.head.y, POSE.head.z);
  chest.add(head);
  const headBase = head.rotation.clone();

  // rx (width) peaks at 0.086 while rz (depth) peaks at 0.108 — a real skull is 0.155 wide
  // and 0.20 deep. Getting that ratio right is what makes the profile a face and the
  // back-of-head view an occiput instead of a sphere.
  const skull = [
    { y: -0.104, rx: 0.056, rz: 0.052, cz: 0.012 }, // under the chin — kept wide: a narrow
    { y: -0.072, rx: 0.07, rz: 0.076, cz: 0.014 }, // ring here tapers the skull to a point
    { y: -0.03, rx: 0.08, rz: 0.094, cz: 0.01 }, // jaw → cheek
    { y: 0.026, rx: 0.086, rz: 0.103, cz: 0.004 }, // zygomatic / mid-face
    { y: 0.068, rx: 0.085, rz: 0.107 }, // brow
    { y: 0.104, rx: 0.08, rz: 0.102, cz: -0.006 }, // forehead
    { y: 0.126, rx: 0.056, rz: 0.072, cz: -0.014, s: 0.92 }, // crown
  ];
  const skullMesh = loftPart(skull, mats.skin, head, { radial: 32 });
  part(new THREE.ConeGeometry(0.016, 0.042, 12), mats.skin, head, [0, 0.006, 0.096], [Math.PI / 2, 0, 0]); // nose
  part(blob(0.015, 0.6, 1), mats.skin, head, [0, 0.038, 0.082], null, [1.5, 0.55, 0.6]); // brow ridge
  part(blob(0.024, 0.9, 1), mats.skin, head, [0, -0.078, 0.05], null, [1.2, 0.9, 1]); // chin
  for (const s of [-1, 1]) {
    part(blob(0.017, 1.3, 1), mats.skin, head, [s * 0.081, 0.004, -0.01], [0.06, 0, s * -0.22], [0.42, 1, 0.86]); // ear
    part(blob(0.011, 1, 1), mats.skin, head, [s * 0.016, -0.062, 0.056]); // jaw corner
  }

  // hair: a shell over the skull and back of the neck, with a knot at the nape
  const hair = loftPart(
    skull
      .slice(2)
      .map((sec, i) => ({ y: sec.y + (i > 3 ? 0.016 : 0.005), rx: sec.rx * 1.05, rz: sec.rz * 1.055, cz: (sec.cz ?? 0) - 0.012, s: sec.s ?? 1 })),
    mats.hair,
    head,
    // ~212° of sweep centred on the BACK of the skull: hair over the crown and nape, with
    // the face and brow left exposed. The cut rim sits under the beret, so it never shows.
    { radial: 32, arc: [-Math.PI / 2 - 1.85, -Math.PI / 2 + 1.85] }
  );
  part(blob(0.021, 0.9, 1), mats.hair, head, [0, -0.012, -0.09], null, [1.2, 0.9, 0.72]); // hair tied back, tucked inside the skull's silhouette
  // Beret: a full ellipsoid sunk *into* the crown. A hemisphere would leave its brim ring
  // floating at the crown height, which reads as a plate hovering above the head.
  const beret = part(new THREE.SphereGeometry(0.1, 26, 18), mats.cloth, head, [0.012, 0.128, -0.028], [-0.05, 0, 0.14], [1.1, 0.34, 1.16]);
  beret.castShadow = true;
  part(blob(0.01, 1, 1), mats.cloth, head, [0.012, 0.158, -0.032]); // nub

  /* arms -------------------------------------------------------------- */
  // MARKS gives the shoulders in floor space; the arms hang off the chest group, so the
  // y below is chest-local (chest origin sits at world y 1.02 → 0.42 lands on MARKS y 1.44).
  const shoulderLocalY = conf.shoulderR.y - (0.92 + 0.1);
  const rightArm = makeArm({
    shoulder: { x: conf.shoulderR.x, y: shoulderLocalY, z: conf.shoulderR.z },
    mats,
    pose: POSE.brushArm,
    brush: true,
  });
  const leftArm = makeArm({ shoulder: { x: conf.shoulderL.x, y: shoulderLocalY, z: conf.shoulderL.z }, mats, pose: POSE.paletteArm });
  chest.add(rightArm.pivot, leftArm.pivot);
  const armBase = {
    brush: rightArm.pivot.rotation.clone(),
    brushElbow: rightArm.elbow.rotation.x,
    palette: leftArm.pivot.rotation.clone(),
    paletteElbow: leftArm.elbow.rotation.x,
  };

  // palette in the left hand, tilted toward him
  // turned almost edge-on to the camera and kept matte: a flat disc facing the key light
// becomes a bright plate that detaches from the hand.
  const mats2 = mats;
  const palette = part(new THREE.CylinderGeometry(0.085, 0.082, 0.012, 24), mats2.palette, leftArm.hand, [0.008, -0.058, 0.02], [1.32, 0, 0.36], [1.18, 1, 1]);
  for (let i = 0; i < 5; i++) {
    const a = -0.85 + i * 0.46;
    part(blob(0.01, 0.35, 1), mats.dab, palette, [Math.cos(a) * 0.05, 0.007, Math.sin(a) * 0.038]);
  }

  /* easel — a studio A-frame, built to read in side profile ---------- */
  // Every member is authored in the easel's own frame, with z measured from the BOARD's
  // plane, so rotating the rig about Y spins the easel around the canvas and the anchor
  // the painter's brush aims at (MARKS.canvas) stays exactly where the camera was framed for.
  const EZ = conf.canvas.z;
  const easel = new THREE.Group();
  easel.position.set(0, 0, EZ);
  easel.rotation.y = POSE.easelTurn;
  props.add(easel);
  const E = conf.easel;
  const wood = mats.wood;
  const tilt = -conf.canvasTilt;
  const z = (v) => v - EZ; // authored world-z → easel-local-z
  const mastZ = (y) => E.mastFootZ + ((y - 0.02) / (E.mastTopY - 0.02)) * (E.mastTopZ - E.mastFootZ);
  strut([0, 0.02, z(E.mastFootZ)], [0, E.mastTopY, z(E.mastTopZ)], 0.019, 0.015, wood, easel);
  for (const side of [-1, 1])
    strut([side * E.legSplayX, 0, z(E.frontFootZ)], [side * E.legTopX, E.legTopY, z(mastZ(E.legTopY))], 0.022, 0.014, wood, easel);
  strut([0, 0, z(E.rearFootZ)], [0, E.rearJoinY, z(mastZ(E.rearJoinY)) + 0.02], 0.02, 0.015, wood, easel);
  part(blob(0.022, 1.3, 1), wood, easel, [0, E.mastTopY + 0.015, z(E.mastTopZ) - 0.004]); // turned knob
  part(new THREE.CylinderGeometry(0.019, 0.019, 0.026, 12), wood, easel, [0, E.mastTopY - 0.06, z(mastZ(E.mastTopY - 0.06)) - 0.01]);
  // ledge the board rests on, angled to match the lean, with its lip and two braces
  part(new THREE.BoxGeometry(E.trayW, 0.028, 0.09), wood, easel, [0, E.trayY, z(conf.canvas.z) - 0.035], [tilt, 0, 0]);
  part(new THREE.BoxGeometry(E.trayW, 0.048, 0.018), wood, easel, [0, E.trayY + 0.034, z(conf.canvas.z) - 0.082], [tilt, 0, 0]);
  for (const side of [-1, 1])
    strut([side * (E.trayW / 2 - 0.02), E.trayY - 0.03, z(conf.canvas.z) - 0.02], [side * (E.trayW / 2 - 0.02), E.trayY - 0.2, z(conf.canvas.z) + 0.05], 0.012, 0.012, wood, easel);

  const canvasPanel = new THREE.Group();
  canvasPanel.position.set(0, conf.canvas.y, 0);
  canvasPanel.rotation.x = conf.canvasTilt;
  easel.add(canvasPanel);
  const { w, h } = conf.canvasSize;
  part(new THREE.BoxGeometry(w, h, 0.03), wood, canvasPanel); // board with visible thickness
  // the PAINTED side faces the painter (-z): a plane's normal is +z, so it is flipped.
  // Getting this wrong makes the canvas face away from him and the shot loses the artwork.
  const face = part(new THREE.PlaneGeometry(w - 0.03, h - 0.03), mats.canvasFront, canvasPanel, [0, 0, -0.016], [0, Math.PI, 0]);
  face.castShadow = false;
  for (const side of [-1, 1])
    // clamps over the top corners on the painter's side: in silhouette these are what
    // separate "easel" from "card propped against a stick"
    part(new THREE.BoxGeometry(0.03, 0.048, 0.026), wood, canvasPanel, [side * (w / 2 - 0.028), h / 2 - 0.016, -0.021]);
  part(new THREE.BoxGeometry(w + 0.05, 0.024, 0.03), wood, canvasPanel, [0, -h / 2 - 0.012, -0.012]); // bottom batten

  const tinX = E.trayW / 2 - 0.06;
  const tin = part(new THREE.CylinderGeometry(0.036, 0.032, 0.08, 16), mats.tin, easel, [tinX, E.trayY + 0.055, z(conf.canvas.z) - 0.045], [0, 0, 0.05]);
  part(new THREE.CylinderGeometry(0.03, 0.03, 0.006, 16), mats.paint, easel, [tinX, E.trayY + 0.096, z(conf.canvas.z) - 0.045]);
  part(new THREE.CylinderGeometry(0.028, 0.026, 0.058, 14), mats.tin, easel, [-tinX, E.trayY + 0.045, z(conf.canvas.z) - 0.04], [0, 0, -0.06]);
  for (let i = 0; i < 3; i++)
    part(new THREE.CapsuleGeometry(0.008, 0.03, 3, 8), mats.tin, easel, [-0.06 + i * 0.05, E.trayY + 0.036, z(conf.canvas.z) - 0.072], [Math.PI / 2, 0, i * 0.5]);

  /* props -------------------------------------------------------------- */
  const stool = new THREE.Group();
  stool.position.set(0.66, 0, -0.46);
  props.add(stool);
  part(new THREE.BoxGeometry(0.34, 0.036, 0.3), wood, stool, [0, 0.5, 0]);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
    strut([sx * 0.13, 0.5, sz * 0.11], [sx * 0.17, 0.02, sz * 0.15], 0.017, 0.014, wood, stool);
  part(blob(0.12, 0.35, 1), mats.cloth, stool, [-0.06, 0.535, 0.03], [0.1, 0.4, 0], [1.3, 1, 1.1]); // rag over the seat
  // a couple of canvases leaning behind the stool — the tell of a working studio
  for (let i = 0; i < 2; i++)
    part(new THREE.BoxGeometry(0.46 - i * 0.1, 0.36 - i * 0.06, 0.02), wood, props, [0.95 + i * 0.03, 0.19 + i * 0.02, -0.86 - i * 0.05], [-0.2 + i * 0.05, -0.45 - i * 0.1, 0.06 * i]);
  const contactBlobs = [];
  for (const [r, at, o] of [
    [0.9, [0, 0.003, 0.04], 0.5],
    [0.66, [0, 0.003, conf.canvas.z], 0.36],
    [0.42, [0.66, 0.003, -0.46], 0.3],
    [0.4, [0.98, 0.003, -0.85], 0.24],
  ])
    contactBlobs.push(contactBlob(r, r * 0.72, at, o, props)); // may be null without a DOM; Scene 4 moves these with the collapsing floor

  /* ───────────────────────── animation ───────────────────────── */

  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  let lastStats = { strokeGate: 0, headYaw: 0, headPitch: 0, step: 0, notice: 0, reach: 0 };

  /**
   * @param {number} time seconds since load — idle motion is time-based, never scroll-based
   * @param {number} dt
   * @param {{appear:number,notice:number,reach:number}} [s3] Scene-3 progress (from scroll)
   * @param {THREE.Vector3} [starAt] where the star is, in world space (he aims at the object
   *        itself, so moving STAR.position in star.js moves his eyeline with it automatically)
   */
  function update(time, dt, s3 = null, starAt = null) {
    const notice = s3?.notice ?? 0;
    const reach = s3?.reach ?? 0;

    // ---- breath, sway, weight ----
    const breath = Math.sin(time * Math.PI * 2 * IDLE.breathHz);
    chest.position.y = chestBaseY + breath * 0.0038;
    chest.rotation.x = POSE.chest.x + breath * 0.007 - 0.035 * reach; // he leans in
    chest.rotation.z = POSE.chest.z + Math.sin(time * 0.9) * 0.006;
    hips.rotation.z = POSE.hips.z + Math.sin(time * Math.PI * 2 * IDLE.swayHz) * 0.008;
    head.rotation.x = headBase.x + Math.sin(time * 0.62) * 0.014;
    head.rotation.y = headBase.y + Math.sin(time * 0.41 + 1.1) * 0.03;

    // ---- painting: short strokes, then he stops to study the canvas ----
    const gate = 0.3 + 0.7 * Math.pow(Math.max(0, Math.sin(time * Math.PI * IDLE.strokeGate + 0.6)), 1.5);
    const paused = 1 - 0.92 * notice; // the star silences the brush; he never drops it
    const stroke = Math.sin(time * Math.PI * 2 * IDLE.strokeHz) * gate * paused;
    rightArm.pivot.rotation.x = armBase.brush.x + stroke * IDLE.strokeAmp;
    rightArm.pivot.rotation.y = armBase.brush.y + Math.sin(time * 1.02 + 0.4) * 0.11 * gate * paused;
    rightArm.elbow.rotation.x = armBase.brushElbow + stroke * 0.19;
    if (rightArm.tool) rightArm.tool.rotation.z = 0.1 + stroke * 0.22; // a little twist, not a flourish
    // at full reach the brush hand drifts up off the canvas and stays there — held, not lowered
    rightArm.pivot.rotation.x += 0.13 * reach;
    rightArm.pivot.rotation.z = armBase.brush.z - 0.1 * reach;
    rightArm.elbow.rotation.x += -0.22 * reach;
    leftArm.pivot.rotation.x = armBase.palette.x + Math.sin(time * 0.4) * 0.015 - 0.1 * reach; // palette held up, forgotten
    leftArm.elbow.rotation.x = armBase.paletteElbow - 0.16 * reach;

    // ---- the reaction, aimed at the star itself ----
    let yaw = 0;
    let pitch = 0;
    if (starAt && notice + reach > 0.001) {
      head.getWorldPosition(tmp);
      tmp2.copy(starAt).sub(tmp);
      const flat = Math.hypot(tmp2.x, tmp2.z) || 1e-4;
      yaw = Math.atan2(tmp2.x, tmp2.z) - group.rotation.y; // into the figure's frame
      pitch = Math.atan2(tmp2.y, flat);
      head.rotation.y += yaw * 0.6 * notice; // a glance, not a swivel
      head.rotation.x += -pitch * 0.85 * notice; // he looks up
      chest.rotation.y = POSE.chest.y + yaw * 0.2 * notice + 0.04 * reach;
      hips.rotation.y = POSE.hips.y + yaw * 0.1 * notice;
      head.rotation.z = headBase.z + yaw * 0.06 * notice; // tilts a touch as if unsure

      // ---- a half step toward it, with a foot that lifts and plants ----
      const step = SCENE3.step * reach;
      const dir = tmp2.setY(0).normalize();
      figure.position.set(dir.x * step, -0.004 * reach, dir.z * step);
      const lift = Math.sin(Math.PI * reach) * SCENE3.bob;
      legs.left.hip.rotation.x = POSE.freeLeg.hip - lift * 1.7;
      legs.left.knee.rotation.x = POSE.freeLeg.knee + lift * 2.4;
      figure.rotation.z = 0;
      chest.rotation.x -= lift * 0.5;
    } else {
      figure.position.set(0, 0, 0);
      legs.left.hip.rotation.x = POSE.freeLeg.hip;
      legs.left.knee.rotation.x = POSE.freeLeg.knee;
    }
    figure.rotation.y = 0; // the root owns the composition yaw; the figure only offsets

    lastStats = {
      strokeGate: Math.abs(stroke),
      headYaw: yaw,
      headPitch: pitch,
      step: SCENE3.step * reach,
      notice,
      reach,
    };
    return lastStats;
  }

  return {
    group,
    figure,
    props,
    update,
    stats: () => lastStats,
    parts: { hips, chest, head, skull: skullMesh, hair, beret, rightArm, leftArm, legs, easel, canvasPanel, face, stool, contactBlobs },
  };
}
