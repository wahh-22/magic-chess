import type { ShakeConfig } from "../../config/animation";
import type { PieceType } from "../../core/types";

/** Deterministic additive translation, with a quadratic decay and exact rest. */
export function sampleImpactShake(elapsedMs: number, type: PieceType, config: ShakeConfig, reducedMotion: boolean): [number, number, number] {
  if (reducedMotion || elapsedMs < 0 || elapsedMs >= config.durationMs) return [0, 0, 0];
  const amplitude = config.intensity[type] * (1 - elapsedMs / config.durationMs) ** 2;
  const phase = elapsedMs / 1000 * config.frequencyHz * Math.PI * 2;
  return [Math.sin(phase) * amplitude, Math.sin(phase * 1.31) * amplitude * 0.7, Math.sin(phase * 0.79) * amplitude * 0.4];
}
