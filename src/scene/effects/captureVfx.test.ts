import { describe, expect, it } from "vitest";
import { DEFAULT_VFX_CONFIG } from "../../config/vfx";
import type { Burst } from "./effectsStore";
import { createEmberPool, emberSeed, spawnEmbers } from "./embers";
import type { PieceBounds } from "./pieceColliders";
import { captureSite, captureSpawn, flashIntensity, poolCapacity, reconcileBursts, trailColor, type TrackedBurst } from "./captureVfx";

const config = DEFAULT_VFX_CONFIG;
const size: PieceBounds = { width: 0.5, height: 1.2, depth: 0.4 };
const bounds = { p: size, n: size, b: size, r: size, q: size, k: size };
const burst = (id: number): Burst => ({
  id, seed: id * 7919,
  impact: { atMs: 900, reactionMs: 300, pieceId: "b-p-4", position: [0.5, -0.5], direction: [0, -1] },
  victim: { id: "b-p-4", type: "p", color: "b", square: "e5" },
});

describe("capture VFX budgets", () => {
  it("spawns the preset's counts at the contact, with fewer particles on low", () => {
    const site = captureSite(burst(1), bounds, config);
    const high = captureSpawn("impact", site, "high", config), low = captureSpawn("impact", site, "low", config);
    expect([high.sparks, high.embers, high.drifters]).toEqual([config.presets.high.sparks, config.presets.high.embers, config.presets.high.drifters]);
    expect([low.sparks, low.embers, low.drifters]).toEqual([config.presets.low.sparks, config.presets.low.embers, config.presets.low.drifters]);
    expect(low.sparks + low.embers + low.drifters).toBeLessThan((high.sparks + high.embers + high.drifters) / 2);
    expect(config.presets.high.light).toBe(true);
    expect(config.presets.low.light).toBe(false);
    expect(config.presets.low.brightness).toBeLessThan(config.presets.high.brightness);
  });

  it("puts the contact on the victim's front at chest height and the break at its centre", () => {
    const site = captureSite(burst(1), bounds, config);
    const impact = captureSpawn("impact", site, "high", config), broken = captureSpawn("break", site, "high", config);
    expect(impact.origin[1]).toBeCloseTo(size.height * config.impactHeight);
    expect(impact.origin[2]).toBeGreaterThan(-0.5);
    expect(impact.origin[0]).toBeCloseTo(0.5);
    expect([broken.origin[0], broken.origin[2]]).toEqual([0.5, -0.5]);
    expect([broken.sparks, broken.embers, broken.drifters]).toEqual([config.presets.high.breakSparks, config.presets.high.breakEmbers, 0]);
    expect(broken.seed).not.toBe(impact.seed);
    expect(impact.tag).toBe(1);
  });

  it("seeds from the captured piece and its square, not the global burst counter", () => {
    const a = captureSite(burst(1), bounds, config), b = captureSite(burst(7), bounds, config);
    expect(a.seed).toBe(b.seed);
    expect(a.seed).toBe(emberSeed("b-p-4", "e5"));
  });

  it("sizes the shared pool for the simultaneous-capture budget", () => {
    const perCapture = (q: "high" | "low") => {
      const p = config.presets[q];
      return p.sparks + p.embers + p.drifters + p.breakSparks + p.breakEmbers;
    };
    expect(poolCapacity("high", config)).toBe(perCapture("high") * config.maxBursts);
    expect(poolCapacity("low", config)).toBe(perCapture("low") * config.maxBursts);
  });
});

describe("impact flash", () => {
  it("rises briefly to the peak and decays to zero", () => {
    const { intensity, riseMs, decayMs } = config.flash;
    expect(flashIntensity(-10, config)).toBe(0);
    expect(flashIntensity(riseMs, config)).toBeCloseTo(intensity);
    expect(flashIntensity(riseMs + decayMs / 2, config)).toBeLessThan(intensity / 2);
    expect(flashIntensity(riseMs + decayMs, config)).toBe(0);
    expect(flashIntensity(5000, config)).toBe(0);
    for (let t = riseMs; t < riseMs + decayMs; t += 10) expect(flashIntensity(t + 10, config)).toBeLessThanOrEqual(flashIntensity(t, config));
  });
});

describe("weapon trail glow", () => {
  const color = (atMs: number, alpha: number) => { const out = new Float32Array(4); trailColor(atMs, 500, alpha, config.trail, out, 0); return Array.from(out); };

  it("is HDR hot at the hit and cooler away from it", () => {
    const hot = color(500, 1), cool = color(500 - config.trail.hotWindowMs - 50, 1);
    expect(hot.slice(0, 3)).toEqual(config.trail.hot.map(Math.fround));
    expect(Math.max(...hot.slice(0, 3))).toBeGreaterThan(2.5);
    expect(cool.slice(0, 3)).toEqual(config.trail.cool.map(Math.fround));
    expect(color(520, 1)[0]).toBeGreaterThan(color(560, 1)[0]!);
    expect(hot[0]).toBeGreaterThan(hot[2]!);
  });

  it("fades faster than linear with age", () => {
    expect(color(500, 1)[3]).toBe(1);
    expect(color(500, 0.5)[3]).toBeLessThan(0.5);
    expect(color(500, 0)[3]).toBe(0);
  });
});

describe("cleanup", () => {
  it("drops the particles of bursts that left the store (undo, new game, resume)", () => {
    const pool = createEmberPool(1000);
    const tracked = new Map<number, TrackedBurst>();
    for (const b of [burst(1), burst(2)]) {
      tracked.set(b.id, { breakSpawned: false, flashAtS: 0, flashScale: 1 });
      spawnEmbers(pool, captureSpawn("impact", captureSite(b, bounds, config), "high", config), config);
    }
    reconcileBursts(tracked, [burst(2)], pool);
    expect([...tracked.keys()]).toEqual([2]);
    for (let i = 0; i < pool.count; i++) expect(pool.tag[i]).toBe(2);
    reconcileBursts(tracked, [], pool);
    expect(tracked.size).toBe(0);
    expect(pool.count).toBe(0);
  });
});
