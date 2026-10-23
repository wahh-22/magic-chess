import { BufferAttribute, BufferGeometry, Color, Euler, Matrix4, Quaternion, Vector3 } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { PLAZA_HALF, PLAZA_Y, TERRAIN_RADIUS } from "./battlefieldConfig";
import { seededRandom } from "./ruins";
import { paintWeathering, stoneBlock } from "./weathering";

/** Smooth 2D value noise in [0, 1]. */
export function valueNoise(x: number, z: number): number {
  const hash = (i: number, j: number) => {
    const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const i = Math.floor(x), j = Math.floor(z);
  const fx = x - i, fz = z - j;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Ground height: flat around the plaza and ruins, then rolling hills toward the horizon. */
export function terrainHeight(x: number, z: number): number {
  const radius = Math.hypot(x, z);
  // No ripple under the paving (a square), so grass never pokes through the plaza.
  const outside = Math.min(1, Math.max(0, Math.max(Math.abs(x), Math.abs(z)) - PLAZA_HALF - 0.2));
  const ripple = 0.12 * valueNoise(x * 0.35, z * 0.35) * outside;
  const rise = Math.min(1, Math.max(0, (radius - 34) / 120));
  const hills = (rise * rise * (3 - 2 * rise)) * (1.2 + 2.2 * valueNoise(x * 0.03 + 3, z * 0.03 - 7));
  return PLAZA_Y - 0.04 + ripple + hills;
}

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/**
 * Ground layer weights [dry grass, dirt, gravel] at a point: gravel and trodden dirt along
 * the ragged plaza edge, bare soil worn around every ruin and in scattered patches, dry
 * grass everywhere else. Normalised to sum to 1.
 */
export function groundBlend(x: number, z: number, footprints: [number, number, number][] = []): [number, number, number] {
  const square = Math.max(Math.abs(x), Math.abs(z));
  const ragged = valueNoise(x * 0.3 + 5, z * 0.3) * 2.6;
  const edge = 1 - smoothstep(0.4, 3.6, Math.abs(square - (PLAZA_HALF - ragged * 0.6)));
  let worn = 0;
  for (const [fx, fz, radius] of footprints) worn = Math.max(worn, 1 - smoothstep(radius * 0.8, radius + 2.4, Math.hypot(x - fx, z - fz)));
  const patch = valueNoise(x * 0.085 + 11, z * 0.085 - 4);
  const gravel = edge * (0.55 + 0.45 * valueNoise(x * 0.5, z * 0.5 + 9));
  const dirt = Math.max(worn * 0.75, smoothstep(0.58, 0.8, patch) * 0.9, edge * 0.45);
  const grass = Math.max(0, 1 - Math.max(gravel, dirt) * 1.15) + 0.05;
  const sum = grass + dirt + gravel;
  return [grass / sum, dirt / sum, gravel / sum];
}

/** Polar grid disc, denser near the plaza, carrying ground-layer weights and macro tint. */
export function buildTerrain(footprints: [number, number, number][] = [], textureSize = 1): BufferGeometry {
  const rings: number[] = [];
  for (let radius = 0; radius < TERRAIN_RADIUS; radius += Math.max(0.6, radius * 0.06)) rings.push(radius);
  rings.push(TERRAIN_RADIUS);
  const segments = 160;
  const positions: number[] = [], uvs: number[] = [], colors: number[] = [], blends: number[] = [], indices: number[] = [];
  const warm = new Color("#f6e8d2"), cool = new Color("#d3d6c4"), lush = new Color("#aeb78a"), mix = new Color();
  rings.forEach((radius) => {
    for (let segment = 0; segment <= segments; segment++) {
      const angle = segment / segments * Math.PI * 2;
      const x = Math.cos(angle) * radius, z = -Math.sin(angle) * radius;
      positions.push(x, terrainHeight(x, z), z);
      uvs.push(x / textureSize, -z / textureSize);
      blends.push(...groundBlend(x, z, footprints));
      const tone = valueNoise(x * 0.05 + 3, z * 0.05);
      const green = Math.min(1, Math.max(0, (valueNoise(x * 0.07 - 5, z * 0.07 + 2) - 0.5) * 2.5));
      mix.copy(cool).lerp(warm, tone).lerp(lush, green * 0.6).multiplyScalar(0.76 + 0.24 * valueNoise(x * 0.2, z * 0.2 + 7));
      colors.push(mix.r, mix.g, mix.b);
    }
  });
  for (let ring = 0; ring + 1 < rings.length; ring++) {
    for (let segment = 0; segment < segments; segment++) {
      const a = ring * (segments + 1) + segment, b = a + segments + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setAttribute("color", new BufferAttribute(new Float32Array(colors), 3));
  geometry.setAttribute("blend", new BufferAttribute(new Float32Array(blends), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

interface PaverCell { x0: number; z0: number; loose: boolean; sink: number; tiltX: number; tiltZ: number; gap: number; depth: number }

/**
 * Square plaza of limestone pavers, one per cell. The interior is a continuous surface;
 * toward the ragged edge pavers go missing, or lie loose, sunk and tilted like an
 * excavated site.
 */
function paverCells(cell: number): PaverCell[] {
  const random = seededRandom(31);
  const cells: PaverCell[] = [];
  const count = Math.ceil(PLAZA_HALF / cell);
  for (let i = -count; i < count; i++) {
    for (let j = -count; j < count; j++) {
      const x0 = i * cell, z0 = j * cell;
      const cx = x0 + cell / 2, cz = z0 + cell / 2;
      // Distance inside the square edge, eroded by noise: <0 means the paver is gone.
      const depth = PLAZA_HALF - Math.max(Math.abs(cx), Math.abs(cz)) - valueNoise(cx * 0.3 + 5, cz * 0.3) * 3.2;
      if (depth < 0 || (depth < 1.6 && random() < 0.35)) continue;
      const loose = depth < 2.2;
      const sink = loose ? -0.015 - random() * 0.04 : 0;
      const tiltX = loose ? (random() - 0.5) * 0.06 : 0, tiltZ = loose ? (random() - 0.5) * 0.06 : 0;
      const gap = loose ? 0.04 + random() * 0.05 : 0;
      cells.push({ x0, z0, loose, sink, tiltX, tiltZ, gap, depth });
    }
  }
  return cells;
}

/**
 * The intact paving: one flat quad per paver (its edges sit flush with the terrain). Each
 * paver gets its own tone — stones from different quarry beds, some stained — and soil
 * creeps onto the pavers toward the ragged edge.
 */
export function buildPlaza(textureSize = 4, cell = 1): BufferGeometry {
  const random = seededRandom(77);
  const positions: number[] = [], uvs: number[] = [], colors: number[] = [], indices: number[] = [];
  const stone = new Color(), soil = new Color("#a08668");
  for (const { x0, z0, depth } of paverCells(cell).filter((paver) => !paver.loose)) {
    const base = positions.length / 3;
    const stained = random() < 0.12;
    stone.setScalar(0.84 + random() * 0.2).multiply(new Color(1, 0.985 - random() * 0.03, 0.95 - random() * 0.05));
    if (stained) stone.multiplyScalar(0.82);
    const creep = Math.max(0, 1 - (depth - 2.2) / 3.5) * 0.45;
    for (const [dx, dz] of [[0, 0], [cell, 0], [cell, cell], [0, cell]] as const) {
      const x = x0 + dx, z = z0 + dz;
      positions.push(x, PLAZA_Y, z);
      uvs.push(x / textureSize, -z / textureSize);
      const tone = stone.clone().multiplyScalar(0.9 + 0.12 * valueNoise(x * 0.15 + 2, z * 0.15)).lerp(soil, creep * (0.6 + 0.4 * valueNoise(x * 1.3, z * 1.3)));
      colors.push(tone.r, tone.g, tone.b);
    }
    indices.push(base, base + 3, base + 1, base + 1, base + 3, base + 2);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setAttribute("color", new BufferAttribute(new Float32Array(colors), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Loose edge pavers as real slabs: thick, chipped, settled and tilted, weathered like the ruins. */
export function buildPlazaEdge(cell = 1): BufferGeometry {
  const slabs = paverCells(cell).filter((paver) => paver.loose).map(({ x0, z0, sink, tiltX, tiltZ, gap }, index) => {
    const size = cell - gap * 2;
    const matrix = new Matrix4().compose(
      new Vector3(x0 + cell / 2, PLAZA_Y + sink - 0.05, z0 + cell / 2),
      new Quaternion().setFromEuler(new Euler(tiltZ, (index % 7 - 3) * 0.01, -tiltX)),
      new Vector3(1, 1, 1));
    return stoneBlock(size, 0.14, size, matrix, 900 + index, { chip: 0.07, bumps: 0.008, tint: 0.95 + (index % 5) * 0.025 });
  });
  const merged = mergeGeometries(slabs);
  slabs.forEach((slab) => slab.dispose());
  return paintWeathering(merged, { splash: 0.3 });
}
