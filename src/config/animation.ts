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
  glideSquaresPerSecond: number;
  minMoveMs: number;
  maxMoveMs: number;
  knightHopHeight: number;
  liftHeight: number;
  captureImpactLeadMs: number;
  castlingRookDelayMs: number;
  postMovePauseMs: number;
  attacks: Record<PieceType, AttackConfig>;
  shake: ShakeConfig;
}

export const DEFAULT_ANIMATION_CONFIG: AnimationConfig = animation;
