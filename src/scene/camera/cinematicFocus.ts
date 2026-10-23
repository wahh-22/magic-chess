import type { Point3 } from "./cinematicShots";

/**
 * Presentation-only channel from the cinematic camera to the post stack: while a shot
 * plays, depth of field focuses on its target with strength `amount` (0 = play view).
 */
export const cinematicFocus: { amount: number; target: Point3 } = { amount: 0, target: [0, 0, 0] };

/** Focus strength over a shot: ramps in during the approach, out during the return. */
export function focusAmount(elapsedMs: number, approachMs: number, holdMs: number, returnMs: number): number {
  const smooth = (t: number) => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };
  if (elapsedMs <= approachMs + holdMs) return smooth(elapsedMs / approachMs);
  return 1 - smooth((elapsedMs - approachMs - holdMs) / returnMs);
}
