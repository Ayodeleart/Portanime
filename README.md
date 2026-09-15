# Scroll-driven cinematic hero — Scenes 1, 2, 3 & 4

One pinned section, one scroll, one camera move: an **extreme close-up on the back of a
painter's head** → **orbiting and pulling out to a side-profile two-shot at his easel** →
late in that same move **a small light appears beyond the canvas**, he stops painting, turns
toward it and shifts a half step closer — and as he reaches, **the ground breaks open and he
falls** into a black placeholder void. Scroll up and all of it unwinds, frame-for-frame.

The fall is in (Scene 4). The code-tunnel abyss and the project sections are still out of scope, on
purpose — Scene 4’s bottom is a deliberately deep black placeholder built for the future void.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run check      # headless framing + timing assertions (no browser needed)
npm run build      # → ./dist
```

`?debug` on the URL draws the camera + lookAt trajectories, prints the same readout lines
(`t / rendered t / scroll px`, the Scene-3 beats, the Scene-4 fall line) **and** reticles
the beat in-scene: a magenta ring on the star (from the first frame of its fade-in), a cyan
ring on the brush hand, a green one on the brush tip. If the star's glow ever reads as
"invisible", the ring shows whether it is off-frame or merely dim — it is depth-test-free,
so it can never be occluded away. With `?debug` absent no marker object is even created.
`window.__hero` exposes
`{ state, rig, camera, scene, PATH, MARKS, STAR, SCENE3, FALL, storyMap, heroSplit, star, artist, fall, measureScene3, tween, ScrollTrigger }`.

## How it works

| file | role |
| --- | --- |
| `src/main.js` | renderer, lights, sky, the GSAP ScrollTrigger pin over hero+fall budgets + `state.t`, render loop |
| `src/camera-path.js` | the move: camera spline, lookAt spline, lens (FOV) keys, roll, damping |
| `src/artist.js` | the figure, the easel, studio props, idle + reaction animation |
| `src/loft.js` | geometry helpers: loft through elliptical rings, limbs from joint pivots |
| `src/star.js` | Scene 3's light: crystal core, nucleus, halo, flare, point light, dust |
| `src/scene3.js` | Scene 3's *timing map* — when the star, the notice and the reach happen |
| `src/scene4.js` | Scene 4 (the fall): split math, the two-floor slab, flare/fade, the camera plunge, the void — every value a pure function of local `p` |
| `src/style.css` | fullscreen canvas, 100vh pinned `#hero`, the three scroll budgets (`--reveal-scroll`, `--story-scroll`, `--fall-scroll`) |

Four ideas carry the whole feel:

1. **Scroll never touches the camera.** ScrollTrigger scrubs a proxy
   (`gsap.to(state, { t: 1, scrub: 1.15 })`) and the render loop *damps toward it*
   (`1 - exp(-λ·dt)`), so reversals ease instead of stuttering, at any frame rate.
2. **The move is two splines, not one.** `cameraCurve` orbits (azimuth 5° → 93°) while its
   radius grows 0.85 m → 3.55 m; `targetCurve` slides the aim from just past his shoulder to
   between artist and canvas. The orbit never passes in front of him, so the face is never
   readable: Scene 1 is a back-of-head close-up, Scene 2 a profile.
3. **The pin is one scroll split into three named budgets.** `--reveal-scroll` (2108px)
   runs Scenes 1–2, `--story-scroll` (2400px) runs Scene 3's beat, `--fall-scroll` (2200px)
   runs Scene 4 — still *one* ScrollTrigger, one pin, one `t`. `buildScrollMap()` in
   `scene4.js` turns the pin into the two inputs: `heroT` (Scenes 1–3) and `p` (Scene 4).
   Below 2108px the map has exactly the OLD 1/3400 px slope — every pre-Scene-3 frame keeps
   the pixels it always had (`npm run check` asserts that to 1e-12) — and Scene 4's
   post-pass still writes nothing at all until `p > 0`.
4. **Scene 3 owns its beat outright.** Its `smoothstep` windows run over the story budget
   (`heroT` 0.62 → 1), which the map stretches to 2400px of scroll — the star can *sit*
   visibly for ~1300px before he turns, and the reach reads on a phone instead of living in
   the last 15 % of the pin. The camera spline is untouched; the figure is a pure function of
   `t`. That is why scrolling up is exact rather than "close enough": there is no separate
   animation state to reverse, and no second timeline to keep in sync.

### Scene 3 beats (`heroT` = the map's Scenes-1–3 input; px are desktop on the 6708px pin)

| window | heroT | px | what happens |
| --- | --- | --- | --- |
| reveal | `0 → 0.62` | 0 → 2108 | nothing new — Scenes 1–2, *pixel-identical to before* |
| appear | `0.62 → 0.82` | 2108 → 3371 | the star fades in over the board's corner and **sits there** — fully lit for ~1100 px of scroll before anything else asks for attention |
| notice | `0.72 → 0.92` | 2740 → 4000 | strokes stop; head + torso turn ~40° onto the light, chin up; canvas light dims slightly |
| reach | `0.84 → 1.00` | 3498 → 4508 | a clear 0.21 m step, a forward lean, the brush arm lifts off the canvas toward it |

On phones (4500px pin): reveal 0→1300, appear 1300→2420, notice 1573→2680, reach 2711→3000.
At story end the figure holds its max-reach pose — the camera is the same settled side
profile as always; Scene 3 is the same move, just given the scroll time it needs.

### Scene 4 beats (local `p` over the 2200px fall budget — desktop px 4508 → 6708)

| window | px (≈) | what happens |
| --- | --- | --- |
| `p = 0` | 4508 | ownership flips: Scenes 1–3 latch at their end state; the layer writes nothing until here |
| `catch 0 → 0.09` | 4508 → 4706 | the catch pose commits by `p = 0.03` (4574px): the brush TIP closes to ~8 cm from the star — solved, not waved at (`FALL_POSE.catchArm`) |
| `flare 0.03 → 0.095` | 4574 → 4717 | the star swells once, softly (sin envelope — a light, not an explosion): the visible CAUSE of what follows |
| `collapse 0.07 → 0.17` | 4662 → 4882 | the floor wrenches open to a 5.9 m rift, hinged halves sinking ≈8.4 m; the easel and the contact shadows ride the centre down |
| `fall 0.10 → 1` | 4728 → 6708 | the camera lurches (≈44 % of its drop by p 0.24) then accelerates to y ≈ −16.9 m; FOV 37° → 45.5°; shake/roll only around the drop; he falls *deeper* than the camera and drifts up in frame |
| `star fade 0.095 → 0.42` | 4717 → 5432 | the light dims with distance while still in frame, then is gone behind the dive |
| `void …` | — | fog → black, studio lights → 18 %, −45 % exposure, black veil shell closes: the placeholder deep dark |

The windows are front-loaded on purpose: the dive carries the star out of frame within a
few hundred pixels, so the flare and the loss of the light play *while it is still
visible* — that is the beat the fall answers.

## Tuning

- **Framing / curve** → `CAMERA_KEYS`, `TARGET_KEYS`, `FOV_KEYS` in `camera-path.js`.
  Keys are `{ t, azimuth, distance, height }`, `t` being the share of the scroll that key owns.
  `PATH.mode: 'arc'` switches to `curve.getPointAt(t)` (constant world speed); the default
  `'keyframe'` gives each key equal scroll so the close-up lingers. `npm run check` asserts
  these keys verbatim — if you change them on purpose, change them there too.
- **Scroll length / speed** → `--reveal-scroll` (2108px, 1300px small screens),
  `--story-scroll` (2400px, 1700px) and `--fall-scroll` (2200px, 1500px) in `style.css`.
  `main.js` reads all three and `buildScrollMap` composes them, so each budget is edited in
  exactly one place. `--reveal-scroll` = `0.62 × the old 3400px hero budget` — keep that
  ratio or Scenes 1–2's pixels move (check-shot asserts it). `CONFIG.scrub` and `PATH.damping` add inertia
  on top — the fall damps with the same λ, so reversals stay symmetrical.
- **Star position / colour / intensity** → `STAR` in `src/star.js`. `position` is floor-space
  world coords; `size` is the crystal (the halo and flare scale off it via `haloScale`,
  `flareScale`, `flareOpacity`); `core` / `glow` / `light.color` set the palette; `light`
  carries `intensity`, `distance`, `decay`; `pulseHz` / `flicker` the breathing; `arriveFrom`
  the offset it slides in from; `spin`, `motes` the shimmer. **Its position is solved against
  the end frame at BOTH aspects.** The portrait constraint is the binding one: the end camera
  is a pure profile 3.55 m off the +X axis and a 390-wide phone sees only ±8.8° around that
  axis, so a star out past z ≈ 1.2 falls off the right edge — which is exactly why the old
  anchor was "invisible" on phones. The star therefore hovers *over* the board's far corner
  (~1 m ahead of his face): in frame at both aspects through the whole beat, clear of the
  head/board silhouettes, deeper than the canvas plane, and a step away from the catch.
  `npm run check` asserts all of it. Move it and re-run check, re-run
  `node tools/.fall-probe.mjs --solve` to re-bake `catchArm`, and `node
  tools/.visual-proof.mjs` for the software pixel proofs.
- **How the fall plays** → `FALL` and `FALL_POSE` in `src/scene4.js`: beat windows are
  `[start, end]` ranges of p; `FALL.shape` + `camera.drop` shape the plunge (lurch share vs
  acceleration), `ground.*` the rift width/sink/hinge, `void_.*` the darkness (fog/lights/
  exposure/veil), `artist.*` how much deeper he falls, and `FALL_POSE.catchArm`/`.body` the
  catch and fall pose (`catchArm` is not hand-tuned: `node tools/.fall-probe.mjs --solve`
  hill-climbs it against the live rig until the brush tip meets the star, then re-bakes the
  constants). `npm run check` asserts the scroll map — including the px-identical promise for
  Scenes 1–2 and the phone-viewport framing — the 5.9 m rift, `y ≈ −16.9`, the
  dormant-at-p=0 property and byte-exact reversal; retune on purpose and update it there too.
  `node tools/.fall-probe.mjs` prints the whole curve table for tuning, and
  `node tools/.visual-proof.mjs` raster-composites the beat headlessly (star/head/hand/tip
  px metrics + PNGs in ./.proof) — no browser needed.
- **When he notices** → `SCENE3` in `src/scene3.js`: the three `[start, end]` windows, plus
  `step` (0.21 m), `lean` (0.09 rad) and `bob`. Ranges are in `t`, not pixels, so they
  survive any budget — what gives the beat its air is the story budget on top. The windows
  are pinned in check-shot as the approved beat-fix baseline; retune on purpose, update there.
- **How he reacts** → inside `Artist.update(time, dt, s3, starAt)` in `src/artist.js`: the
  weights that split the turn across head (0.8), chest (0.3) and hips (0.12) — tuned so the
  ~35° lateral anchor lands as a ~40° compound turn that survives a phone screen — the
  look-up amount, `paused = 1 - 0.99 * notice` (how still the brush goes) and the
  `+0.34 / −0.24 / −0.55` catch-lift on the brush arm. His aim is *derived* from the star's
  actual position, so moving the star moves the reaction with it.
- **Stance, idle, easel proportions** → `POSE` (yaw, contrapposto, shoulder/arm angles),
  `IDLE` (breath / sway / stroke rates and amplitudes, `strokeGate`) and `MARKS.easel`
  (leg splay, mast run, ledge height, top clamp positions) at the top of `src/artist.js`.
  The easel's *orientation* is `POSE.easelTurn` (0.5 rad): it is turned about the board's own
  centre so it reads in the side-profile end frame instead of becoming a black slat — that
  pivot keeps `MARKS.canvas`, the anchor the brush aims at, exactly where the camera frames it.
- **Lights** → in `main.js`: `key` 1.5 at frame-left, the double rim (`rim` 2.9 from behind
  right, `rim2` 1.35 from behind left) that draws the edge of the silhouette, and
  `canvasGlow` on the board. The figure's materials are all `MeshStandardMaterial` with
  roughness ≥ 0.7 and near-black colours on purpose — at this exposure anything shinier
  loses the silhouette.
- **Swap in a real figure later** → keep `MARKS` (head / shoulders / canvas / easel anchors)
  and return the same `{ group, update(time, dt, s3, starAt), parts, stats() }` from
  `createArtist()`. The camera frames those anchors and `update()` reads the star through
  `starAt`, so a GLTF only has to occupy the same volume and expose a hand node.

## Cost / budget

No downloads: no external model, texture, video or font. Artist + easel + props are
**5 638 triangles across 88 meshes**, all lofted primitives, plus three procedural 128 px
canvas textures generated at boot. Scene 4 adds ~0.7 k tris — the floor as two flush
half-discs (same tessellation as the old single disc), 12 instanced debris chips, the veil
shell — and one 150-point dust cloud; the fall costs one more damped scalar, no timelines. Shadows are one 1024² map from the key light; the floor
does *not* receive it (props are grounded by soft radial blobs), which is what keeps the
close-up from showing shadow acne under the nose.

## Optional visual smoke test

`node tools/preview-shots.mjs` drives the real page in headless Chromium (WebGL via
SwiftShader), scrolls the pin through 11 stops (Scenes 1–3, the reach-end handover, the
collapse, the lurch, the deep fall, the void, and back) and writes a frame per stop to
`.shots/`, then:

```bash
magick montage .shots/*.png -tile 4x3 -geometry 378x212+4+4 .shots/contact.png
```

Needs `npx playwright install chromium`. Not part of the app.
