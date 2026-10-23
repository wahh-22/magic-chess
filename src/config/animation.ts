import animation from "./animation.json";
import type { PieceType } from "../core/types";

export interface AttackConfig {
  anticipationMs: number;
  hangMs: number;
  strikeMs: number;
  recoverMs: number;
  windupAngle: number;
  strikeAngle: number;
  height: number;
  retreat: number;
}
export interface ShakeConfig {
  durationMs: number;
  frequencyHz: number;
  intensity: Record<PieceType, number>;
}

export interface AnimationConfig {
  /** glide: pieces slide in guard on their pedestal (default, L10); walk: authored walk cycles. */
  locomotion: "glide" | "walk";
  glideSquaresPerSecond: number;
  minMoveMs: number;
  maxMoveMs: number;
  liftHeight: number;
  /** Fastest walk-clip playback for long legs (brisk walk, feet in sync). */
  walkMaxRate: number;
  walkBaseRate: number;
  /** Board-unit travel time; the clip rate is derived from its measured stride. */
  walkSquareMs: number;
  attackRate: number;
  /** Longest a single walking leg may last; beyond walkMaxRate the feet slide slightly. */
  walkMaxLegMs: number;
  captureImpactLeadMs: number;
  castlingRookDelayMs: number;
  postMovePauseMs: number;
  hitstopMs: number;
  turnMs: number;
  hitReactionMs: number;
  crossfadeMs: number;
  trailLifetimeMs: number;
  attacks: Record<PieceType, AttackConfig>;
  shake: ShakeConfig;
}

export const DEFAULT_ANIMATION_CONFIG = animation as AnimationConfig;
