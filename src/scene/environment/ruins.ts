import { BoxGeometry, Euler, Matrix4, Quaternion, Vector3, type BufferGeometry } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { PLAZA_Y } from "./battlefieldConfig";
import { columnDrum, paintWeathering, revolve, stoneBlock } from "./weathering";

/** World size covered by one repeat of the stone texture. */
const TEXTURE_SIZE = 3;
const COLUMN_RADIUS = 0.62;
/** Shaft height of a complete column. */
const SHAFT = 7.2;
/** Open joint between neighbouring blocks (lost mortar). */
const GAP = 0.03;

/** Deterministic PRNG so the ruins are identical on every load and in tests. */
export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Planar UVs in local units, picked per face by its dominant normal axis. */
function boxUV(geometry: BufferGeometry) {
  const position = geometry.attributes.position!, normal = geometry.attributes.normal!, uv = geometry.attributes.uv!;
  for (let i = 0; i < position.count; i++) {
    const nx = Math.abs(normal.getX(i)), ny = Math.abs(normal.getY(i)), nz = Math.abs(normal.getZ(i));
    const [u, v] = ny >= nx && ny >= nz ? [position.getX(i), position.getZ(i)]
      : nx >= nz ? [position.getZ(i), position.getY(i)] : [position.getX(i), position.getY(i)];
    uv.setXY(i, u / TEXTURE_SIZE, v / TEXTURE_SIZE);
  }
  return geometry;
}

/** Box with world-scaled planar UVs (no stretching on long blocks), transformed by `matrix`. */
export function block(width: number, height: number, depth: number, matrix: Matrix4) {
  return boxUV(new BoxGeometry(width, height, depth)).applyMatrix4(matrix);
}

export function at(x: number, y: number, z: number, yaw = 0, pitch = 0, roll = 0) {
  return new Matrix4().compose(new Vector3(x, y, z), new Quaternion().setFromEuler(new Euler(pitch, yaw, roll)), new Vector3(1, 1, 1));
}

export interface ColumnSpec { x: number; z: number; height: number; broken?: boolean; capital?: boolean }

class Builder {
  readonly parts: BufferGeometry[] = [];
  private seed = 0;
  constructor(readonly random: () => number) {}
  /** Warm/cool, light/dark: stones from different beds of the quarry. */
  tint() { return 0.86 + this.random() * 0.2; }
  stone(width: number, height: number, depth: number, matrix: Matrix4, chip = 0.08) {
    this.parts.push(stoneBlock(width, height, depth, matrix, ++this.seed, { chip, tint: this.tint() }));
  }
  /** A run of blocks along local x, separated by open joints, slightly settled and shifted. */
  course(length: number, height: number, depth: number, x: number, y: number, z: number, yaw: number, blockLength = 1.4, chip = 0.08) {
    const count = Math.max(1, Math.round(length / blockLength));
    const size = length / count;
    for (let index = 0; index < count; index++) {
      const along = -length / 2 + size * (index + 0.5);
      const sink = -this.random() * 0.012;
      const local = new Vector3(along, 0, 0).applyAxisAngle(new Vector3(0, 1, 0), yaw);
      this.stone(size - GAP, height - GAP * 0.5, depth - GAP, at(x + local.x, y + sink, z + local.z, yaw + (this.random() - 0.5) * 0.012), chip);
    }
  }
  drum(radiusAt: (y: number) => number, y0: number, y1: number, matrix: Matrix4, broken = false) {
    this.parts.push(columnDrum({ radiusAt, y0, y1, broken, seed: ++this.seed, tint: this.tint() }, matrix));
  }
  capital(neck: number, matrix: Matrix4) {
    // Doric echinus: a cushion flaring from the neck to the abacus, then the square abacus.
    const profile: [number, number][] = [[neck * 0.98, 0], [neck * 1.02, 0.05], [neck * 1.18, 0.14], [neck * 1.36, 0.25], [neck * 1.44, 0.33], [neck * 1.45, 0.36]];
    this.parts.push(revolve(profile, matrix, ++this.seed, this.tint()));
    this.stone(neck * 3, 0.24, neck * 3, matrix.clone().multiply(at(0, 0.48, 0)), 0.1);
  }
}

/** Shaft radius with entasis: a slight swelling at a third of the height over a linear taper. */
function entasis(y: number) {
  const t = y / SHAFT;
  return COLUMN_RADIUS * (1 - 0.19 * t + 0.022 * Math.sin(Math.PI * Math.min(1, t * 1.15)));
}

/** A Doric column of stacked drums standing on `baseY`; `height` is the shaft height. */
function column(builder: Builder, spec: ColumnSpec, baseY: number) {
  const random = builder.random;
  const drums = Math.max(1, Math.round(spec.height / 1.3));
  const drumHeight = spec.height / drums;
  for (let index = 0; index < drums; index++) {
    const y0 = index * drumHeight;
    const last = index === drums - 1;
    // Settled joints: each drum is slightly offset and turned.
    const wobble = index ? (random() - 0.5) * 0.035 : 0;
    builder.drum(entasis, y0, y0 + drumHeight - 0.012,
      at(spec.x + wobble, baseY, spec.z - wobble * 0.6, random() * Math.PI, (random() - 0.5) * 0.004, (random() - 0.5) * 0.004),
      last && spec.broken);
  }
  if (spec.capital && !spec.broken) builder.capital(entasis(spec.height), at(spec.x, baseY + spec.height, spec.z, random() * 0.05));
}

/** Stepped platform (stylobate) of individual blocks; top surface at `PLAZA_Y + steps * rise`. */
function stylobate(builder: Builder, x: number, z: number, length: number, depth: number, steps = 3, rise = 0.28) {
  for (let step = 0; step < steps; step++) {
    const inset = step * 0.45;
    const rowDepth = depth - inset * 2;
    const rows = 2;
    for (let row = 0; row < rows; row++) {
      const rowZ = z - rowDepth / 2 + rowDepth / rows * (row + 0.5);
      builder.course(length - inset * 2, rise, rowDepth / rows, x + (row % 2) * 0.35, PLAZA_Y + rise * (step + 0.5), rowZ, 0, 1.5, 0.07);
    }
  }
  return PLAZA_Y + steps * rise;
}

/** Entablature over a run of intact columns: architrave, triglyph frieze and cornice blocks. */
function entablature(builder: Builder, fromX: number, toX: number, z: number, topY: number) {
  const random = builder.random;
  const length = toX - fromX + 1.5;
  const centre = (fromX + toX) / 2;
  // Architrave beams span from column axis to column axis.
  builder.course(length, 0.75, 1.25, centre, topY + 0.375, z, 0, 3, 0.1);
  // Frieze: recessed metopes behind protruding triglyphs.
  builder.course(length - 0.1, 0.7, 1.05, centre, topY + 1.1, z, 0, 1.5, 0.06);
  for (let x = fromX - 0.6; x <= toX + 0.6; x += 0.75) builder.stone(0.32, 0.66, 1.2, at(x, topY + 1.1, z), 0.05);
  builder.course(length + 0.4, 0.26, 1.55, centre, topY + 1.58, z, 0, 1.6, 0.1);
  // A broken cornice end lies at the foot of the run.
  builder.stone(1.6, 0.7, 1.1, at(toX + 2.2, PLAZA_Y + 0.31, z + 1.8, random() * 0.6, 0, 0.12), 0.14);
}

function wall(builder: Builder, from: [number, number], to: [number, number], courses: number[]) {
  const random = builder.random;
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const yaw = -Math.atan2(to[1] - from[1], to[0] - from[0]);
  const blocks = Math.round(length / 1.2);
  for (let index = 0; index < blocks; index++) {
    const t = (index + 0.5) / blocks;
    const x = from[0] + (to[0] - from[0]) * t, z = from[1] + (to[1] - from[1]) * t;
    const height = courses[index % courses.length]!;
    for (let course = 0; course < height; course++) {
      if (course === height - 1 && random() < 0.3) continue;
      const shift = (course % 2) * 0.3 + (random() - 0.5) * 0.08;
      const top = course === height - 1;
      builder.stone(1.16 - GAP, 0.55 - GAP * 0.5, 0.9 + random() * 0.1,
        at(x + Math.cos(yaw) * shift, PLAZA_Y + 0.275 + course * 0.56, z - Math.sin(yaw) * shift, yaw + (random() - 0.5) * (top ? 0.12 : 0.05)),
        top ? 0.16 : 0.09);
    }
  }
}

/** Column positions of the main temple colonnade behind Black (the sun sets behind it). */
export const COLONNADE: ColumnSpec[] = [
  { x: -12, z: -21, height: SHAFT, capital: true },
  { x: -9, z: -21, height: SHAFT, capital: true },
  { x: -6, z: -21, height: SHAFT, capital: true },
  { x: -3, z: -21, height: SHAFT, capital: true },
  { x: 0, z: -21, height: 3.4, broken: true },
  { x: 3, z: -21, height: 1.1, broken: true },
  { x: 6, z: -21, height: SHAFT, capital: true },
  { x: 9, z: -21, height: SHAFT, capital: true },
  { x: 12, z: -21, height: 4.6, broken: true },
];

export const STANDING: ColumnSpec[] = [
  { x: -19.5, z: -9, height: 5.1, broken: true },
  { x: -19.5, z: -4, height: SHAFT, capital: true },
  { x: -19.5, z: 1, height: 2.2, broken: true },
  { x: -19.5, z: 6, height: 6.1, broken: true },
  { x: 19.5, z: -13, height: SHAFT, capital: true },
  { x: 19.5, z: 10, height: 3.9, broken: true },
  { x: -9, z: 19.5, height: 6.6, broken: true },
  { x: 11, z: 20, height: SHAFT, capital: true },
  { x: 14.5, z: 18.5, height: 1.6, broken: true },
];

/** Fallen drums [x, z, yaw, length]. */
export const FALLEN: [number, number, number, number][] = [
  [-15, -15, 0.7, 2.6], [17.5, -4, 1.9, 1.3], [-17.2, 10, 0.2, 2.6], [6.5, -17.5, 2.6, 1.3],
  [13.5, 15, 1.2, 1.3], [-3.5, 18.5, 0.4, 2.6], [17.6, 3.5, 0.9, 1.3],
];

/** Wall runs [from, to, course heights per block]. */
export const WALLS: [[number, number], [number, number], number[]][] = [
  [[21.5, -9], [21.5, 8], [2, 3, 1, 2, 3, 3, 1, 0, 2, 1, 3, 2, 1, 2]],
  [[-4, 21.5], [9, 21.5], [1, 2, 2, 1, 0, 1, 2, 1, 1, 2, 1]],
  [[-22, -16], [-22, -11], [2, 1, 1, 2]],
];

/** Footprints [x, z, radius] of every ruin element, for contact shade and scatter clearance. */
export function ruinFootprints(): [number, number, number][] {
  const footprints: [number, number, number][] = [];
  for (const spec of [...COLONNADE, ...STANDING]) footprints.push([spec.x, spec.z, COLUMN_RADIUS * 1.6]);
  for (const [x, z, , length] of FALLEN) footprints.push([x, z, length * 0.6]);
  for (const [from, to] of WALLS) {
    const steps = Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / 1.6);
    for (let i = 0; i <= steps; i++) footprints.push([from[0] + (to[0] - from[0]) * i / steps, from[1] + (to[1] - from[1]) * i / steps, 0.9]);
  }
  return footprints;
}

/** Every ruin in one weathered, vertex-painted geometry (one draw call). Tall stones stay outside the camera bounds. */
export function buildRuins(seed = 7): BufferGeometry {
  const builder = new Builder(seededRandom(seed));
  const random = builder.random;
  const templeTop = stylobate(builder, 0, -21, 30, 4.4);
  for (const spec of COLONNADE) column(builder, spec, templeTop);
  const capitalTop = templeTop + SHAFT + 0.6;
  entablature(builder, -12, -3, -21, capitalTop);
  builder.stone(4, 0.75, 1.25, at(7.5, capitalTop + 0.375, -21), 0.12);
  for (const spec of STANDING) column(builder, spec, PLAZA_Y);
  builder.stone(4.2, 0.75, 1.2, at(-19.5, PLAZA_Y + 0.37, -6.6, Math.PI / 2 + 0.25, 0, 0.05), 0.14);
  for (const [x, z, yaw, length] of FALLEN) {
    // Lying drums: the shaft axis turned horizontal, resting on the ground.
    const matrix = at(x, PLAZA_Y + COLUMN_RADIUS * 0.82, z, yaw, 0, Math.PI / 2).multiply(at(0, -length / 2, 0));
    builder.drum((y) => COLUMN_RADIUS * (0.93 - 0.03 * y / length), 0, length, matrix, random() < 0.5);
  }
  for (const [from, to, courses] of WALLS) wall(builder, from, to, courses);
  // Rubble: low, so it can sit closer to the plaza than anything the camera could hit.
  for (let index = 0; index < 26; index++) {
    const angle = random() * Math.PI * 2, radius = 13.5 + random() * 8;
    const size = 0.25 + random() * 0.45;
    builder.stone(size * 1.4, size * 0.7, size, at(Math.cos(angle) * radius, PLAZA_Y + size * 0.2, Math.sin(angle) * radius, random() * 3, (random() - 0.5) * 0.4, (random() - 0.5) * 0.4), size * 0.3);
  }
  const merged = mergeGeometries(builder.parts);
  builder.parts.forEach((part) => part.dispose());
  return paintWeathering(merged);
}
