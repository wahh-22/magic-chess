import { Box3, BoxGeometry, Vector3 } from "three";
import { ConvexGeometry } from "three/examples/jsm/geometries/ConvexGeometry.js";
import { describe, expect, it } from "vitest";
import type { PieceType } from "../../core/types";
import { createProceduralPieceProvider } from "../pieces/proceduralPieces";
import { createVoronoiFractureProvider } from "./voronoiFracture";

const types: PieceType[] = ["p", "r", "n", "b", "q", "k"];

// The enclosing hull bridges the narrow stems and crown gaps, so it is larger
// than the solid piece even before fracture. Retaining 30–100% of that hull is
// a conservative visual approximation bound, not volume-preserving clipping.
describe("Voronoi fracture (S2)", () => {
  const models = createProceduralPieceProvider();
  const provider = createVoronoiFractureProvider(models, { fragmentCount: 14, seed: 73 });

  it.each(types)("%s: convex fragments have local geometry, positive volume and bounded coverage", (type) => {
    const fragments = provider.fragments(type);
    expect(fragments.length).toBeGreaterThanOrEqual(6);
    expect(fragments.length).toBeLessThanOrEqual(14);
    const source = models.geometry(type);
    source.computeBoundingBox();
    const bounds = source.boundingBox!;
    const union = new Box3();
    let volume = 0;
    for (const fragment of fragments) {
      const positions = fragment.geometry.getAttribute("position");
      expect(positions.count).toBeGreaterThanOrEqual(12);
      expect(fragment.geometry.getAttribute("normal").count).toBe(positions.count);
      expect(fragment.volume).toBeGreaterThan(1e-9);
      expect(Number.isFinite(fragment.volume)).toBe(true);
      expect(fragment.center.every(Number.isFinite)).toBe(true);
      fragment.geometry.computeBoundingBox();
      const local = fragment.geometry.boundingBox!;
      expect(local.getCenter(new Vector3()).length()).toBeLessThan(1e-6);
      union.union(local.clone().translate(new Vector3(...fragment.center)));
      volume += fragment.volume;
    }
    const size = bounds.getSize(new Vector3());
    const covered = union.getSize(new Vector3());
    for (const axis of ["x", "y", "z"] as const) {
      expect(covered[axis] / size[axis]).toBeGreaterThanOrEqual(0.9);
      expect(union.min[axis]).toBeGreaterThanOrEqual(bounds.min[axis] - 1e-6);
      expect(union.max[axis]).toBeLessThanOrEqual(bounds.max[axis] + 1e-6);
    }
    const positions = source.getAttribute("position");
    const hull = new ConvexGeometry(Array.from({ length: positions.count }, (_, i) =>
      new Vector3().fromBufferAttribute(positions, i)));
    const hullPositions = hull.getAttribute("position");
    let hullVolume = 0;
    for (let i = 0; i < hullPositions.count; i += 3) {
      const a = new Vector3().fromBufferAttribute(hullPositions, i);
      const b = new Vector3().fromBufferAttribute(hullPositions, i + 1);
      const c = new Vector3().fromBufferAttribute(hullPositions, i + 2);
      hullVolume += a.dot(b.cross(c)) / 6;
    }
    hull.dispose();
    expect(volume / Math.abs(hullVolume)).toBeGreaterThan(0.3);
    expect(volume / Math.abs(hullVolume)).toBeLessThanOrEqual(1.01);
  });

  it("repeats the same seed exactly and varies with a different seed", () => {
    const snapshot = (seed: number) => {
      const other = createVoronoiFractureProvider(models, { seed });
      return types.map((type) => other.fragments(type).map(({ center, volume, geometry }) => ({
        center, volume, positions: Array.from(geometry.getAttribute("position").array),
      })));
    };
    expect(snapshot(17)).toEqual(snapshot(17));
    expect(snapshot(18)).not.toEqual(snapshot(17));
  });

  it("caches the same array per type independently of request order", () => {
    for (const type of types) expect(provider.fragments(type)).toBe(provider.fragments(type));
    const reversed = createVoronoiFractureProvider(models, { fragmentCount: 14, seed: 73 });
    for (const type of [...types].reverse()) {
      expect(reversed.fragments(type).map((f) => f.center)).toEqual(provider.fragments(type).map((f) => f.center));
    }
  });

  it("supports alternate fragment counts and interior sample counts", () => {
    for (const fragmentCount of [6, 20]) {
      const other = createVoronoiFractureProvider(models, { fragmentCount, interiorSamples: 80 });
      for (const type of types) {
        expect(other.fragments(type).length).toBeGreaterThanOrEqual(6);
        expect(other.fragments(type).length).toBeLessThanOrEqual(fragmentCount);
      }
    }
  });

  it("merges degenerate cells without dropping the original extrema", () => {
    const box = new BoxGeometry(1, 1, 1);
    const other = createVoronoiFractureProvider({ ...models, geometry: () => box }, {
      fragmentCount: 8, interiorSamples: 0,
    });
    const fragments = other.fragments("p");
    expect(fragments.length).toBeGreaterThan(0);
    expect(fragments.length).toBeLessThan(8);
    const union = new Box3();
    for (const fragment of fragments) {
      expect(fragment.volume).toBeGreaterThan(0);
      fragment.geometry.computeBoundingBox();
      union.union(fragment.geometry.boundingBox!.clone().translate(new Vector3(...fragment.center)));
    }
    expect(union.min.toArray()).toEqual([-0.5, -0.5, -0.5]);
    expect(union.max.toArray()).toEqual([0.5, 0.5, 0.5]);
    box.dispose();
  });

  it("allows one fragment and no interior samples without mutating source positions", () => {
    const source = models.geometry("n");
    const before = Array.from(source.getAttribute("position").array);
    const other = createVoronoiFractureProvider(models, { fragmentCount: 1, interiorSamples: 0 });
    expect(other.fragments("n")).toHaveLength(1);
    expect(other.fragments("n")[0]!.volume).toBeGreaterThan(0);
    expect(Array.from(source.getAttribute("position").array)).toEqual(before);
  });

  it("rejects invalid options and non-solid source geometry", () => {
    for (const fragmentCount of [0, -1, 1.5, NaN, Infinity]) {
      expect(() => createVoronoiFractureProvider(models, { fragmentCount })).toThrow(RangeError);
    }
    for (const interiorSamples of [-1, 0.5, NaN, Infinity]) {
      expect(() => createVoronoiFractureProvider(models, { interiorSamples })).toThrow(RangeError);
    }
    expect(() => createVoronoiFractureProvider(models, { seed: NaN })).toThrow(RangeError);
    const plane = new BoxGeometry(1, 0, 1);
    const other = createVoronoiFractureProvider({ ...models, geometry: () => plane });
    expect(() => other.fragments("p")).toThrow("degenerate piece");
    plane.dispose();
  });

  it("fractures all six types in under 200 ms (cold provider)", () => {
    // Model creation is not fracture work; warm the real model cache first.
    for (const type of types) models.geometry(type);
    const fresh = createVoronoiFractureProvider(models);
    const timings: Record<string, number> = {};
    let count = 0;
    const start = performance.now();
    for (const type of types) {
      const before = performance.now();
      count += fresh.fragments(type).length;
      timings[type] = performance.now() - before;
    }
    const elapsed = performance.now() - start;
    console.info("fracture timings ms", timings, "total", elapsed, "average fragments", count / types.length);
    expect(elapsed).toBeLessThan(200);
  });
});
