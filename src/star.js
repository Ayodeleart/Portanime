/**
 * star.js — Scene 3's object: an unexplained light source, not a UI element.
 *
 * It is a small irregular crystal (a jittered icosahedron with flat facets) with a bright
 * additive nucleus in front of it, one warm halo, one short flare, a faint cold scatter and
 * a few motes of dust adrift around it. No sprite sheet, no texture download, no cross/star icon —
 * the "glow" is a light in the room: it falls off onto the canvas, the easel and his face.
 *
 * >>> TUNE THE STAR HERE: position / colour / intensity / pulse, all in STAR. <<<
 */

import * as THREE from 'three';

export const STAR = {
  /**
   * Solved against the *existing* end frame: at t=1 the camera sits at (-3.55, 1.42, 0.19)
   * looking at (0, 1.12, 0.44), and this point lands at ndc ≈ (0.58, 0.48) — upper right,
   * clear of his head (-0.24, 0.42) and of the canvas (0.24, 0.05) — while being only 17°
   * off his facing axis, so "he looks up and it is simply there" reads without him turning far.
   */
  position: new THREE.Vector3(0.55, 1.74, 2.15),
  size: 0.046, // the shard, not the halo: bigger and it reads as a held gem instead of a light // radius of the crystal — keep it small; scale implies distance
  core: 0xfff4e2, // pale gold-white
  glow: 0xffd7a0,
  light: { color: 0xffe0b2, intensity: 6, distance: 6.5, decay: 2 },
  pulseHz: 0.23, // one breath every ~4.3 s
  flicker: 0.055, // ±5.5% shimmer on top of the pulse
  haloScale: 8.5, // tight, warm falloff — a wide cold halo reads as a UI glow / game pickup
  flareScale: 15,
  flareOpacity: 0.13,
  coreEmissive: 0.3, // keep it under the clip point: facets you can *see* read as an object,
  // a clipped white disc reads as a smudge (or a UI badge). The nucleus sprite is the light.
  arriveFrom: new THREE.Vector3(0, -0.26, 0.5), // it drifts up/out of the dark into place
  spin: 0.045, // rad/s
  motes: 26,
};

const hasDom = typeof document !== 'undefined';

/** one soft radial texture, reused for every glow layer at different scales */
function makeGlowTexture(size = 128, hardness = 0.22) {
  if (!hasDom) return null;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const h = size / 2;
  const g = ctx.createRadialGradient(h, h, 0, h, h, h);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(hardness, 'rgba(255,246,228,0.65)');
  g.addColorStop(0.5, 'rgba(255,214,150,0.18)');
  g.addColorStop(1, 'rgba(255,200,140,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** deterministic jitter so the crystal is irregular but identical every reload */
function seeded(n) {
  let s = n;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296 - 0.5) * 2;
}

export function createStar(conf = STAR) {
  const group = new THREE.Group();
  group.position.copy(conf.position);
  const map = makeGlowTexture();

  /* the crystal ---------------------------------------------------- */
  const geo = new THREE.IcosahedronGeometry(conf.size, 1);
  const rnd = seeded(7);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = 1 + rnd() * 0.34; // push every vertex in/out → an irregular shard, not a gem-cut
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.88, p.getZ(i) * k * 1.08);
  }
  geo.computeVertexNormals();
  const core = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      color: 0x2a2318, // deliberately dark: light comes *from* it, it is not a white disc
      emissive: conf.core,
      emissiveIntensity: conf.coreEmissive,
      roughness: 0.28,
      metalness: 0.12,
      flatShading: true, // facets catch the glow unevenly — that is what sells "object"
    })
  );
  group.add(core);
  // the light itself: one tight additive nucleus in front of the shard, so what you read is
  // a point of origin with a dark solid object behind it, not a glowing ball
  const nucleus = new THREE.Sprite(
    new THREE.SpriteMaterial({ map, color: 0xfff4e0, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 })
  );
  nucleus.scale.setScalar(conf.size * 2.6);
  nucleus.renderOrder = 2;
  group.add(nucleus);

  /* the light it throws -------------------------------------------- */
  const light = new THREE.PointLight(conf.light.color, 0, conf.light.distance, conf.light.decay);
  group.add(light);

  /* glow layers (cheap stand-in for bloom; see the note in main.js) -- */
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({ map, color: conf.glow, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 })
  );
  halo.scale.setScalar(conf.size * conf.haloScale);
  const flare = new THREE.Sprite(
    new THREE.SpriteMaterial({ map, color: conf.core, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 })
  );
  flare.scale.set(conf.size * conf.flareScale, conf.size * 2.6, 1); // one short soft streak, not a cross
  // One faint cold scatter only — wide and blue was the "collectible" tell.
  const scatter = new THREE.Sprite(
    new THREE.SpriteMaterial({ map, color: 0x9ab4d8, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 })
  );
  scatter.scale.setScalar(conf.size * 20);
  group.add(scatter, halo, flare);

  /* dust in the light ------------------------------------------------ */
  const motes = new THREE.Group();
  const mg = new THREE.BufferGeometry();
  const mp = new Float32Array(conf.motes * 3);
  const r2 = seeded(21);
  for (let i = 0; i < conf.motes; i++) {
    const a = r2() * Math.PI * 2;
    const b = r2() * 0.9;
    const rad = 0.16 + Math.abs(r2()) * 0.34;
    mp.set([Math.cos(a) * rad, Math.sin(b) * rad * 0.7, Math.sin(a) * rad], i * 3);
  }
  mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
  motes.add(
    new THREE.Points(
      mg,
      new THREE.PointsMaterial({
        map,
        color: 0xffe8c4,
        size: 0.018,
        sizeAttenuation: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0,
      })
    )
  );
  group.add(motes);

  group.visible = false;

  return {
    group,
    core,
    light,
    anchor: conf.position.clone(),
    /**
     * @param {{appear:number, notice:number, reach:number}} s3 Scene-3 progress, 0→1
     * @param {number} time seconds since load (shimmer only — never scroll state)
     */
    update(s3, time) {
      const a = s3?.appear ?? 0;
      group.visible = a > 1e-3;
      if (!group.visible) return;
      const e = 1 - Math.pow(1 - a, 2.2); // ease-out: it settles in, it never pops
      const breath = 1 + Math.sin(time * Math.PI * 2 * conf.pulseHz) * 0.05 + Math.sin(time * 7.3 + 1.2) * conf.flicker * 0.5 + Math.sin(time * 13.7) * conf.flicker * 0.3;

      group.position.copy(conf.position).addScaledVector(conf.arriveFrom, 1 - e);
      core.scale.setScalar(0.4 + 0.6 * e * breath);
      core.rotation.y = time * conf.spin;
      core.rotation.x = Math.sin(time * 0.21) * 0.18;
      core.material.emissiveIntensity = conf.coreEmissive * breath * (0.8 + 0.2 * e);
      nucleus.scale.setScalar(conf.size * (2.3 + 0.5 * breath));
      nucleus.material.opacity = 0.85 * e;
      halo.material.opacity = 0.5 * e;
      flare.material.opacity = conf.flareOpacity * e;
      scatter.material.opacity = 0.1 * e;
      halo.scale.setScalar(conf.size * conf.haloScale * (0.92 + 0.08 * breath));
      flare.scale.set(conf.size * conf.flareScale * (0.9 + 0.1 * breath), conf.size * 2.6, 1);
      light.intensity = conf.light.intensity * e * breath * (1 + 0.16 * (s3.notice ?? 0));
      motes.rotation.y = time * 0.06;
      motes.children[0].material.opacity = 0.3 * e;
    },
  };
}
