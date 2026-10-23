import { BoxGeometry, BufferAttribute, BufferGeometry, Color, Matrix4, Vector3 } from "three";
import { PLAZA_Y } from "./battlefieldConfig";

function hash3(i: number, j: number, k: number) {
  const s = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Smooth 3D value noise in [0, 1]. */
export function noise3(x: number, y: number, z: number): number {
  const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z);
  const fx = x - i, fy = y - j, fz = z - k;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const layer = (kk: number) => lerp(
    lerp(hash3(i, j, kk), hash3(i + 1, j, kk), u),
    lerp(hash3(i, j + 1, kk), hash3(i + 1, j + 1, kk), u), v);
  return lerp(layer(k), layer(k + 1), w);
}

/** Fractal noise in [0, 1]; each octave doubles the frequency and halves the weight. */
export function fbm3(x: number, y: number, z: number, octaves = 3): number {
  let sum = 0, weight = 0.5, total = 0;
  for (let octave = 0; octave < octaves; octave++) {
    const scale = 2 ** octave;
    sum += noise3(x * scale + octave * 17.3, y * scale - octave * 9.1, z * scale + octave * 3.7) * weight;
    total += weight;
    weight *= 0.5;
  }
  return sum / total;
}

export interface StoneOptions {
  /** Edge rounding radius (worn arrises). */
  round?: number;
  /** Depth of chips knocked out of edges and corners. */
  chip?: number;
  /** Surface roughness amplitude. */
  bumps?: number;
  /** Per-block colour multiplier (warm/cool, light/dark stones). */
  tint?: number;
}

/** Writes a constant per-vertex attribute (cavity/tint) so merged parts share one layout. */
function constant(geometry: BufferGeometry, name: string, value: number) {
  geometry.setAttribute(name, new BufferAttribute(new Float32Array(geometry.attributes.position!.count).fill(value), 1));
}

/**
 * A cut stone block that has weathered for two millennia: rounded, chipped arrises and
 * corners, an uneven face, transformed by `matrix`. Carries `cavity` (0..1, how deep a
 * vertex sits in a chip) and `tint` for the weathering paint.
 */
export function stoneBlock(width: number, height: number, depth: number, matrix: Matrix4, seed: number, options: StoneOptions = {}) {
  const { round = 0.02, chip = 0.08, bumps = 0.012, tint = 1 } = options;
  const segments = (size: number) => Math.max(2, Math.min(9, Math.ceil(size / 0.16)));
  // Faces keep their own vertices (no welding): normals stay crisp across the arrises, while
  // the position-driven displacement below moves coincident vertices identically (no cracks).
  const geometry = new BoxGeometry(width, height, depth, segments(width), segments(height), segments(depth));
  geometry.deleteAttribute("uv"); geometry.deleteAttribute("normal");
  const half = new Vector3(width / 2, height / 2, depth / 2);
  const inner = half.clone().subScalar(round);
  const position = geometry.attributes.position!;
  const cavity = new Float32Array(position.count);
  const p = new Vector3(), q = new Vector3(), offset = new Vector3(), normal = new Vector3();
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i);
    q.copy(p).clamp(inner.clone().negate(), inner);
    offset.subVectors(p, q);
    // Rounded box: points beyond the inner box move onto a sphere of radius `round`.
    if (offset.lengthSq() > 1e-12) p.copy(q).addScaledVector(offset.normalize(), round);
    normal.copy(offset.lengthSq() > 0 ? offset : p).normalize();
    // How close the vertex is to an edge (two or three faces at their limit).
    const atLimit = [0, 1, 2].filter((axis) => Math.abs(p.getComponent(axis)) > half.getComponent(axis) - round * 1.5 - 0.06).length;
    const sx = p.x + seed * 3.1, sy = p.y - seed * 1.7, sz = p.z + seed * 0.9;
    const surface = (fbm3(sx * 4, sy * 4, sz * 4) - 0.5) * bumps * 2;
    const chipNoise = fbm3(sx * 2.2 + 5, sy * 2.2, sz * 2.2 - 3, 2);
    const chipDepth = atLimit >= 2 ? chip * Math.max(0, chipNoise - 0.45) / 0.55 * (atLimit === 3 ? 1.6 : 1) : 0;
    p.addScaledVector(normal, surface - chipDepth);
    cavity[i] = Math.min(1, chipDepth / Math.max(chip, 1e-6) * 1.3 + Math.max(0, -surface) / Math.max(bumps * 4, 1e-6));
    position.setXYZ(i, p.x, p.y, p.z);
  }
  geometry.setAttribute("cavity", new BufferAttribute(cavity, 1));
  constant(geometry, "tint", tint);
  geometry.applyMatrix4(matrix);
  geometry.computeVertexNormals();
  return geometry;
}

const FLUTES = 20;

export interface DrumOptions {
  /** Radius at the bottom and the top of this drum (entasis is sampled per row). */
  radiusAt: (y: number) => number;
  /** Shaft-relative heights of this drum. */
  y0: number;
  y1: number;
  /** Broken top: lowers the upper rim in a jagged break. */
  broken?: boolean;
  fluted?: boolean;
  seed: number;
  tint?: number;
}

/**
 * One column drum: 20 Doric flutes meeting at sharp (worn, chipped) arrises, eroded rims at
 * the drum joints and an optional jagged break. Built at the origin, transformed by `matrix`.
 */
export function columnDrum(options: DrumOptions, matrix: Matrix4) {
  const { radiusAt, y0, y1, broken = false, fluted = true, seed, tint = 1 } = options;
  const around = FLUTES * 6;
  const rows = Math.max(4, Math.ceil((y1 - y0) / 0.22));
  const breakDepth = (angle: number) => {
    const tilt = 0.5 + 0.5 * Math.sin(angle + seed * 2.3);
    return (y1 - y0) * (0.22 * tilt + 0.45 * fbm3(Math.cos(angle) * 1.6 + seed, Math.sin(angle) * 1.6, seed, 3) * tilt);
  };
  const positions: number[] = [], cavities: number[] = [], indices: number[] = [];
  const point = (angle: number, y: number, inset = 0) => {
    const phase = (angle / (Math.PI * 2)) * FLUTES;
    const within = phase - Math.floor(phase);
    const flute = fluted ? Math.sqrt(Math.max(0, 1 - (2 * within - 1) ** 2)) : 0;
    const ca = Math.cos(angle), sa = Math.sin(angle);
    // Arrises (within ≈ 0 or 1) chip first; drum rims erode into a visible joint.
    const arris = fluted ? Math.max(0, 1 - Math.min(within, 1 - within) / 0.12) : 0;
    const rim = Math.max(0, 1 - Math.min(y - y0, y1 - y) / 0.07);
    const n = fbm3(ca * 3 + seed, y * 3.5, sa * 3 - seed, 3);
    const chip = 0.05 * arris * Math.max(0, n - 0.5) * 2 + 0.035 * rim * fbm3(ca * 7, y * 9 + seed, sa * 7, 2);
    const radius = radiusAt(y) * (1 - 0.055 * flute) - chip - inset + (n - 0.5) * 0.018;
    positions.push(ca * radius, y, sa * radius);
    cavities.push(Math.min(1, flute * 0.55 + chip * 14 + rim * 0.25));
  };
  for (let row = 0; row <= rows; row++) {
    for (let column = 0; column < around; column++) {
      const angle = column / around * Math.PI * 2;
      let y = y0 + (y1 - y0) * row / rows;
      // A break lowers the upper rows onto a jagged line instead of cutting through them.
      if (broken) y = Math.min(y, y1 - breakDepth(angle) * (row / rows) ** 0.35);
      point(angle, y);
    }
  }
  // Rows share their first vertex at the wrap, so normals stay smooth around the shaft.
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < around; column++) {
      const next = (column + 1) % around;
      const a = row * around + column, b = a + around, c = row * around + next, d = c + around;
      indices.push(a, b, c, c, b, d);
    }
  }
  // Caps: concentric rings so a break surface can be rough.
  const cap = (top: boolean) => {
    const rings = broken && top ? 4 : 1;
    const centre = positions.length / 3;
    const y = top ? y1 - (broken ? (y1 - y0) * 0.32 : 0) : y0;
    positions.push(0, y, 0); cavities.push(broken && top ? 0.6 : 0.1);
    const rimRow = top ? rows : 0;
    let previous: number[] = [];
    for (let ring = 1; ring <= rings; ring++) {
      const current: number[] = [];
      for (let column = 0; column < around; column += 2) {
        if (ring === rings) { current.push(rimRow * around + column); continue; }
        const t = ring / rings, angle = column / around * Math.PI * 2;
        const rimIndex = (rimRow * around + column) * 3;
        const rimY = positions[rimIndex + 1]!;
        const rough = broken ? (fbm3(Math.cos(angle) * t * 4 + seed, Math.sin(angle) * t * 4, seed * 2) - 0.5) * 0.18 : 0;
        current.push(positions.length / 3);
        positions.push(positions[rimIndex]! * t, y + (rimY - y) * t + rough, positions[rimIndex + 2]! * t);
        cavities.push(0.5);
      }
      const count = current.length;
      for (let k = 0; k < count; k++) {
        const a = current[k]!, b = current[(k + 1) % count]!;
        if (ring === 1) {
          if (top) indices.push(centre, b, a); else indices.push(centre, a, b);
        } else {
          const c = previous[k]!, d = previous[(k + 1) % count]!;
          if (top) indices.push(c, b, a, c, d, b); else indices.push(c, a, b, c, b, d);
        }
      }
      previous = current;
    }
  };
  cap(true);
  cap(false);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("cavity", new BufferAttribute(new Float32Array(cavities), 1));
  geometry.setIndex(indices);
  constant(geometry, "tint", tint);
  geometry.applyMatrix4(matrix);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * A surface of revolution (capital echinus, column base) from a [radius, y] profile, with
 * the same worn surface noise as the drums.
 */
export function revolve(profile: [number, number][], matrix: Matrix4, seed: number, tint = 1) {
  const around = 72;
  const positions: number[] = [], cavities: number[] = [], indices: number[] = [];
  profile.forEach(([radius, y]) => {
    for (let column = 0; column <= around; column++) {
      const angle = column / around * Math.PI * 2;
      const n = fbm3(Math.cos(angle) * 3 + seed, y * 4, Math.sin(angle) * 3, 3);
      const r = radius * (1 + (n - 0.5) * 0.05) - Math.max(0, n - 0.62) * 0.08;
      positions.push(Math.cos(angle) * r, y, Math.sin(angle) * r);
      cavities.push(Math.max(0, n - 0.6) * 2);
    }
  });
  for (let row = 0; row + 1 < profile.length; row++) {
    for (let column = 0; column < around; column++) {
      const a = row * (around + 1) + column, b = a + around + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("cavity", new BufferAttribute(new Float32Array(cavities), 1));
  geometry.setIndex(indices);
  constant(geometry, "tint", tint);
  geometry.applyMatrix4(matrix);
  geometry.computeVertexNormals();
  return geometry;
}

const LIMESTONE = new Color("#ece6dc");
const DIRT = new Color("#8a7358");
const LICHEN = new Color("#7d7a58");
const ORANGE_LICHEN = new Color("#c8894a");

/**
 * Bakes centuries of weather into vertex colours (multiplied with the stone texture):
 * soil splash and damp at the foot (scaled by `splash`; pavers lying on the ground get less), rain streaks under ledges, grey-green lichen on
 * up-facing surfaces, sparse orange lichen, and darker chips, flutes and joints.
 */
export function paintWeathering(geometry: BufferGeometry, { splash: splashAmount = 1 } = {}) {
  const position = geometry.attributes.position!, normal = geometry.attributes.normal!;
  const cavity = geometry.attributes.cavity, tint = geometry.attributes.tint;
  const colors = new Float32Array(position.count * 3);
  const color = new Color();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    const up = normal.getY(i);
    color.copy(LIMESTONE).multiplyScalar(tint ? tint.getX(i) : 1);
    const height = y - PLAZA_Y;
    const splash = Math.min(1, Math.max(0, 1 - height / 1.1)) * (0.55 + 0.45 * fbm3(x * 1.3, y * 2, z * 1.3, 2));
    color.lerp(DIRT, splash * 0.55 * splashAmount);
    const streak = fbm3(x * 2.6 + z * 2.6, y * 0.18, z * 0.4, 3);
    color.multiplyScalar(1 - Math.max(0, streak - 0.45) * 0.55 * (1 - Math.abs(up)));
    const patch = fbm3(x * 0.9 + 3, y * 0.9, z * 0.9 - 2, 3);
    const lichen = Math.max(0, up) * Math.max(0, patch - 0.42) * 2.2 + Math.max(0, patch - 0.68) * 1.4;
    color.lerp(LICHEN, Math.min(0.7, lichen));
    const speck = noise3(x * 9, y * 9, z * 9);
    if (speck > 0.83) color.lerp(ORANGE_LICHEN, (speck - 0.83) * 3.2 * Math.max(0.2, up));
    color.multiplyScalar(1 - 0.45 * (cavity ? cavity.getX(i) : 0));
    colors.set([color.r, color.g, color.b], i * 3);
  }
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  geometry.deleteAttribute("cavity");
  geometry.deleteAttribute("tint");
  return geometry;
}
