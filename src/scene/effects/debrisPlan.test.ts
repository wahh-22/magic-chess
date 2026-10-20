import { describe, expect, it } from "vitest";
import { BufferGeometry } from "three";
import { DEFAULT_EFFECTS_CONFIG, type DebrisConfig } from "../../config/effects";
import type { PieceInstance } from "../../core/types";
import type { Fragment } from "../fracture/FractureProvider";
import { debrisOpacity, isDebrisFinished, planDebris } from "./debrisPlan";

const config: DebrisConfig = {
  impulseStrength: 1.8, upwardBias: 1.6, outwardStrength: 0.7, randomSpread: 0.3,
  torque: 2, lifetimeMs: 2200, fadeDurationMs: 900, sinkDistance: 0.8,
  maxSimultaneousBursts: 4,
};
const victim: PieceInstance = { id: "victim", type: "p", color: "b", square: "d5" };
const impact = { atMs: 0, pieceId: victim.id, position: [-0.5, -0.5] as [number, number], direction: [0.6, -0.8] as [number, number] };
const fragment = (center: [number, number, number], volume = 0.01): Fragment => ({ geometry: new BufferGeometry(), center, volume });
const fragments = [fragment([0.2, 0.2, 0]), fragment([-0.2, 0.2, 0]), fragment([0, 0.6, 0.2]), fragment([0, 0.6, -0.2])];

describe("planDebris", () => {
  it.each(["b", "w"] as const)("reconstructs the piece layout with %s facing and no spawn offset", (color) => {
    const plans = planDebris(fragments, { ...victim, color }, impact, 42, config);
    const sign = color === "b" ? -1 : 1;
    plans.forEach((plan, index) => {
      const center = fragments[index]!.center;
      expect(plan.position[0]).toBeCloseTo(-0.5 + sign * center[2]);
      expect(plan.position[1]).toBe(center[1]);
      expect(plan.position[2]).toBeCloseTo(-0.5 - sign * center[0]);
      expect(plan.rotation).toEqual([0, sign * Math.PI / 2, 0]);
    });
    expect(plans.reduce((sum, plan) => sum + plan.position[0], 0) / plans.length).toBeCloseTo(-0.5);
    expect(plans.reduce((sum, plan) => sum + plan.position[2], 0) / plans.length).toBeCloseTo(-0.5);
  });

  it("leans along the attack direction and upward on average", () => {
    const plans = planDebris(fragments, victim, impact, 14, config);
    expect(plans.reduce((sum, plan) => sum + plan.impulse[0] * impact.direction[0] + plan.impulse[2] * impact.direction[1], 0)).toBeGreaterThan(0);
    expect(plans.reduce((sum, plan) => sum + plan.impulse[1], 0)).toBeGreaterThan(0);
  });

  it("is deterministic per seed, with variation between seeds", () => {
    const plan = planDebris(fragments, victim, impact, 42, config);
    expect(planDebris(fragments, victim, impact, 42, config)).toEqual(plan);
    expect(planDebris(fragments, victim, impact, 43, config)).not.toEqual(plan);
  });

  it("gives smaller chips greater speed (impulse / mass)", () => {
    const small = planDebris([fragment([0, 0.2, 0], 0.001)], victim, impact, 5, config)[0]!;
    const large = planDebris([fragment([0, 0.2, 0], 0.04)], victim, impact, 5, config)[0]!;
    expect(Math.hypot(...small.impulse) / small.mass).toBeGreaterThan(Math.hypot(...large.impulse) / large.mass);
  });

  it("keeps shipped launch speeds inside a short, local arc across sizes, directions and seeds", () => {
    const chips = [0, 0.0001, 0.001, 0.01, 0.04].flatMap((volume) =>
      fragments.map((part) => ({ ...part, volume })));
    for (let seed = 1; seed <= 100; seed++) {
      for (const direction of [[1, 0], [0, -1], [Math.SQRT1_2, Math.SQRT1_2]] as [number, number][]) {
        const plans = planDebris(chips, victim, { ...impact, direction }, seed, DEFAULT_EFFECTS_CONFIG.debris);
        plans.forEach(({ impulse, mass }) => {
          expect(Math.hypot(impulse[0], impulse[2]) / mass).toBeLessThanOrEqual(2.5);
          expect(impulse[1] / mass).toBeGreaterThan(0);
          expect(impulse[1] / mass).toBeLessThanOrEqual(2.1);
        });
      }
    }
  });

  it("handles empty input and degenerate volumes without NaN", () => {
    expect(planDebris([], victim, impact, 0, config)).toEqual([]);
    const plan = planDebris([fragment([0, 0, 0], 0)], victim, impact, 0, config)[0]!;
    expect([...plan.impulse, ...plan.angularImpulse, plan.mass].every(Number.isFinite)).toBe(true);
    expect(plan.mass).toBeGreaterThan(0);
  });
});

describe("debris lifetime", () => {
  it("holds opacity until lifetime, fades linearly, and finishes exactly at zero", () => {
    expect(debrisOpacity(-1, config)).toBe(1);
    expect(debrisOpacity(config.lifetimeMs, config)).toBe(1);
    expect(debrisOpacity(config.lifetimeMs + config.fadeDurationMs / 2, config)).toBeCloseTo(0.5);
    const end = config.lifetimeMs + config.fadeDurationMs;
    expect(debrisOpacity(end, config)).toBe(0);
    expect(debrisOpacity(end + 100, config)).toBe(0);
    expect(isDebrisFinished(end - 1, config)).toBe(false);
    expect(isDebrisFinished(end, config)).toBe(true);
  });

  it("supports an instant fade", () => {
    expect(debrisOpacity(config.lifetimeMs, { ...config, fadeDurationMs: 0 })).toBe(0);
  });

  it("ships a positive, bounded debris configuration", () => {
    expect(DEFAULT_EFFECTS_CONFIG.debris.maxSimultaneousBursts).toBeGreaterThan(0);
    expect(DEFAULT_EFFECTS_CONFIG.debris.lifetimeMs).toBeGreaterThan(0);
  });
});
