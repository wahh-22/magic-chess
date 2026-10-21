import type { AttackConfig } from "../../config/animation";

export interface AttackChoreography {
  pieceId: string;
  config: AttackConfig;
  startMs: number;
  windupMs: number;
  releaseMs: number;
  strikeMs: number;
  endMs: number;
}

/** Fit the wind-up before first contact, never delaying destruction into overlap. */
export function planAttack(pieceId: string, strikeMs: number, config: AttackConfig): AttackChoreography {
  const lead = config.anticipationMs + config.hangMs + config.strikeMs;
  const scale = Math.min(1, strikeMs / lead);
  const startMs = Math.max(0, strikeMs - lead);
  const windupMs = startMs + config.anticipationMs * scale;
  return { pieceId, config, startMs, windupMs, releaseMs: windupMs + config.hangMs * scale, strikeMs, endMs: strikeMs + config.recoverMs };
}

const smooth = (t: number) => {
  const bounded = Math.max(0, Math.min(1, t));
  return bounded * bounded * (3 - 2 * bounded);
};
const progress = (time: number, start: number, end: number) => end <= start ? 1 : smooth((time - start) / (end - start));

/** Pitch is around the base, relative to the travel direction, in radians.
 * Offset is along travel (never positive): the forward strike reaches the contact
 * proxy exactly at strikeMs. Grounding replaces the knight's hop during its slam.
 */
export function sampleAttack(attack: AttackChoreography, time: number) {
  const c = attack.config;
  if (time < attack.startMs) return { pitch: 0, height: 0, offset: 0, grounding: 0 };
  if (time < attack.releaseMs) {
    const t = progress(time, attack.startMs, attack.windupMs);
    return { pitch: c.windupAngle * t, height: c.height * t, offset: -c.retreat * t, grounding: t };
  }
  if (time < attack.strikeMs) {
    const t = progress(time, attack.releaseMs, attack.strikeMs);
    return { pitch: c.windupAngle + (c.strikeAngle - c.windupAngle) * t, height: c.height * (1 - t), offset: -c.retreat * (1 - t), grounding: 1 };
  }
  const t = progress(time, attack.strikeMs, attack.endMs);
  return { pitch: c.strikeAngle * (1 - t), height: 0, offset: 0, grounding: 1 };
}
