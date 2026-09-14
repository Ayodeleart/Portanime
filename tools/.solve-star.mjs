import * as THREE from 'three';
import { createCameraRig } from '../src/camera-path.js';
const cam = new THREE.PerspectiveCamera(30, 1600/900, 0.03, 60);
const rig = createCameraRig(cam);
const settle = (t) => { for (let i=0;i<500;i++){ rig.update(t,1/60); if (Math.abs(rig.t-t)<1e-5) break; } cam.updateMatrixWorld(true); };
const worldFromNdc = (nx, ny, dist) => {
  // point on the view ray that lands at ndc (nx,ny), `dist` metres from the camera
  const p = new THREE.Vector3(nx, ny, 0.5).unproject(cam);
  const dir = p.sub(cam.position).normalize();
  return cam.position.clone().addScaledVector(dir, dist);
};
const ndcOf = (v) => { const p = v.clone().project(cam); return `${p.x.toFixed(2)}, ${p.y.toFixed(2)}`; };
const HEAD = new THREE.Vector3(0, 1.62, -0.06), CANVAS = new THREE.Vector3(0, 1.17, 0.95);
for (const t of [0.75, 1]) {
  settle(t);
  console.log(`\n== t=${t}  cam ${cam.position.toArray().map(n=>n.toFixed(2))} fov ${cam.fov.toFixed(1)}`);
  for (const [nx, ny, d] of [[0.42,0.34,4.2],[0.5,0.42,5.0],[0.36,0.30,5.6],[0.62,0.5,4.6],[0.45,0.4,6.2]]) {
    const w = worldFromNdc(nx, ny, d);
    const gaze = w.clone().sub(HEAD).setY(0).normalize();
    const angFromFacing = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(gaze.z,-1,1)));
    console.log(`  ndc(${nx},${ny}) d=${d}m -> world [${w.toArray().map(n=>n.toFixed(2))}]  |dist to head ${w.distanceTo(HEAD).toFixed(2)} to canvas ${w.distanceTo(CANVAS).toFixed(2)}  ${angFromFacing.toFixed(0)}° off his facing`);
  }
}
settle(1);
console.log('\nreference ndc at t=1 — head', ndcOf(HEAD), 'canvas', ndcOf(CANVAS), 'easelfoot', ndcOf(new THREE.Vector3(0,0.05,0.9)));
