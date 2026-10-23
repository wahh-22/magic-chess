import { describe, expect, it } from "vitest";
import { DEFAULT_VFX_CONFIG, type VfxConfig } from "../../config/vfx";
import {
  createEmberPool, emberColor, emberHeat, emberSeed, killTag, spawnEmbers, stepEmbers, writeEmberInstances,
  EMBER_KIND, type SpawnRequest,
} from "./embers";

const config = DEFAULT_VFX_CONFIG;
const request = (overrides: Partial<SpawnRequest> = {}): SpawnRequest => ({
  origin: [1, 0.7, -2], direction: [0, -1], seed: 42, tag: 1, sparks: 30, embers: 20, drifters: 10, ...overrides,
});
const calm: VfxConfig = { ...config, wind: { x: 0, z: 0, gustHz: 0 }, floorY: -100 };

describe("ember spawning", () => {
  it("spawns the requested counts deterministically from the seed", () => {
    const a = createEmberPool(100), b = createEmberPool(100), c = createEmberPool(100);
    expect(spawnEmbers(a, request(), config)).toBe(60);
    spawnEmbers(b, request(), config);
    spawnEmbers(c, request({ seed: 43 }), config);
    expect(a.count).toBe(60);
    expect(Array.from(a.velocity.subarray(0, 180))).toEqual(Array.from(b.velocity.subarray(0, 180)));
    expect(Array.from(a.velocity.subarray(0, 180))).not.toEqual(Array.from(c.velocity.subarray(0, 180)));
    const kinds = Array.from(a.kind.subarray(0, a.count));
    expect(kinds.filter((k) => k === EMBER_KIND.spark)).toHaveLength(30);
    expect(kinds.filter((k) => k === EMBER_KIND.ember)).toHaveLength(20);
    expect(kinds.filter((k) => k === EMBER_KIND.drifter)).toHaveLength(10);
  });

  it("gives every particle a lifetime from its kind's range; burst particles live 0.6–1.6 s", () => {
    const pool = createEmberPool(100);
    spawnEmbers(pool, request(), config);
    for (let i = 0; i < pool.count; i++) {
      const kind = pool.kind[i] === EMBER_KIND.spark ? config.spark : pool.kind[i] === EMBER_KIND.ember ? config.ember : config.drifter;
      expect(pool.life[i]! * 1000).toBeGreaterThanOrEqual(kind.lifeMs[0]);
      expect(pool.life[i]! * 1000).toBeLessThanOrEqual(kind.lifeMs[1]);
      if (pool.kind[i] !== EMBER_KIND.drifter) {
        expect(pool.life[i]).toBeGreaterThanOrEqual(0.6);
        expect(pool.life[i]).toBeLessThanOrEqual(1.6);
      }
    }
  });

  it("starts near the origin and sprays forward along the attack and upward", () => {
    const pool = createEmberPool(100);
    spawnEmbers(pool, request(), config);
    let forward = 0, up = 0;
    for (let i = 0; i < pool.count; i++) {
      expect(Math.hypot(pool.position[i * 3]! - 1, pool.position[i * 3 + 1]! - 0.7, pool.position[i * 3 + 2]! + 2))
        .toBeLessThanOrEqual(config.spread.radius + 1e-6);
      forward += -pool.velocity[i * 3 + 2]!;
      up += pool.velocity[i * 3 + 1]!;
    }
    expect(forward).toBeGreaterThan(0);
    expect(up).toBeGreaterThan(0);
  });

  it("never grows the pool: extra particles are dropped", () => {
    const pool = createEmberPool(40);
    const position = pool.position;
    expect(spawnEmbers(pool, request(), config)).toBe(40);
    expect(spawnEmbers(pool, request({ tag: 2 }), config)).toBe(0);
    expect(pool.count).toBe(40);
    expect(pool.position).toBe(position);
  });

  it("derives the seed from the captured piece and its square", () => {
    expect(emberSeed("b-p-3", "d5")).toBe(emberSeed("b-p-3", "d5"));
    expect(emberSeed("b-p-3", "d5")).not.toBe(emberSeed("b-p-3", "d6"));
    expect(emberSeed("b-p-3", "d5")).not.toBe(emberSeed("b-p-4", "d5"));
    expect(Number.isInteger(emberSeed("w-k", "e1"))).toBe(true);
  });
});

describe("ember integration", () => {
  it("applies gravity ballistically when there is no drag", () => {
    const pool = createEmberPool(4);
    const noDrag: VfxConfig = { ...calm, spark: { ...calm.spark, drag: 0, lifeMs: [5000, 5000] } };
    spawnEmbers(pool, request({ sparks: 1, embers: 0, drifters: 0 }), noDrag);
    const [y0, vy0] = [pool.position[1]!, pool.velocity[1]!];
    for (let i = 0; i < 60; i++) stepEmbers(pool, 1 / 60, i / 60, noDrag);
    expect(pool.velocity[1]).toBeCloseTo(vy0 - noDrag.gravity, 4);
    // Semi-implicit Euler: within one step of gravity of the exact parabola.
    expect(Math.abs(pool.position[1]! - (y0 + vy0 - noDrag.gravity / 2))).toBeLessThan(noDrag.gravity / 60);
  });

  it("slows particles exponentially under drag", () => {
    const pool = createEmberPool(4);
    const floating: VfxConfig = { ...calm, gravity: 0, ember: { ...calm.ember, lifeMs: [5000, 5000] } };
    spawnEmbers(pool, request({ sparks: 0, embers: 1, drifters: 0 }), floating);
    const vx0 = pool.velocity[0]!;
    for (let i = 0; i < 30; i++) stepEmbers(pool, 1 / 60, i / 60, floating);
    expect(pool.velocity[0]).toBeCloseTo(vx0 * Math.exp(-floating.ember.drag * 0.5), 5);
  });

  it("lets drifters rise and follow the wind", () => {
    const pool = createEmberPool(4);
    spawnEmbers(pool, request({ sparks: 0, embers: 0, drifters: 1 }), config);
    const [x0, y0] = [pool.position[0]!, pool.position[1]!];
    for (let i = 0; i < 90; i++) stepEmbers(pool, 1 / 60, i / 60, config);
    expect(pool.count).toBe(1);
    expect(pool.position[1]).toBeGreaterThan(y0);
    expect(Math.sign(pool.position[0]! - x0)).toBe(Math.sign(config.wind.x));
    expect(pool.velocity[1]).toBeGreaterThan(0);
  });

  it("bounces falling embers off the floor and keeps them on it", () => {
    const pool = createEmberPool(60);
    spawnEmbers(pool, request(), config);
    for (let i = 0; i < 50; i++) {
      stepEmbers(pool, 1 / 60, i / 60, config);
      for (let p = 0; p < pool.count; p++) expect(pool.position[p * 3 + 1]).toBeGreaterThanOrEqual(Math.fround(config.floorY));
    }
  });

  it("lets embers fall past the edge of the board platform", () => {
    const pool = createEmberPool(4);
    const edge = { ...config, wind: { x: 0, z: 0, gustHz: 0 }, ember: { ...config.ember, lifeMs: [1500, 1500] as [number, number] } };
    spawnEmbers(pool, request({ origin: [config.floorHalf + 0.5, 0.3, 0], sparks: 0, embers: 1, drifters: 0 }), edge);
    for (let i = 0; i < 60; i++) stepEmbers(pool, 1 / 60, i / 60, edge);
    expect(pool.position[1]).toBeLessThan(config.floorY - 0.2);
  });

  it("removes particles when their lifetime ends, keeping the survivors packed", () => {
    const pool = createEmberPool(100);
    spawnEmbers(pool, request(), config);
    for (let i = 0; i < 60; i++) stepEmbers(pool, 1 / 60, i / 60, config);
    expect(pool.count).toBeLessThan(60);
    for (let i = 0; i < pool.count; i++) expect(pool.age[i]).toBeLessThan(pool.life[i]!);
    for (let i = 60; i < 200; i++) stepEmbers(pool, 1 / 60, i / 60, config);
    expect(pool.count).toBe(0);
  });

  it("kills only the particles of a cleared burst", () => {
    const pool = createEmberPool(200);
    spawnEmbers(pool, request({ tag: 1 }), config);
    spawnEmbers(pool, request({ tag: 2, seed: 9 }), config);
    killTag(pool, 1);
    expect(pool.count).toBe(60);
    for (let i = 0; i < pool.count; i++) expect(pool.tag[i]).toBe(2);
  });

  it("reuses its buffers every frame", () => {
    const pool = createEmberPool(100);
    const buffers = [pool.position, pool.velocity, pool.age, pool.life, pool.heat, pool.size, pool.kind, pool.tag];
    const out = { offset: new Float32Array(300), tail: new Float32Array(300), color: new Float32Array(300), size: new Float32Array(100) };
    const outBuffers = Object.values(out);
    spawnEmbers(pool, request(), config);
    for (let i = 0; i < 30; i++) {
      stepEmbers(pool, 1 / 60, i / 60, config);
      expect(writeEmberInstances(pool, out, config)).toBe(pool.count);
    }
    buffers.forEach((buffer, i) => expect([pool.position, pool.velocity, pool.age, pool.life, pool.heat, pool.size, pool.kind, pool.tag][i]).toBe(buffer));
    Object.values(out).forEach((buffer, i) => expect(buffer).toBe(outBuffers[i]));
  });
});

describe("ember colour", () => {
  const rgb = (heat: number) => { const out = new Float32Array(3); emberColor(heat, out, 0); return Array.from(out); };
  const luminance = ([r, g, b]: number[]) => 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;

  it("ramps from an HDR white-yellow core through orange to deep red and black", () => {
    const core = rgb(1), orange = rgb(0.5), red = rgb(0.25);
    expect(Math.max(...core)).toBeGreaterThan(2.5);
    expect(core[1]! / core[0]!).toBeGreaterThan(0.7);
    expect(orange[1]! / orange[0]!).toBeLessThan(core[1]! / core[0]!);
    expect(red[1]! / red[0]!).toBeLessThan(orange[1]! / orange[0]!);
    expect(red[0]).toBeGreaterThan(red[1]! * 4);
    expect(rgb(0)).toEqual([0, 0, 0]);
    for (let h = 0; h < 1; h += 0.05) expect(luminance(rgb(h + 0.05))).toBeGreaterThanOrEqual(luminance(rgb(h)));
  });

  it("cools each particle as it ages", () => {
    const pool = createEmberPool(100);
    spawnEmbers(pool, request(), config);
    const start = emberHeat(pool, 0);
    stepEmbers(pool, 0.3, 0, config);
    expect(emberHeat(pool, 0)).toBeLessThan(start);
    expect(start).toBeGreaterThan(0.6);
  });

  it("writes HDR colour, streak tails only for fast sparks, and sizes", () => {
    const pool = createEmberPool(100);
    spawnEmbers(pool, request(), config);
    const out = { offset: new Float32Array(300), tail: new Float32Array(300), color: new Float32Array(300), size: new Float32Array(100) };
    const count = writeEmberInstances(pool, out, config);
    for (let i = 0; i < count; i++) {
      expect(out.offset[i * 3]).toBe(pool.position[i * 3]);
      const tail = Math.hypot(out.tail[i * 3]!, out.tail[i * 3 + 1]!, out.tail[i * 3 + 2]!);
      if (pool.kind[i] === EMBER_KIND.drifter) expect(tail).toBe(0);
      if (pool.kind[i] === EMBER_KIND.spark) expect(tail).toBeGreaterThan(0.05);
      expect(out.size[i]).toBe(pool.size[i]);
      expect(Math.max(out.color[i * 3]!, out.color[i * 3 + 1]!, out.color[i * 3 + 2]!)).toBeGreaterThan(0.5);
    }
  });
});
