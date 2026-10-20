import { DEFAULT_ANIMATION_CONFIG, type AnimationConfig } from "../../config/animation";
import type { MoveEvent } from "../../core/types";
import { squareToWorld } from "../coords";

export interface Track {
  pieceId: string;
  kind: "glide" | "hop" | "sink";
  startMs: number;
  durationMs: number;
  from: [number, number];
  to: [number, number];
}

export interface MovePlan {
  durationMs: number;
  tracks: Track[];
}

/** Presentation only: the event already describes an authoritative, applied move. */
export function planMove(event: MoveEvent, config: AnimationConfig = DEFAULT_ANIMATION_CONFIG): MovePlan {
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

  if (event.captured) {
    const square = squareToWorld(event.captured.square);
    tracks.push({
      pieceId: event.captured.pieceId, kind: "sink",
      startMs: mover.durationMs - config.captureImpactLeadMs,
      durationMs: config.captureSinkMs, from: square, to: square,
    });
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
  };
}
