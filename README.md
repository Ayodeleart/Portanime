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

`?debug` on the URL draws the camera + lookAt trajectories in the scene and prints
`t / azimuth / distance / fov / scrollY`, the Scene-3 beats
(`star`, `notice`, `reach`, `step`, `stroke`) and the Scene-4 fall line
(`p`, rendered `camY`, drop depth, rift `open`, `flare`, `split`). `window.__hero` exposes
`{ state, rig, camera, scene, PATH, MARKS, STAR, SCENE3, FALL, heroSplit, star, artist, fall, measureScene3, tween, ScrollTrigger }`.

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
| `src/style.css` | fullscreen canvas, 100vh pinned `#hero`, `--hero-scroll` length |

Four ideas carry the whole feel:

1. **Scroll never touches the camera.** ScrollTrigger scrubs a proxy
   (`gsap.to(state, { t: 1, scrub: 1.15 })`) and the render loop *damps toward it*
   (`1 - exp(-λ·dt)`), so reversals ease instead of stuttering, at any frame rate.
2. **The move is two splines, not one.** `cameraCurve` orbits (azimuth 5° → 93°) while its
   radius grows 0.85 m → 3.55 m; `targetCurve` slides the aim from just past his shoulder to
   between artist and canvas. The orbit never passes in front of him, so the face is never
   readable: Scene 1 is a back-of-head close-up, Scene 2 a profile.
3. **Scene 4 borrows the rest of the same `t` through a split.** The pin now scrolls
   `--hero-scroll + --fall-scroll` px with *one* ScrollTrigger. Scenes 1–3 read
   `min(t / split, 1)` (so their original pixels are their original frames) and Scene 4 owns
   the remainder as `p = (t − split) / (1 − split)`, applied as a post-pass after the rig,
   star and artist have written their frames — at `p = 0` it writes nothing at all.
4. **Scene 3 borrows the tail of the same `t`.** The camera spline, the pin length and the
   scrub are untouched; the star's arrival, the notice and the reach are `smoothstep` windows
   over the last 45 % of the move, and the figure is a pure function of them. That is why
   scrolling up is exact rather than "close enough": there is no separate animation state to
   reverse, and no second timeline to keep in sync.

### Scene 3 beats (fraction of the pinned scroll, `t`)

| window | what happens |
| --- | --- |
| `0 → 0.55` | nothing new — the close-up and the orbit are exactly as before |
| `appear 0.55 → 0.74` | the star fades in and slides a short distance into place, `near` nothing in frame yet |
| `notice 0.68 → 0.88` | brush strokes gate to a stop, head/chest/pelvis turn toward the light, canvas light dims slightly |
| `reach 0.80 → 1.00` | he leans, takes a 0.115 m step toward it, lifts the free foot, the brush hand drifts up off the canvas |

All three finish at `t = 1`, i.e. the camera settles into the side profile at the moment he
notices — one move, one beat.

### Scene 4 beats (local `p` = the scroll past the split)

| window | what happens |
| --- | --- |
| `split ≈ 0.6071` | ownership flips: Scenes 1–3 latch at their end state; `p` takes over |
| `catch 0 → 0.11` | last small step + torso lean, the brush arm rises toward the star |
| `flare 0.015 → 0.32` | the star swells once, softly (sin envelope — a light, not an explosion), then fades with distance as he falls away from it |
| `collapse 0.055 → 0.15` | the floor wrenches open to a 5.9 m rift, hinged halves sinking ≈8.4 m; the easel and the contact shadows ride the centre down |
| `fall 0.075 → 1` | the camera lurches (≈44 % of its drop by p 0.21) then accelerates to y ≈ −16.9 m; FOV 37° → 45.5°; a brief shake/roll only around the drop; he falls *deeper* than the camera and drifts up in frame |
| `void …` | fog → black, studio lights → 18 %, −45 % exposure, black veil shell closes: the placeholder deep dark |

## Tuning

- **Framing / curve** → `CAMERA_KEYS`, `TARGET_KEYS`, `FOV_KEYS` in `camera-path.js`.
  Keys are `{ t, azimuth, distance, height }`, `t` being the share of the scroll that key owns.
  `PATH.mode: 'arc'` switches to `curve.getPointAt(t)` (constant world speed); the default
  `'keyframe'` gives each key equal scroll so the close-up lingers. `npm run check` asserts
  these keys verbatim — if you change them on purpose, change them there too.
- **Scroll length / speed** → `--hero-scroll` (3400px, 2100px on small screens) and
  `--fall-scroll` (2200px, 1500px) in `style.css`. `main.js` reads both, derives `split`, so
  each budget is edited in exactly one place. `CONFIG.scrub` and `PATH.damping` add inertia
  on top — the fall damps with the same λ, so reversals stay symmetrical.
- **Star position / colour / intensity** → `STAR` in `src/star.js`. `position` is floor-space
  world coords; `size` is the crystal (the halo and flare scale off it via `haloScale`,
  `flareScale`, `flareOpacity`); `core` / `glow` / `light.color` set the palette; `light`
  carries `intensity`, `distance`, `decay`; `pulseHz` / `flicker` the breathing; `arriveFrom`
  the offset it slides in from; `spin`, `motes` the shimmer. **Its position was solved against
  the end frame** — it has to sit inside the camera's frustum *and* within ~17° of where he is
  looking; move it and re-run `npm run check`.
- **How the fall plays** → `FALL` and `FALL_POSE` in `src/scene4.js`: beat windows are
  `[start, end]` ranges of p; `FALL.shape` + `camera.drop` shape the plunge (lurch share vs
  acceleration), `ground.*` the rift width/sink/hinge, `void_.*` the darkness (fog/lights/
  exposure/veil), `artist.*` how much deeper he falls, and `FALL_POSE.catchArm`/`.body` the
  catch and fall pose. `npm run check` asserts the split math, the 5.9 m rift, `y ≈ −16.9`,
  the dormant-at-p=0 property and byte-exact reversal — if you retune on purpose, update it
  there too. `node tools/.fall-probe.mjs` prints the whole curve table for tuning.
- **When he notices** → `SCENE3` in `src/scene3.js`: the three `[start, end]` windows, plus
  `step` (how far he moves), `lean` and `bob`. Ranges are in `t`, not pixels, so they survive
  any `--hero-scroll`.
- **How he reacts** → inside `Artist.update(time, dt, s3, starAt)` in `src/artist.js`: the
  weights that split the turn across head (0.6), chest (0.2) and hips (0.1), the look-up
  amount, `paused = 1 - 0.92 * notice` (how still the brush goes) and `0.13 * reach` (how far
  the brush hand lifts). His aim is *derived* from the star's actual position, so moving the
  star moves the reaction with it.
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
