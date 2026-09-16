/**
 * scene3.js — Scene 3's *timing*, and nothing else.
 *
 * The camera spline and the pin's reveal stay exactly as they were. Scene 3 is
 * driven off the same 0→1 progress the camera already uses — but since the
 * Scene-4 recovery the beat owns its OWN scroll budget (--story-scroll), so the
 * windows below are measured against a timeline that stretches the tail of the
 * move: the side view settles, the star is allowed to SIT there visibly, then he
 * notices, then he commits — before anything falls.
 *
 *   t 0.62 → 0.82   the star arrives (fade + a slow slide into place) — after the
 *                          composition has settled, and it lingers ~20 % of the beat
 *                          before anything else asks for attention
 *   t 0.72 → 0.92   the brush audibly stops; head + chest + pelvis turn toward it
 *   t 0.84 → 1.00   he leans, takes a clear step, and reaches
 *
 * Because every value is a pure function of `t`, scrolling up unwinds the whole
 * sequence frame-for-frame with no extra state.
 */

export const SCENE3 = {
  /** [start, end] of each beat, in hero-scroll progress. Move them apart for more air. */
  appear: [0.62, 0.82],
  notice: [0.72, 0.92],
  reach: [0.84, 1.0],
  /** how far he commits: metres of step, radians of lean at full `reach` */
  step: 0.21,
  lean: 0.09,
  bob: 0.03, // how much the free foot lifts mid-step
};

export const smoothstep = (x, a, b) => {
  const u = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return u * u * (3 - 2 * u);
};

/** Per-frame read of Scene 3. `t` is the *rendered* camera progress, so the reaction and
 *  the shot can never disagree about where the scroll is. */
export function measureScene3(t) {
  const appear = smoothstep(t, ...SCENE3.appear);
  return {
    t,
    appear,
    notice: smoothstep(t, ...SCENE3.notice),
    reach: smoothstep(t, ...SCENE3.reach),
    present: appear > 1e-3,
  };
}
