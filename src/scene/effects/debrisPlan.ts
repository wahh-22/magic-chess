import { FACING } from "../facing";
import type { DebrisConfig } from "../../config/effects";
import type { PieceInstance } from "../../core/types";
import type { Impact } from "../animation/planMove";
import { squareToWorld } from "../coords";
import type { Fragment } from "../fracture/FractureProvider";
import type { Vec3 } from "./dust";

export interface DebrisPlan {
  position: Vec3;
  rotation: Vec3;
  mass: number;
  /** World-space impulses; the collider uses the same mass. */
  impulse: Vec3;
  angularImpulse: Vec3;
}

/** Pure launch plan: positions exactly reconstruct the vanished piece, without jitter. */
export function planDebris(
  fragments: Fragment[], victim: PieceInstance, impact: Impact, seed: number, config: DebrisConfig,
): DebrisPlan[] {
  let state = seed >>> 0 || 1;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const signed = () => random() * 2 - 1;
  const angle = FACING[victim.color];
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const [x, z] = squareToWorld(victim.square);
  return fragments.map(({ center, volume }) => {
    const ox = cos * center[0] + sin * center[2];
    const oz = -sin * center[0] + cos * center[2];
    const radius = Math.hypot(ox, oz);
    const mass = Math.max(volume, 0.0001);
    // Bounded inverse-cube-root size scaling: chips travel farther, not explosively far.
    const speed = config.impulseStrength * Math.min(1.8, Math.max(0.6, Math.cbrt(0.01 / mass)));
    const scale = mass * speed;
    const spin = mass * Math.cbrt(mass) ** 2 * config.torque;
    return {
      position: [x + ox, center[1], z + oz],
      rotation: [0, angle, 0],
      mass,
      impulse: [
        (impact.direction[0] + (radius ? ox / radius : 0) * config.outwardStrength + signed() * config.randomSpread) * scale,
        (config.upwardBias + random() * config.randomSpread) * scale,
        (impact.direction[1] + (radius ? oz / radius : 0) * config.outwardStrength + signed() * config.randomSpread) * scale,
      ],
      angularImpulse: [signed() * spin, signed() * spin, signed() * spin],
    };
  });
}

export function debrisOpacity(elapsedMs: number, config: DebrisConfig): number {
  if (elapsedMs < config.lifetimeMs) return 1;
  if (config.fadeDurationMs <= 0) return 0;
  return Math.max(0, 1 - (elapsedMs - config.lifetimeMs) / config.fadeDurationMs);
}

export function isDebrisFinished(elapsedMs: number, config: DebrisConfig): boolean {
  return elapsedMs >= config.lifetimeMs + config.fadeDurationMs;
}
