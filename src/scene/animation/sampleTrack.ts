import type { AnimationConfig } from "../../config/animation";
import type { Track } from "./planMove";
import { sampleMotion } from './motion';

export interface TrackSample {
  x: number;
  y: number;
  z: number;
  visible: boolean;
}

/** The track's path: straight, or two legs through `via` (the knight's L). */
export function trackPath(track: Track): [number, number][] {
  return track.via ? [track.from, track.via, track.to] : [track.from, track.to];
}

/** World [x, z] at a fraction (0..1) of the path length. */
export function pathPoint(path: [number, number][], fraction: number): [number, number] {
  const lengths = path.slice(1).map((point, i) => Math.hypot(point[0] - path[i]![0], point[1] - path[i]![1]));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  let remaining = Math.max(0, Math.min(1, fraction)) * total;
  for (const [i, length] of lengths.entries()) {
    const start = path[i]!, end = path[i + 1]!;
    if (remaining <= length || i === lengths.length - 1) {
      const t = length ? Math.min(1, remaining / length) : 1;
      return [start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t];
    }
    remaining -= length;
  }
  return path.at(-1)!;
}

/** Pieces slide like the film's giant chessmen: always on the board, eased in and out. */
export function sampleTrack(track: Track, elapsedMs: number, config: AnimationConfig): TrackSample {
  if (track.motion?.length) return sampleMotion(track.motion, elapsedMs);
  let elapsed = elapsedMs - track.startMs;
  if (track.hold) elapsed -= Math.max(0, Math.min(track.hold.durationMs, elapsed - track.hold.atMs));
  const t = elapsed < 0 ? 0 : track.durationMs <= 0 ? 1 : Math.min(1, elapsed / track.durationMs);
  if (track.kind === "shatter") {
    // The piece is replaced by its fragments at impact (see DebrisLayer).
    return { x: track.from[0], y: 0, z: track.from[1], visible: elapsed < 0 };
  }

  const eased = t * t * (3 - 2 * t);
  const [x, z] = pathPoint(trackPath(track), eased);
  const height = config.liftHeight * Math.sin(Math.PI * t);
  return { x, y: t === 0 || t === 1 ? 0 : height, z, visible: true };
}
