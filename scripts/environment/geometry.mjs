// Pure geometry helpers for scanned environment assets. A "geo" is plain typed arrays:
// { positions: Float32Array(3n), normals: Float32Array(3n), uvs: Float32Array(2n), indices: Uint32Array }.
import { MeshoptSimplifier } from 'meshoptimizer';

export const triangleCount = (geo) => geo.indices.length / 3;

/** Deterministic hash in [0, 1) for component sampling. */
export function hash01(value, seed = 0) {
  let h = (Math.imul(value ^ 0x9e3779b9, 0x85ebca6b) + Math.imul(seed + 1, 0xc2b2ae35)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0x27d4eb2f) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Connected component per triangle; vertices are welded by position so UV seams do not split parts. */
export function triangleComponents(geo) {
  const { positions, indices } = geo;
  const count = positions.length / 3;
  const welded = new Int32Array(count);
  const keys = new Map();
  for (let i = 0; i < count; i++) {
    const key = `${Math.round(positions[i * 3] * 1e5)},${Math.round(positions[i * 3 + 1] * 1e5)},${Math.round(positions[i * 3 + 2] * 1e5)}`;
    if (!keys.has(key)) keys.set(key, i);
    welded[i] = keys.get(key);
  }
  const parent = Int32Array.from({ length: count }, (_, i) => i);
  const find = (a) => {
    while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; }
    return a;
  };
  for (let t = 0; t < indices.length; t += 3) {
    const a = find(welded[indices[t]]);
    for (const v of [indices[t + 1], indices[t + 2]]) {
      const b = find(welded[v]);
      if (a !== b) parent[b] = a;
    }
  }
  const ids = new Map();
  const result = new Int32Array(indices.length / 3);
  for (let t = 0; t < result.length; t++) {
    const root = find(welded[indices[t * 3]]);
    if (!ids.has(root)) ids.set(root, ids.size);
    result[t] = ids.get(root);
  }
  return { perTriangle: result, count: ids.size };
}

function groupTriangles(geo) {
  const { perTriangle, count } = triangleComponents(geo);
  const groups = Array.from({ length: count }, () => []);
  perTriangle.forEach((component, triangle) => groups[component].push(triangle));
  return groups;
}

function uniqueVertices(geo, triangles) {
  const set = new Set();
  for (const t of triangles) for (let k = 0; k < 3; k++) set.add(geo.indices[t * 3 + k]);
  return [...set];
}

/** Solve the 3×3 system m·x = b (Cramer's rule); null when singular. */
function solve3(m, b) {
  const det = (a) => a[0] * (a[4] * a[8] - a[5] * a[7]) - a[1] * (a[3] * a[8] - a[5] * a[6]) + a[2] * (a[3] * a[7] - a[4] * a[6]);
  const d = det(m);
  if (Math.abs(d) < 1e-14) return null;
  return [0, 1, 2].map((column) => {
    const copy = m.slice();
    for (let row = 0; row < 3; row++) copy[row * 3 + column] = b[row];
    return det(copy) / d;
  });
}

/**
 * Replaces every connected component (a modelled leaf) by one flat quad that carries the
 * same texture rectangle: position is fitted as an affine function of UV (least squares),
 * so the card sits where the leaf was and shows the same alpha-cut leaf image.
 */
export function leafCards(geo) {
  const positions = [], normals = [], uvs = [], indices = [];
  for (const triangles of groupTriangles(geo)) {
    const vertices = uniqueVertices(geo, triangles);
    let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
    const ata = new Array(9).fill(0), atb = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const normal = [0, 0, 0];
    for (const i of vertices) {
      const u = geo.uvs[i * 2], v = geo.uvs[i * 2 + 1];
      uMin = Math.min(uMin, u); uMax = Math.max(uMax, u); vMin = Math.min(vMin, v); vMax = Math.max(vMax, v);
      const row = [u, v, 1];
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) ata[r * 3 + c] += row[r] * row[c];
        for (let axis = 0; axis < 3; axis++) atb[axis][r] += row[r] * geo.positions[i * 3 + axis];
      }
      for (let axis = 0; axis < 3; axis++) normal[axis] += geo.normals[i * 3 + axis];
    }
    const coefficients = atb.map((b) => solve3(ata, b));
    const length = Math.hypot(...normal) || 1;
    if (coefficients.some((c) => !c) || uMax - uMin < 1e-6 || vMax - vMin < 1e-6) continue;
    const base = positions.length / 3;
    for (const [u, v] of [[uMin, vMin], [uMax, vMin], [uMax, vMax], [uMin, vMax]]) {
      for (const c of coefficients) positions.push(c[0] * u + c[1] * v + c[2]);
      normals.push(normal[0] / length, normal[1] / length, normal[2] / length);
      uvs.push(u, v);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), uvs: new Float32Array(uvs), indices: new Uint32Array(indices) };
}

/**
 * Keeps a deterministic fraction of the connected components and grows each survivor about
 * its own centroid, so a sparser canopy keeps roughly the same silhouette and coverage.
 */
export function thinComponents(geo, keep, grow = 1, seed = 0) {
  if (keep >= 1 && grow === 1) return geo;
  const positions = [], normals = [], uvs = [], indices = [];
  groupTriangles(geo).forEach((triangles, component) => {
    if (hash01(component, seed) >= keep) return;
    const vertices = uniqueVertices(geo, triangles);
    const centre = [0, 0, 0];
    for (const i of vertices) for (let axis = 0; axis < 3; axis++) centre[axis] += geo.positions[i * 3 + axis] / vertices.length;
    const remap = new Map();
    for (const i of vertices) {
      remap.set(i, positions.length / 3);
      for (let axis = 0; axis < 3; axis++) positions.push(centre[axis] + (geo.positions[i * 3 + axis] - centre[axis]) * grow);
      normals.push(geo.normals[i * 3], geo.normals[i * 3 + 1], geo.normals[i * 3 + 2]);
      uvs.push(geo.uvs[i * 2], geo.uvs[i * 2 + 1]);
    }
    for (const t of triangles) for (let k = 0; k < 3; k++) indices.push(remap.get(geo.indices[t * 3 + k]));
  });
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), uvs: new Float32Array(uvs), indices: new Uint32Array(indices) };
}

/** Drop vertices no triangle references (after simplification). */
export function compact(geo) {
  const remap = new Int32Array(geo.positions.length / 3).fill(-1);
  let next = 0;
  for (const i of geo.indices) if (remap[i] < 0) remap[i] = next++;
  const positions = new Float32Array(next * 3), normals = new Float32Array(next * 3), uvs = new Float32Array(next * 2);
  remap.forEach((to, from) => {
    if (to < 0) return;
    positions.set(geo.positions.subarray(from * 3, from * 3 + 3), to * 3);
    normals.set(geo.normals.subarray(from * 3, from * 3 + 3), to * 3);
    uvs.set(geo.uvs.subarray(from * 2, from * 2 + 2), to * 2);
  });
  return { positions, normals, uvs, indices: Uint32Array.from(geo.indices, (i) => remap[i]) };
}

/**
 * Meshopt simplification toward a triangle budget. Normals and UVs are weighted so shading
 * and texture seams survive; `prune` also removes small disconnected bits (thin twigs).
 */
export async function simplifySolid(geo, maxTriangles, { error = 0.05, prune = false } = {}) {
  if (triangleCount(geo) <= maxTriangles) return geo;
  await MeshoptSimplifier.ready;
  const count = geo.positions.length / 3;
  const attributes = new Float32Array(count * 5);
  for (let i = 0; i < count; i++) attributes.set([geo.normals[i * 3], geo.normals[i * 3 + 1], geo.normals[i * 3 + 2], geo.uvs[i * 2], geo.uvs[i * 2 + 1]], i * 5);
  const [indices] = MeshoptSimplifier.simplifyWithAttributes(geo.indices, geo.positions, 3, attributes, 5,
    [0.5, 0.5, 0.5, 1, 1], null, maxTriangles * 3, error, prune ? ['Prune'] : []);
  return compact({ ...geo, indices });
}

export function bounds(geo) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < geo.positions.length; i += 3) {
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], geo.positions[i + axis]);
      max[axis] = Math.max(max[axis], geo.positions[i + axis]);
    }
  }
  return { min, max };
}

export function translate(geo, [dx, dy, dz]) {
  const positions = geo.positions.slice();
  for (let i = 0; i < positions.length; i += 3) { positions[i] += dx; positions[i + 1] += dy; positions[i + 2] += dz; }
  return { ...geo, positions };
}

/**
 * Offset that puts a variant on the origin: lowest point at y = 0 and, horizontally, either
 * the bounding-box centre or (for trees) the centre of the trunk's footprint.
 */
export function groundOffset(geos, { trunk = false } = {}) {
  const all = geos.map(bounds);
  const minY = Math.min(...all.map((b) => b.min[1]));
  const maxY = Math.max(...all.map((b) => b.max[1]));
  let cx = 0, cz = 0;
  if (trunk) {
    let n = 0;
    const limit = minY + (maxY - minY) * 0.04;
    for (const geo of geos) {
      for (let i = 0; i < geo.positions.length; i += 3) {
        if (geo.positions[i + 1] > limit) continue;
        cx += geo.positions[i]; cz += geo.positions[i + 2]; n++;
      }
    }
    cx /= n || 1; cz /= n || 1;
  } else {
    cx = (Math.min(...all.map((b) => b.min[0])) + Math.max(...all.map((b) => b.max[0]))) / 2;
    cz = (Math.min(...all.map((b) => b.min[2])) + Math.max(...all.map((b) => b.max[2]))) / 2;
  }
  return [-cx, -minY, -cz];
}
