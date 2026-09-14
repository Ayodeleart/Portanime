/**
 * loft.js — one tiny procedural tool instead of a pile of capsules.
 *
 * Capsules read as balloons; a human reads through *cross-sections*. This lofts a
 * smooth closed (or open) volume through a stack of elliptical sections, which is how
 * you get a ribcage that narrows into a waist, a jaw that tapers under a skull, and a
 * forearm that becomes a wrist — for a couple hundred triangles, no downloads.
 *
 * sections, ordered by increasing y: { y, rx, rz, cx, cz, s }
 *   rx / rz  half-widths of the ellipse (x = side to side, z = front to back)
 *   cx / cz  centre offset — the lever for asymmetry (a brow that overhangs, a gut)
 *   s        uniform pinch of the ring (used to close off a limb at a joint)
 *
 * `arc: [a0, a1]` sweeps only part of the circle — that is how the painter's apron
 * covers front and sides but leaves the back of the legs readable.
 */

import * as THREE from 'three';

const TAU = Math.PI * 2;

export function loftGeometry(sections, opts = {}) {
  const { radial = 24, arc = null, caps = true } = opts;
  const open = Array.isArray(arc);
  const [a0, a1] = open ? arc : [0, TAU];
  const steps = open ? radial + 1 : radial;

  const rings = sections.map((sec) => {
    const { y = 0, rx = 0.1, rz = 0.1, cx = 0, cz = 0, s = 1 } = sec;
    const ring = [];
    for (let j = 0; j < steps; j++) {
      const a = a0 + ((a1 - a0) * j) / (steps - (open ? 1 : 0));
      ring.push(new THREE.Vector3(cx + Math.cos(a) * rx * s, y, cz + Math.sin(a) * rz * s));
    }
    return { y, cx, cz, pts: ring };
  });

  const pos = [];
  const idx = [];
  rings.forEach((r) => r.pts.forEach((p) => pos.push(p.x, p.y, p.z)));

  // Winding is derived from the data, never assumed: flip every triangle if the first
  // one faces inward, so the silhouette is always lit from the outside.
  const a = rings[0].pts[0];
  const b = rings[0].pts[1];
  const c = rings[1].pts[0];
  const normal = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(b, a), new THREE.Vector3().subVectors(c, a));
  const outward = new THREE.Vector3().subVectors(a, new THREE.Vector3(rings[0].cx, rings[0].y, rings[0].cz));
  const flip = normal.dot(outward) < 0;

  const vert = (i, j) => i * steps + (open ? j : ((j % steps) + steps) % steps);
  const span = open ? steps - 1 : steps;
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < span; j++) {
      const p0 = vert(i, j);
      const p1 = vert(i, j + 1);
      const p2 = vert(i + 1, j + 1);
      const p3 = vert(i + 1, j);
      if (flip) idx.push(p0, p2, p1, p0, p3, p2);
      else idx.push(p0, p1, p2, p0, p2, p3);
    }
  }

  if (caps && !open) {
    for (const [ringIndex, capAtTop] of [[0, false], [rings.length - 1, true]]) {
      const ring = rings[ringIndex];
      const apex = pos.length / 3;
      pos.push(ring.cx, ring.y, ring.cz);
      const base = ringIndex * steps;
      for (let j = 0; j < steps; j++) {
        const v0 = base + j;
        const v1 = base + ((j + 1) % steps);
        if (capAtTop !== flip) idx.push(apex, v0, v1);
        else idx.push(apex, v1, v0);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.userData.tris = idx.length / 3;
  return geo;
}

/**
 * A limb: rings along -Y from the joint at the origin, so it drops straight into a
 * shoulder / elbow / hip group and can be posed by rotating that group alone.
 */
export function limbGeometry({ length, r0, r1, r2 = null, bulge = 0, radial = 16 }) {
  const sections = [
    { y: 0, rx: r0, rz: r0 * 0.94 },
    { y: -length * (r2 === null ? 0.45 : 0.34), rx: r0 - (r0 - r1) * 0.45, rz: (r0 - (r0 - r1) * 0.45) * 0.94 - bulge * 0.3 },
  ];
  if (r2 !== null) {
    sections.push({ y: -length * 0.7, rx: r1 + bulge, rz: (r1 + bulge) * 0.92 }); // muscle belly
    sections.push({ y: -length * 0.93, rx: r2, rz: r2 * 0.95 });
  }
  sections.push({ y: -length, rx: r2 ?? r1, rz: (r2 ?? r1) * 0.96, s: 0.86 });
  return loftGeometry(sections, { radial, caps: true });
}

/** A soft round blob (elbows, knees, knuckles, a bun of hair) — cheaper than it sounds. */
export function blob(r = 0.05, squash = 1, detail = 1) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  g.scale(1, squash, 0.92);
  return g;
}
