import { CAMERA_BOUNDS, PLAZA_HALF, RUINS_INNER_RADIUS } from "./battlefieldConfig";
import { valueNoise } from "./landscape";
import { ruinFootprints, seededRandom } from "./ruins";

/** Scanned CC0 models shipped in public/environment/models (see scripts/environment/catalog.mjs). */
export const SCANNED_MODELS = {
  oliveTall: { id: "island_tree_01", variants: 1, lods: 3 },
  oliveGnarled: { id: "island_tree_02", variants: 1, lods: 3 },
  maquis: { id: "searsia_lucida", variants: 4, lods: 1 },
  dryBush: { id: "wild_rooibos_bush", variants: 4, lods: 1 },
  grassGreen: { id: "grass_medium_01", variants: 4, lods: 1 },
  grassDry: { id: "grass_medium_02", variants: 4, lods: 1 },
  boulderPile: { id: "namaqualand_boulder_02", variants: 1, lods: 2 },
  boulder: { id: "namaqualand_boulder_04", variants: 1, lods: 2 },
  slab: { id: "namaqualand_boulder_05", variants: 1, lods: 2 },
  rock: { id: "rock_07", variants: 1, lods: 2 },
  stone: { id: "stone_01", variants: 1, lods: 2 },
  pebbles: { id: "namaqualand_stones_01", variants: 5, lods: 1 },
} as const;
export type ScannedModel = keyof typeof SCANNED_MODELS;

/**
 * One instance: `size` is the target height in board units (the runtime scales the
 * variant to it), `sink` the fraction of that height buried in the ground, `tilt` a lean
 * in radians about x and z (rocks settle, trees lean).
 */
export interface Placement {
  model: ScannedModel; variant: number; lod: number;
  x: number; z: number; yaw: number; size: number; sink: number; tilt: [number, number];
}

/**
 * LOD rings around the board centre (the camera never leaves the plaza), scaled by the
 * quality's LOD bias: detailed inside the first radius, then the middle level, then the far one.
 */
export const LOD_RADII = [32, 62] as const;
/** Anything taller than ankle height stays outside this radius (the camera cylinder plus a margin). */
export const TALL_MIN_RADIUS = CAMERA_BOUNDS.radius + 1.5;
/** Ground cover never stands on the intact paving. */
const PAVING_CLEAR = PLAZA_HALF - 1.2;

const TEMPLE = { minX: -15.6, maxX: 15.6, minZ: -23.8, maxZ: -18.2 };
const insideTemple = (x: number, z: number) => x > TEMPLE.minX && x < TEMPLE.maxX && z > TEMPLE.minZ && z < TEMPLE.maxZ;

/** True where a paver remains (same erosion as buildPlaza), so nothing grows through stone. */
export function onPaving(x: number, z: number) {
  const square = Math.max(Math.abs(x), Math.abs(z));
  return PLAZA_HALF - square - valueNoise(x * 0.3 + 5, z * 0.3) * 3.2 > -0.3 && square < PAVING_CLEAR + 1;
}

function blocked(x: number, z: number, footprints: [number, number, number][], margin: number) {
  if (insideTemple(x, z)) return true;
  return footprints.some(([fx, fz, radius]) => Math.hypot(x - fx, z - fz) < radius + margin);
}

function pick<T>(random: () => number, items: readonly T[]): T {
  return items[Math.floor(random() * items.length)]!;
}

/**
 * Proximity to the ruins in [0, 1] (1 at a footprint, fading over `reach`), from the
 * distance to the nearest footprint edge sampled once on a 1-unit grid.
 */
function proximity(footprints: [number, number, number][], extent = 80) {
  const size = extent * 2 + 1;
  const distance = new Float32Array(size * size);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let best = Infinity;
      for (const [fx, fz, radius] of footprints) best = Math.min(best, Math.hypot(i - extent - fx, j - extent - fz) - radius);
      distance[j * size + i] = Math.max(0, best);
    }
  }
  return (x: number, z: number, reach: number) => {
    const i = Math.round(x) + extent, j = Math.round(z) + extent;
    if (i < 0 || j < 0 || i >= size || j >= size) return 0;
    return Math.max(0, 1 - distance[j * size + i]! / reach);
  };
}

/**
 * The whole deterministic layout: groves of olive trees around the ruins with a far tree
 * line on the hills, maquis and dry bushes at the ruin bases, embedded boulders, rocks and
 * pebbles along the ragged plaza edge, and grass clumped by noise — dense at the plaza edge
 * and among the ruins, sparse toward the horizon.
 */
export function scatterLayout(options: { grassCount: number; pebbleCount: number; lodBias: number; propDensity: number }): Placement[] {
  const random = seededRandom(41);
  const ruins = ruinFootprints();
  const placements: Placement[] = [];
  const near = proximity(ruins);
  const lodAt = (x: number, z: number, lods: number) => {
    const distance = Math.hypot(x, z);
    let lod = 0;
    while (lod < lods - 1 && distance > (LOD_RADII[lod] ?? Infinity) * options.lodBias) lod++;
    return lod;
  };
  const add = (model: ScannedModel, x: number, z: number, size: number, sink: number, lean = 0) => {
    const spec = SCANNED_MODELS[model];
    placements.push({
      model, variant: Math.floor(random() * spec.variants), lod: lodAt(x, z, spec.lods),
      x, z, yaw: random() * Math.PI * 2, size, sink, tilt: [(random() - 0.5) * lean, (random() - 0.5) * lean],
    });
  };
  const solid: [number, number, number][] = [...ruins];

  // Olive groves just beyond the ruins, then a far tree line over the hills.
  const groves: [number, number, number][] = [[-25, -25, 6], [22, -28, 6], [29, 5, 4], [-29, 10, 5], [-12, 32, 4], [25, 25, 5],
    [-41, -7, 4], [9, -43, 4], [-8, -36, 4], [16, -38, 3], [38, -12, 4], [-20, 38, 3], [41, 16, 3], [3, 40, 4], [-36, 24, 3], [33, -30, 3]];
  for (const [cx, cz, count] of groves) {
    for (let i = 0; i < count; i++) {
      const x = cx + (random() - 0.5) * 9, z = cz + (random() - 0.5) * 9;
      if (Math.hypot(x, z) < RUINS_INNER_RADIUS + 4 || blocked(x, z, solid, 1.5)) continue;
      add(random() < 0.5 ? "oliveTall" : "oliveGnarled", x, z, 5.2 + random() * 3.6, 0.02, 0.12);
      solid.push([x, z, 1.2]);
    }
  }
  for (let i = 0; i < 220; i++) {
    const angle = random() * Math.PI * 2, radius = 48 + random() ** 0.8 * 85;
    const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
    const keep = random() < options.propDensity;
    if (valueNoise(x * 0.04 + 2, z * 0.04) < 0.42 || !keep) continue;
    add(random() < 0.5 ? "oliveTall" : "oliveGnarled", x, z, 5.5 + random() * 5, 0.02, 0.1);
  }

  // Boulders half-buried among the ruins and on the slopes.
  for (let i = 0; i < 70; i++) {
    const close = i < 40;
    const angle = random() * Math.PI * 2;
    const radius = close ? TALL_MIN_RADIUS + 0.5 + random() ** 1.5 * 16 : 40 + random() * 80;
    const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
    if (blocked(x, z, solid, 0.8)) continue;
    if (close && near(x, z, 6) < 0.15 && random() < 0.6) continue;
    const model = pick(random, ["boulderPile", "boulder", "slab", "boulder"] as const);
    add(model, x, z, (close ? 0.55 : 0.9) + random() * (close ? 1.1 : 2.2), 0.18 + random() * 0.12, 0.35);
    solid.push([x, z, 0.8]);
  }

  // Maquis and dry bushes cluster at ruin bases and grove edges.
  for (let i = 0, made = 0; made < 240 * options.propDensity && i < 4000; i++) {
    const angle = random() * Math.PI * 2, radius = TALL_MIN_RADIUS + 0.5 + random() ** 1.3 * 40;
    const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
    if (blocked(x, z, solid, 0.3)) continue;
    const affinity = (near(x, z, 5) * 0.7 + valueNoise(x * 0.15 + 7, z * 0.15) * 0.6) * options.propDensity;
    if (random() > affinity) continue;
    if (random() < 0.45) add("maquis", x, z, 0.8 + random() * 0.9, 0.04, 0.1);
    else add("dryBush", x, z, 0.35 + random() * 0.3, 0.05, 0.15);
    made++;
  }
  // Low dry bushes may come closer: they stay below the camera's lowest eye height.
  for (let i = 0, made = 0; made < 30 && i < 600; i++) {
    const angle = random() * Math.PI * 2, radius = PLAZA_HALF + random() * 3;
    const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
    if (onPaving(x, z) || blocked(x, z, solid, 0.3)) continue;
    add("dryBush", x, z, 0.3 + random() * 0.2, 0.05, 0.15);
    made++;
  }

  // Rocks and stones at the plaza edge and the ruin bases, partly embedded.
  for (let i = 0, made = 0; made < 120 && i < 3000; i++) {
    const angle = random() * Math.PI * 2, radius = PLAZA_HALF - 3 + random() ** 1.4 * 16;
    const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
    if (onPaving(x, z) || blocked(x, z, solid, 0.1)) continue;
    const big = Math.hypot(x, z) > TALL_MIN_RADIUS && random() < 0.35;
    add(random() < 0.55 ? "rock" : "stone", x, z, big ? 0.35 + random() * 0.4 : 0.12 + random() * 0.2, 0.25 + random() * 0.15, 0.5);
    made++;
  }
  for (let i = 0, made = 0; made < options.pebbleCount && i < options.pebbleCount * 30; i++) {
    const angle = random() * Math.PI * 2;
    const square = PLAZA_HALF - 3 + random() ** 1.2 * 9;
    const x = Math.cos(angle) * square * 1.1, z = Math.sin(angle) * square * 1.1;
    if (onPaving(x, z) || blocked(x, z, ruins, 0)) continue;
    add("pebbles", x, z, 0.035 + random() * 0.08, 0.3, 0.6);
    made++;
  }

  // Grass: clumped by noise, densest at the plaza edge and among the ruins.
  for (let i = 0, made = 0; made < options.grassCount && i < options.grassCount * 40; i++) {
    const angle = random() * Math.PI * 2, radius = PLAZA_HALF - 3 + random() ** 1.5 * 52;
    const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
    if (onPaving(x, z) || blocked(x, z, ruins, 0.05)) continue;
    const square = Math.max(Math.abs(x), Math.abs(z));
    const edge = Math.max(0, 1 - Math.abs(square - PLAZA_HALF - 1.5) / 4);
    const density = 0.35 + edge * 0.6 + near(x, z, 4) * 0.5;
    if (valueNoise(x * 0.22 + 3, z * 0.22 - 1) * density < 0.2 || random() > density) continue;
    // Farther tufts are larger clumps, so coverage holds up toward the horizon.
    const far = Math.max(0, Math.hypot(x, z) - 22) / 30;
    add(random() < 0.62 ? "grassDry" : "grassGreen", x, z, (0.22 + random() * 0.32) * (1 + far * 0.8), 0.04, 0.25);
    made++;
  }
  return placements;
}

/** Ground footprints [x, z, radius] of the scattered solids (worn soil, contact shade). */
export function placementFootprints(placements: Placement[]): [number, number, number][] {
  return placements
    .filter((placement) => placement.model !== "grassDry" && placement.model !== "grassGreen" && placement.model !== "pebbles")
    .map((placement) => [placement.x, placement.z, placement.size * (placement.model.startsWith("olive") ? 0.35 : 0.7)]);
}
