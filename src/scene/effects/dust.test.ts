import { describe, expect, it } from "vitest";
import { DEFAULT_EFFECTS_CONFIG } from "../../config/effects";
import { createDustParticles, sampleDust } from "./dust";

const config = DEFAULT_EFFECTS_CONFIG.dust;
const burst = () => createDustParticles([1, -2], [0, -1], 7, config);

describe("dust burst", () => {
  it("creates the configured number of particles around the impact point, deterministically", () => {
    const particles = burst();
    expect(particles).toHaveLength(config.count);
    expect(burst()).toEqual(particles);
    expect(createDustParticles([1, -2], [0, -1], 8, config)).not.toEqual(particles);
    for (const particle of particles) {
      expect(Math.hypot(particle.origin[0] - 1, particle.origin[2] + 2)).toBeLessThan(0.45);
      expect(particle.origin[1]).toBeGreaterThanOrEqual(0);
      expect(particle.delayMs).toBeGreaterThanOrEqual(0);
      expect(particle.delayMs).toBeLessThanOrEqual(config.maxDelayMs);
    }
  });

  it("leans the burst toward the attack direction", () => {
    const meanZ = burst().reduce((sum, p) => sum + p.velocity[2], 0) / config.count;
    expect(meanZ).toBeLessThan(0);
  });

  it("starts small, then grows, slows down, rises, and fades out", () => {
    const particle = { origin: [0, 0.2, 0] as [number, number, number], velocity: [1, 0.3, 0] as [number, number, number], delayMs: 0 };
    const early = sampleDust(particle, 100, config);
    const middle = sampleDust(particle, config.lifetimeMs / 2, config);
    const late = sampleDust(particle, config.lifetimeMs * 0.9, config);
    expect(early.size).toBeLessThan(middle.size);
    expect(middle.size).toBeLessThan(late.size);
    expect(middle.opacity).toBeGreaterThan(late.opacity);
    // Drag: the second half covers less distance than the first.
    expect(late.position[0] - middle.position[0]).toBeLessThan(middle.position[0] - early.position[0]);
    expect(late.position[1]).toBeGreaterThan(particle.origin[1]);
  });

  it("is hidden before its delay and after its lifetime", () => {
    const particle = { origin: [0, 0, 0] as [number, number, number], velocity: [0, 0, 0] as [number, number, number], delayMs: 50 };
    expect(sampleDust(particle, 10, config).opacity).toBe(0);
    expect(sampleDust(particle, 50 + config.lifetimeMs, config).opacity).toBe(0);
    expect(sampleDust(particle, 50 + config.lifetimeMs * 3, config).opacity).toBe(0);
  });
});
