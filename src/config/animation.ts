import animation from "./animation.json";

export interface AnimationConfig {
  glideSquaresPerSecond: number;
  minMoveMs: number;
  maxMoveMs: number;
  knightHopHeight: number;
  liftHeight: number;
  captureImpactLeadMs: number;
  castlingRookDelayMs: number;
  postMovePauseMs: number;
}

export const DEFAULT_ANIMATION_CONFIG: AnimationConfig = animation;
