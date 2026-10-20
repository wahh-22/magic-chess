import { DEFAULT_ANIMATION_CONFIG, type AnimationConfig } from "../../config/animation";
import type { MoveEvent } from "../../core/types";
import { squareToWorld } from "../coords";
import { sampleTrack } from "./sampleTrack";

export interface Track {
  pieceId: string;
  kind: "glide" | "hop" | "shatter";
  startMs: number;
  durationMs: number;
  from: [number, number];
  to: [number, number];
}

/** The instant the attacker reaches its victim; destruction effects start here. */
export interface Impact {
  atMs: number;
  pieceId: string;
  /** World [x, z] of the captured piece. */
  position: [number, number];
  /** Unit [x, z] direction the attacker was travelling. */
  direction: [number, number];
}

export interface MovePlan {
  durationMs: number;
  tracks: Track[];
  impact?: Impact;
}

/** Earliest contact on the horizontal track, including off-destination victims.
 * Solve the line/circle entry, then invert the actual animation sampler rather
 * than introducing a second easing function. Hops intentionally use x/z only.
 */
function firstContactMs(track: Track, victim: [number, number], distance: number, config: AnimationConfig): number | undefined {
  const dx = track.to[0] - track.from[0], dz = track.to[1] - track.from[1];
  const ox = track.from[0] - victim[0], oz = track.from[1] - victim[1];
  if (Math.hypot(ox, oz) <= distance) return 0;
  const lengthSquared = dx * dx + dz * dz;
  if (!lengthSquared) return undefined;
  const projection = -(ox * dx + oz * dz) / lengthSquared;
  const discriminant = distance * distance - (ox * ox + oz * oz - projection * projection * lengthSquared);
  if (discriminant < 0) return undefined;
  const entry = projection - Math.sqrt(discriminant / lengthSquared);
  if (entry < 0 || entry > 1) return undefined;
  let low = 0, high = track.durationMs;
  for (let i = 0; i < 48; i++) {
    const middle = (low + high) / 2;
    const p = sampleTrack(track, middle, config);
    const progress = ((p.x - track.from[0]) * dx + (p.z - track.from[1]) * dz) / lengthSquared;
    if (progress < entry) low = middle;
    else high = middle;
  }
  return high;
}

/** Presentation only: the event already describes an authoritative, applied move.
 * contactDistance is the active provider's sum of attacker/victim proxy radii.
 * Omit it to retain legacy timing; paths that never touch also use that fallback.
 */
export function planMove(event: MoveEvent, config: AnimationConfig = DEFAULT_ANIMATION_CONFIG, contactDistance?: number): MovePlan {
  const from = squareToWorld(event.from);
  const to = squareToWorld(event.to);
  const dx = Math.abs(to[0] - from[0]);
  const dz = Math.abs(to[1] - from[1]);
  const moveDuration = (start: [number, number], end: [number, number]) =>
    Math.max(config.minMoveMs, Math.min(config.maxMoveMs,
      Math.hypot(end[0] - start[0], end[1] - start[1]) / config.glideSquaresPerSecond * 1000));
  const mover: Track = {
    pieceId: event.pieceId,
    kind: (dx === 1 && dz === 2) || (dx === 2 && dz === 1) ? "hop" : "glide",
    startMs: 0,
    durationMs: moveDuration(from, to),
    from,
    to,
  };
  const tracks: Track[] = [mover];
  let impact: Impact | undefined;

  if (event.captured) {
    const square = squareToWorld(event.captured.square);
    const contact = contactDistance !== undefined && Number.isFinite(contactDistance) && contactDistance >= 0
      ? firstContactMs(mover, square, contactDistance, config) : undefined;
    const atMs = contact ?? Math.max(0, mover.durationMs - config.captureImpactLeadMs);
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    tracks.push({ pieceId: event.captured.pieceId, kind: "shatter", startMs: atMs, durationMs: 0, from: square, to: square });
    impact = {
      atMs,
      pieceId: event.captured.pieceId,
      position: square,
      direction: [(to[0] - from[0]) / length, (to[1] - from[1]) / length],
    };
  }
  if (event.rookMove) {
    const rookFrom = squareToWorld(event.rookMove.from);
    const rookTo = squareToWorld(event.rookMove.to);
    tracks.push({
      pieceId: event.rookMove.pieceId, kind: "glide",
      startMs: config.castlingRookDelayMs,
      durationMs: moveDuration(rookFrom, rookTo), from: rookFrom, to: rookTo,
    });
  }

  return {
    durationMs: Math.max(...tracks.map((track) => track.startMs + track.durationMs)) + config.postMovePauseMs,
    tracks,
    ...(impact ? { impact } : {}),
  };
}
