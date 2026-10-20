import effects from "./effects.json";

export interface DustConfig {
  count: number;
  lifetimeMs: number;
  /** Particles start staggered over this window for a less uniform puff. */
  maxDelayMs: number;
  /** Initial outward speed, units per second. */
  speed: number;
  /** How much the burst leans toward the attack direction (0 = symmetric). */
  directionBias: number;
  /** Upward drift, units per second. */
  rise: number;
  /** Air drag; higher stops particles sooner. */
  drag: number;
  startSize: number;
  endSize: number;
  opacity: number;
  color: string;
}

export interface DebrisConfig {
  /** Launch speed at the reference fragment volume, in board units/second. */
  impulseStrength: number;
  upwardBias: number;
  outwardStrength: number;
  randomSpread: number;
  torque: number;
  lifetimeMs: number;
  fadeDurationMs: number;
  sinkDistance: number;
  maxSimultaneousBursts: number;
}

export interface EffectsConfig {
  dust: DustConfig;
  debris: DebrisConfig;
}

export const DEFAULT_EFFECTS_CONFIG: EffectsConfig = effects;
