import { Box3, Vector3 } from "three";
import type { BufferGeometry } from "three";
import { ConvexGeometry } from "three/examples/jsm/geometries/ConvexGeometry.js";
import type { PieceType } from "../../core/types";
import type { PieceModelProvider } from "../pieces/PieceModelProvider";
import type { FractureProvider, Fragment } from "./FractureProvider";

export interface VoronoiFractureOptions {
  fragmentCount?: number;
  interiorSamples?: number;
  seed?: number;
}

/** Point-cloud Voronoi approximation, not mesh clipping: small gaps are expected. */
export function createVoronoiFractureProvider(
  models: PieceModelProvider,
  { fragmentCount = 14, interiorSamples = 320, seed = 12345 }: VoronoiFractureOptions = {},
): FractureProvider {
  if (!Number.isInteger(fragmentCount) || fragmentCount < 1) {
    throw new RangeError("fragmentCount must be a positive integer");
  }
  if (!Number.isInteger(interiorSamples) || interiorSamples < 0) {
    throw new RangeError("interiorSamples must be a non-negative integer");
  }
  if (!Number.isFinite(seed)) throw new RangeError("seed must be finite");
  const cache = new Map<PieceType, Fragment[]>();
  return {
    fragments(type) {
      let fragments = cache.get(type);
      if (!fragments) {
        // Per-type streams make lazy cache population independent of call order.
        const random = seededRandom((seed ^ Math.imul(type.charCodeAt(0), 2654435761)) >>> 0);
        const source = models.geometry(type);
        const points = surfacePoints(source);
        if (!hasVolume(points)) throw new Error(`Cannot fracture degenerate piece: ${type}`);
        addInteriorPoints(source, points, interiorSamples, random);
        const seeds = spreadSeeds(points, fragmentCount, random);
        const cells = seeds.map(() => [] as Vector3[]);
        for (const point of points) cells[nearest(point, seeds)]!.push(point);

        // Coplanar/tiny cells cannot produce a collider. Merge their points into
        // the nearest remaining cell before making hulls (never silently drop
        // extremal vertices, which would shrink the reconstructed bounds).
        for (let i = cells.length - 1; i >= 0; i--) {
          if (hasVolume(cells[i]!)) continue;
          const removed = cells.splice(i, 1)[0]!;
          const origin = seeds.splice(i, 1)[0]!;
          if (cells.length === 0) throw new Error(`No solid fracture cells: ${type}`);
          cells[nearest(origin, seeds)]!.push(...removed);
        }
        fragments = cells.map(makeFragment);
        cache.set(type, fragments);
      }
      return fragments;
    },
  };
}

function seededRandom(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function surfacePoints(geometry: BufferGeometry): Vector3[] {
  const positions = geometry.getAttribute("position");
  const unique = new Map<string, Vector3>();
  for (let i = 0; i < positions.count; i++) {
    const point = new Vector3().fromBufferAttribute(positions, i);
    // Collapse lathe seams, duplicated triangle corners, and pole roundoff.
    const key = `${Math.round(point.x * 1e6)},${Math.round(point.y * 1e6)},${Math.round(point.z * 1e6)}`;
    if (!unique.has(key)) unique.set(key, point);
  }
  return [...unique.values()];
}

/**
 * Sample horizontal chords inside the actual closed mesh, rather than pulling
 * toward an axis that may lie outside a knight's head or a detached ornament.
 * Intersections are paired by parity; overlapping merged solids may exclude
 * overlap regions, but every accepted interval is still inside a solid.
 */
function addInteriorPoints(
  geometry: BufferGeometry, points: Vector3[], count: number, random: () => number,
): void {
  const bounds = new Box3().setFromPoints(points);
  const size = bounds.getSize(new Vector3());
  const positions = geometry.getAttribute("position");
  const indices = geometry.index;
  const triangles: { a: Vector3; b: Vector3; c: Vector3; denominator: number }[] = [];
  const vertex = (i: number) => new Vector3().fromBufferAttribute(positions, indices ? indices.getX(i) : i);
  for (let i = 0; i < (indices?.count ?? positions.count); i += 3) {
    const a = vertex(i), b = vertex(i + 1), c = vertex(i + 2);
    const denominator = (b.z - c.z) * (a.y - c.y) + (c.y - b.y) * (a.z - c.z);
    if (Math.abs(denominator) > 1e-12) triangles.push({ a, b, c, denominator });
  }
  let added = 0;
  // Bounded rejection work even for future meshes with very sparse occupancy.
  for (let attempt = 0; added < count && attempt < count * 16; attempt++) {
    const y = bounds.min.y + random() * size.y;
    const z = bounds.min.z + random() * size.z;
    const hits: number[] = [];
    for (const { a, b, c, denominator } of triangles) {
      const u = ((b.z - c.z) * (y - c.y) + (c.y - b.y) * (z - c.z)) / denominator;
      const v = ((c.z - a.z) * (y - c.y) + (a.y - c.y) * (z - c.z)) / denominator;
      if (u >= 0 && v >= 0 && u + v <= 1) hits.push(u * a.x + v * b.x + (1 - u - v) * c.x);
    }
    hits.sort((a, b) => a - b);
    if (hits.length < 2 || hits.length % 2 !== 0) continue;
    const pair = Math.floor(random() * (hits.length / 2)) * 2;
    const low = hits[pair]!, high = hits[pair + 1]!;
    if (high - low < 1e-8) continue;
    points.push(new Vector3(low + (0.05 + 0.9 * random()) * (high - low), y, z));
    added++;
  }
}

/** Farthest-point placement spreads seeds both radially and along tall pieces. */
function spreadSeeds(points: Vector3[], count: number, random: () => number): Vector3[] {
  const seeds = [points[Math.floor(random() * points.length)]!];
  const distances = new Float64Array(points.length).fill(Infinity);
  while (seeds.length < Math.min(count, points.length)) {
    let farthest = 0;
    for (let i = 0; i < points.length; i++) {
      distances[i] = Math.min(distances[i]!, points[i]!.distanceToSquared(seeds[seeds.length - 1]!));
      if (distances[i]! > distances[farthest]!) farthest = i;
    }
    seeds.push(points[farthest]!);
  }
  return seeds;
}

function nearest(point: Vector3, seeds: Vector3[]): number {
  let best = 0;
  for (let i = 1; i < seeds.length; i++) {
    if (point.distanceToSquared(seeds[i]!) < point.distanceToSquared(seeds[best]!)) best = i;
  }
  return best;
}

function hasVolume(points: Vector3[]): boolean {
  if (points.length < 4) return false;
  const a = points[0]!;
  const b = points.find((p) => p.distanceToSquared(a) > 1e-12);
  if (!b) return false;
  const edge = b.clone().sub(a);
  const normal = new Vector3();
  for (const c of points) {
    normal.crossVectors(edge, c.clone().sub(a));
    if (normal.lengthSq() > 1e-16) {
      normal.normalize();
      return points.some((p) => Math.abs(normal.dot(p.clone().sub(a))) > 1e-7);
    }
  }
  return false;
}

function makeFragment(points: Vector3[]): Fragment {
  const geometry = new ConvexGeometry(points);
  geometry.computeBoundingBox();
  const center = geometry.boundingBox!.getCenter(new Vector3());
  geometry.translate(-center.x, -center.y, -center.z);
  const positions = geometry.getAttribute("position");
  const a = new Vector3(), b = new Vector3(), c = new Vector3();
  let volume = 0;
  for (let i = 0; i < positions.count; i += 3) {
    a.fromBufferAttribute(positions, i);
    b.fromBufferAttribute(positions, i + 1);
    c.fromBufferAttribute(positions, i + 2);
    volume += a.dot(b.cross(c)) / 6;
  }
  return { geometry, center: [center.x, center.y, center.z], volume: Math.abs(volume) };
}
