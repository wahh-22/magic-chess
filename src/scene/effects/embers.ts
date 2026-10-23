import type { ParticleKindConfig, Range, VfxConfig } from "../../config/vfx";

export const EMBER_KIND = { spark: 0, ember: 1, drifter: 2 } as const;
type EmberKind = (typeof EMBER_KIND)[keyof typeof EMBER_KIND];

/**
 * Fixed-capacity struct-of-arrays particle pool. Spawning, integration and buffer
 * writes reuse these arrays, so a capture never allocates per frame.
 */
export interface EmberPool {
  capacity: number;
  count: number;
  position: Float32Array;
  velocity: Float32Array;
  /** Seconds since spawn. */
  age: Float32Array;
  /** Lifetime in seconds. */
  life: Float32Array;
  /** Starting temperature on the colour ramp (1 = white-hot). */
  heat: Float32Array;
  size: Float32Array;
  kind: Uint8Array;
  /** Owning burst, so undo/new game can remove exactly its particles. */
  tag: Int32Array;
}

export interface SpawnRequest {
  origin: [number, number, number];
  /** Unit [x, z] direction of the attack; the spray leans along it. */
  direction: [number, number];
  seed: number;
  tag: number;
  sparks: number;
  embers: number;
  drifters: number;
}

/** Arrays a renderer uploads as instance attributes. */
export interface EmberInstances {
  offset: Float32Array;
  /** Streak vector (velocity × streak seconds); zero for round embers. */
  tail: Float32Array;
  color: Float32Array;
  size: Float32Array;
}

export function createEmberPool(capacity: number): EmberPool {
  return {
    capacity, count: 0,
    position: new Float32Array(capacity * 3), velocity: new Float32Array(capacity * 3),
    age: new Float32Array(capacity), life: new Float32Array(capacity), heat: new Float32Array(capacity),
    size: new Float32Array(capacity), kind: new Uint8Array(capacity), tag: new Int32Array(capacity),
  };
}

/** FNV-1a of the captured piece and its square: the same capture always sprays the same way. */
export function emberSeed(pieceId: string, square: string): number {
  let hash = 0x811c9dc5;
  for (const char of `${pieceId}@${square}`) hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193);
  return hash >>> 0;
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const between = (random: () => number, [min, max]: Range) => min + (max - min) * random();

function kindConfig(config: VfxConfig, kind: number): ParticleKindConfig {
  return kind === EMBER_KIND.spark ? config.spark : kind === EMBER_KIND.ember ? config.ember : config.drifter;
}

/** Adds one burst; particles beyond the pool capacity are dropped, never allocated. */
export function spawnEmbers(pool: EmberPool, request: SpawnRequest, config: VfxConfig): number {
  const random = seededRandom(request.seed);
  const [ox, oy, oz] = request.origin;
  const [dx, dz] = request.direction;
  const { upward, forward, radius } = config.spread;
  const start = pool.count;
  const groups: [EmberKind, number][] = [
    [EMBER_KIND.spark, request.sparks], [EMBER_KIND.ember, request.embers], [EMBER_KIND.drifter, request.drifters],
  ];
  for (const [kind, total] of groups) {
    const settings = kindConfig(config, kind);
    for (let n = 0; n < total && pool.count < pool.capacity; n++) {
      const i = pool.count++;
      // Uniform direction on the sphere, biased up and along the attack.
      const cosTheta = 2 * random() - 1, phi = random() * Math.PI * 2, sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
      const lift = kind === EMBER_KIND.drifter ? upward * 2 : upward;
      let vx = sinTheta * Math.cos(phi) + dx * forward, vy = Math.abs(cosTheta) * 0.5 + lift, vz = sinTheta * Math.sin(phi) + dz * forward;
      const length = Math.hypot(vx, vy, vz) || 1;
      const speed = between(random, settings.speed) / length;
      vx *= speed; vy *= speed; vz *= speed;
      // Uniform point inside the spawn sphere.
      const r = radius * Math.cbrt(random()), a = random() * Math.PI * 2, c = 2 * random() - 1, s = Math.sqrt(1 - c * c);
      pool.position[i * 3] = ox + r * s * Math.cos(a);
      pool.position[i * 3 + 1] = oy + r * c;
      pool.position[i * 3 + 2] = oz + r * s * Math.sin(a);
      pool.velocity[i * 3] = vx; pool.velocity[i * 3 + 1] = vy; pool.velocity[i * 3 + 2] = vz;
      pool.age[i] = 0;
      pool.life[i] = between(random, settings.lifeMs) / 1000;
      pool.heat[i] = between(random, settings.heat);
      pool.size[i] = between(random, settings.size);
      pool.kind[i] = kind;
      pool.tag[i] = request.tag;
    }
  }
  return pool.count - start;
}

/** Swap-remove: the last live particle fills the hole, so live particles stay packed. */
function remove(pool: EmberPool, i: number) {
  const last = --pool.count;
  if (i === last) return;
  pool.position.copyWithin(i * 3, last * 3, last * 3 + 3);
  pool.velocity.copyWithin(i * 3, last * 3, last * 3 + 3);
  pool.age[i] = pool.age[last]!; pool.life[i] = pool.life[last]!; pool.heat[i] = pool.heat[last]!;
  pool.size[i] = pool.size[last]!; pool.kind[i] = pool.kind[last]!; pool.tag[i] = pool.tag[last]!;
}

export function killTag(pool: EmberPool, tag: number) {
  for (let i = pool.count - 1; i >= 0; i--) if (pool.tag[i] === tag) remove(pool, i);
}

/**
 * Semi-implicit Euler with exact exponential drag toward the wind's velocity:
 * sparks fly ballistically, drifters lift and ride a gentle gusting breeze.
 */
export function stepEmbers(pool: EmberPool, dtSeconds: number, timeSeconds: number, config: VfxConfig) {
  const gust = 0.75 + 0.25 * Math.sin(timeSeconds * Math.PI * 2 * config.wind.gustHz);
  const windX = config.wind.x * gust, windZ = config.wind.z * gust;
  for (let i = pool.count - 1; i >= 0; i--) {
    pool.age[i] = pool.age[i]! + dtSeconds;
    if (pool.age[i]! >= pool.life[i]!) { remove(pool, i); continue; }
    const settings = kindConfig(config, pool.kind[i]!);
    const decay = Math.exp(-settings.drag * dtSeconds);
    const p = i * 3;
    let vx = pool.velocity[p]!, vy = pool.velocity[p + 1]!, vz = pool.velocity[p + 2]!;
    vy += config.gravity * ((settings.buoyancy ?? 0) - 1) * dtSeconds;
    vx = windX + (vx - windX) * decay;
    vy *= decay;
    vz = windZ + (vz - windZ) * decay;
    let y = pool.position[p + 1]! + vy * dtSeconds;
    const onPlatform = Math.abs(pool.position[p]!) < config.floorHalf && Math.abs(pool.position[p + 2]!) < config.floorHalf;
    if (y < config.floorY && onPlatform) {
      // Embers skitter and settle on the stone, glowing until they cool.
      y = config.floorY;
      if (vy < 0) vy = -vy * config.floorBounce;
      vx *= config.floorFriction; vz *= config.floorFriction;
    }
    pool.position[p] = pool.position[p]! + vx * dtSeconds;
    pool.position[p + 1] = y;
    pool.position[p + 2] = pool.position[p + 2]! + vz * dtSeconds;
    pool.velocity[p] = vx; pool.velocity[p + 1] = vy; pool.velocity[p + 2] = vz;
  }
}

/** Current temperature: starts at the spawn heat and cools to black at the end of life. */
export function emberHeat(pool: EmberPool, i: number): number {
  const remaining = 1 - pool.age[i]! / pool.life[i]!;
  return pool.heat[i]! * remaining ** 1.3;
}

// Linear HDR stops: white-yellow core, orange, deep red, black. Values above the bloom
// threshold make the hot particles glow; cooling reduces both brightness and hue.
const RAMP: readonly (readonly [number, number, number, number])[] = [
  [0, 0, 0, 0],
  [0.25, 0.9, 0.1, 0.01],
  [0.5, 2.6, 0.6, 0.07],
  [0.75, 4.5, 1.9, 0.35],
  [1, 6.5, 4.8, 2],
];

export function emberColor(heat: number, out: Float32Array, offset: number) {
  const h = Math.min(1, Math.max(0, heat));
  let k = 1;
  while (k < RAMP.length - 1 && RAMP[k]![0] < h) k++;
  const [h0, r0, g0, b0] = RAMP[k - 1]!, [h1, r1, g1, b1] = RAMP[k]!;
  const t = (h - h0) / (h1 - h0);
  out[offset] = r0 + (r1 - r0) * t;
  out[offset + 1] = g0 + (g1 - g0) * t;
  out[offset + 2] = b0 + (b1 - b0) * t;
}

/** Fills renderer instance arrays for the live particles; returns the instance count. */
export function writeEmberInstances(pool: EmberPool, out: EmberInstances, config: VfxConfig): number {
  for (let i = 0; i < pool.count; i++) {
    const p = i * 3, streak = kindConfig(config, pool.kind[i]!).streakSeconds;
    out.offset[p] = pool.position[p]!; out.offset[p + 1] = pool.position[p + 1]!; out.offset[p + 2] = pool.position[p + 2]!;
    out.tail[p] = pool.velocity[p]! * streak; out.tail[p + 1] = pool.velocity[p + 1]! * streak; out.tail[p + 2] = pool.velocity[p + 2]! * streak;
    emberColor(emberHeat(pool, i), out.color, p);
    out.size[i] = pool.size[i]!;
  }
  return pool.count;
}
