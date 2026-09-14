/**
 * scene3.js — Scene 3's *timing*, and nothing else.
 *
 * The camera spline, the pin and the scroll length stay exactly as they were. Scene 3 is
 * driven off the same 0→1 progress the camera already uses, in the last third of the move:
 *
 *   t 0.55 → 0.74   the star arrives (fade + a slow slide into place)
 *   t 0.68 → 0.88   he stops painting and turns toward it
 *   t 0.80 → 1.00   he leans, takes a half step, and reaches
 *
 * So the camera settles into the side profile at exactly the moment he notices — one move,
 * one beat. Because every value is a pure function of `t`, scrolling up unwinds the whole
 * sequence frame-for-frame with no extra state.
 */

export const SCENE3 = {
  /** [start, end] of each beat, in hero-scroll progress. Move them apart for more air. */
  appear: [0.55, 0.74],
  notice: [0.68, 0.88],
  reach: [0.8, 1.0],
  /** how far he commits: metres of step, radians of lean at full `reach` */
  step: 0.115,
  lean: 0.055,
  bob: 0.018, // how much the free foot lifts mid-step
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
