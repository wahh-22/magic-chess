import {
  BoxGeometry,
  BufferGeometry,
  ExtrudeGeometry,
  LatheGeometry,
  Shape,
  SphereGeometry,
  Vector2,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { PieceType } from "../../core/types";
import type { PieceModelProvider } from "./PieceModelProvider";

const LATHE_SEGMENTS = 48;

/** Turned-wood style placeholder pieces (D2, MVP phase). */
export function createProceduralPieceProvider(): PieceModelProvider {
  const cache = new Map<PieceType, BufferGeometry>();
  return {
    geometry(type) {
      let geometry = cache.get(type);
      if (!geometry) {
        geometry = BUILDERS[type]();
        cache.set(type, geometry);
      }
      return geometry;
    },
  };
}

const BUILDERS: Record<PieceType, () => BufferGeometry> = {
  p: () => lathe([...base(0.3), [0.2, 0.17], [0.12, 0.32], [0.1, 0.44], [0.17, 0.47], [0.17, 0.5], [0.09, 0.53], ...arc(0.65, 0.14, -55, 90)]),

  r: () =>
    merge(
      lathe([...base(0.34), [0.24, 0.18], [0.2, 0.3], [0.2, 0.62], [0.27, 0.68], [0.27, 0.8], [0.2, 0.8], [0.2, 0.74], [0, 0.74]]),
      ...ring(6, (angle) => box(0.1, 0.1, 0.1, 0.85, angle, 0.22)),
    ),

  n: () => merge(lathe([...base(0.34), [0.24, 0.17], [0.22, 0.24], [0.26, 0.28], [0.26, 0.31], [0, 0.31]]), knightHead()),

  b: () =>
    lathe([
      ...base(0.32),
      [0.2, 0.18],
      [0.12, 0.42],
      [0.1, 0.62],
      [0.18, 0.66],
      [0.18, 0.69],
      [0.1, 0.71],
      [0.15, 0.78],
      [0.16, 0.88],
      [0.12, 0.98],
      [0.05, 1.04],
      ...arc(1.08, 0.045, -60, 90),
    ]),

  q: () =>
    merge(
      lathe([...base(0.36), [0.22, 0.18], [0.13, 0.45], [0.11, 0.78], [0.2, 0.82], [0.2, 0.86], [0.12, 0.88], [0.15, 1.0], [0.22, 1.12], [0.16, 1.12], [0.1, 1.08], ...arc(1.16, 0.08, -50, 90)]),
      ...ring(8, (angle) => sphere(0.04, 1.13, 0.2, angle)),
    ),

  k: () =>
    merge(
      lathe([...base(0.36), [0.23, 0.18], [0.14, 0.45], [0.12, 0.84], [0.21, 0.88], [0.21, 0.92], [0.13, 0.94], [0.16, 1.04], [0.2, 1.16], [0.14, 1.2], [0, 1.2]]),
      box(0.06, 0.26, 0.06, 1.32, 0),
      box(0.18, 0.06, 0.06, 1.36, 0),
    ),
};

/** Shared foot: a wide plinth with a soft bevel. */
function base(radius: number): [number, number][] {
  return [
    [0, 0],
    [radius, 0],
    [radius, 0.05],
    [radius - 0.03, 0.08],
    [radius - 0.05, 0.1],
    [radius - 0.06, 0.13],
  ];
}

/** Profile points along a circle centered on the axis, from one angle to another (degrees). */
function arc(centerY: number, radius: number, fromDeg: number, toDeg: number, steps = 12): [number, number][] {
  const points: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = ((fromDeg + ((toDeg - fromDeg) * i) / steps) * Math.PI) / 180;
    points.push([Math.max(0, radius * Math.cos(angle)), centerY + radius * Math.sin(angle)]);
  }
  return points;
}

function lathe(profile: [number, number][]): BufferGeometry {
  return new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), LATHE_SEGMENTS);
}

function box(width: number, height: number, depth: number, centerY: number, angle: number, radius = 0): BufferGeometry {
  const geometry = new BoxGeometry(width, height, depth);
  geometry.rotateY(-angle);
  geometry.translate(radius * Math.cos(angle), centerY, radius * Math.sin(angle));
  return geometry;
}

function sphere(radius: number, centerY: number, ringRadius: number, angle: number): BufferGeometry {
  const geometry = new SphereGeometry(radius, 12, 8);
  geometry.translate(ringRadius * Math.cos(angle), centerY, ringRadius * Math.sin(angle));
  return geometry;
}

/** Places `count` parts evenly around the vertical axis. */
function ring(count: number, make: (angle: number) => BufferGeometry): BufferGeometry[] {
  return Array.from({ length: count }, (_, i) => make((i / count) * Math.PI * 2));
}

/** Side profile of a horse head, extruded and bevelled, facing +x. */
function knightHead(): BufferGeometry {
  const outline: [number, number][] = [
    [-0.18, 0.3],
    [0.16, 0.3],
    [0.1, 0.48],
    [0.2, 0.56],
    [0.3, 0.62],
    [0.3, 0.72],
    [0.18, 0.84],
    [0.06, 0.92],
    [0.02, 1.0],
    [-0.04, 0.92],
    [-0.14, 0.86],
    [-0.2, 0.7],
    [-0.22, 0.5],
  ];
  const shape = new Shape(outline.map(([x, y]) => new Vector2(x, y)));
  const depth = 0.16;
  const geometry = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.025,
    bevelSegments: 3,
    curveSegments: 8,
  });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

/**
 * Merges parts after de-indexing them, since lathe/box/sphere are indexed and
 * extrusions are not. Each part keeps its own smooth normals; recomputing them on
 * non-indexed geometry would make every face flat.
 */
function merge(...parts: BufferGeometry[]): BufferGeometry {
  const normalized = parts.map((part) => {
    const flat = part.index ? part.toNonIndexed() : part;
    flat.clearGroups();
    return flat;
  });
  const merged = mergeGeometries(normalized);
  if (!merged) throw new Error("Could not merge piece parts");
  return merged;
}
