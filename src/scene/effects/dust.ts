import type { DustConfig } from "../../config/effects";

export type Vec3 = [number, number, number];

export interface DustParticle {
  origin: Vec3;
  /** Initial velocity, units per second. */
  velocity: Vec3;
  delayMs: number;
}

export interface DustSample {
  position: Vec3;
  size: number;
  opacity: number;
}

/** Small deterministic PRNG so a burst can be reproduced in tests. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** A puff of stone dust around the impact point, leaning toward the attack direction. */
export function createDustParticles(
  center: [number, number],
  direction: [number, number],
  seed: number,
  config: DustConfig,
): DustParticle[] {
  const random = seededRandom(seed);
  return Array.from({ length: config.count }, () => {
    const angle = random() * Math.PI * 2;
    const radial: [number, number] = [Math.cos(angle), Math.sin(angle)];
    const radius = 0.1 + random() * 0.3;
    const speed = config.speed * (0.4 + 0.6 * random());
    return {
      origin: [center[0] + radial[0] * radius, 0.05 + random() * 0.5, center[1] + radial[1] * radius],
      velocity: [
        (radial[0] + direction[0] * config.directionBias) * speed,
        config.rise * (0.5 + random()),
        (radial[1] + direction[1] * config.directionBias) * speed,
      ],
      delayMs: random() * config.maxDelayMs,
    };
  });
}

/** Position, size, and opacity of one particle at a time since the burst started. */
export function sampleDust(particle: DustParticle, elapsedMs: number, config: DustConfig): DustSample {
  const local = elapsedMs - particle.delayMs;
  if (local < 0 || local >= config.lifetimeMs) {
    return { position: particle.origin, size: config.startSize, opacity: 0 };
  }
  const t = local / config.lifetimeMs;
  // Distance under linear drag: v · (1 − e^(−k·s)) / k.
  const travel = (1 - Math.exp((-config.drag * local) / 1000)) / config.drag;
  const [ox, oy, oz] = particle.origin;
  const [vx, vy, vz] = particle.velocity;
  return {
    position: [ox + vx * travel, oy + vy * travel, oz + vz * travel],
    size: config.startSize + (config.endSize - config.startSize) * (1 - (1 - t) ** 2),
    opacity: config.opacity * Math.min(1, t / 0.08) * (1 - t) ** 1.5,
  };
}
