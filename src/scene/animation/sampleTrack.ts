import type { AnimationConfig } from "../../config/animation";
import type { Track } from "./planMove";

export interface TrackSample {
  x: number;
  y: number;
  z: number;
  visible: boolean;
}

export function sampleTrack(track: Track, elapsedMs: number, config: AnimationConfig): TrackSample {
  const elapsed = elapsedMs - track.startMs;
  const t = elapsed < 0 ? 0 : track.durationMs <= 0 ? 1 : Math.min(1, elapsed / track.durationMs);
  if (track.kind === "sink") {
    return {
      x: track.from[0], y: -config.captureSinkDepth * t * t || 0, z: track.from[1], visible: t < 1,
    };
  }

  const eased = t * t * (3 - 2 * t);
  const height = track.kind === "hop"
    ? config.knightHopHeight * 4 * t * (1 - t)
    : config.liftHeight * Math.sin(Math.PI * t);
  return {
    x: track.from[0] + (track.to[0] - track.from[0]) * eased,
    y: t === 0 || t === 1 ? 0 : height,
    z: track.from[1] + (track.to[1] - track.from[1]) * eased,
    visible: true,
  };
}
