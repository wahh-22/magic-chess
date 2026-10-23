import type { Track } from '../animation/planMove';

export const PEDESTAL_STEP_MS = 200;
export const PEDESTAL_FADE_MS = 400;
const ease = (t: number) => { const v = Math.max(0, Math.min(1, t)); return v * v * (3 - 2 * v); };
const pulse = (t: number) => t <= 0 || t >= 1 ? 0 : Math.sin(Math.PI * t) * 0.65;

/** Pure presentation; no timers survive an undo, new game or restored position. */
export function pedestalPresentation(track: Track | undefined, elapsedMs: number, height: number) {
  // At rest, or while gliding (the pedestal travels with the piece), it is simply there.
  if (!track || track.carriesPedestal) return { height: 0, sourceOpacity: 1, destinationOpacity: 0, sourceGlow: 0, destinationGlow: 0 };
  const elapsed = elapsedMs - track.startMs;
  const fade = elapsed / PEDESTAL_FADE_MS;
  if (track.kind === 'shatter') return { height: 0, sourceOpacity: 1 - ease(fade), destinationOpacity: 0, sourceGlow: pulse(fade), destinationGlow: 0 };
  const arrival = (elapsed - track.durationMs + PEDESTAL_STEP_MS) / PEDESTAL_STEP_MS;
  return {
    height: -height * ease(elapsed / PEDESTAL_STEP_MS) * (1 - ease(arrival)) || 0,
    sourceOpacity: 1 - ease(fade), destinationOpacity: ease(arrival),
    sourceGlow: pulse(fade), destinationGlow: pulse(arrival),
  };
}
