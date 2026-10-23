import { describe, expect, it } from 'vitest';
import { Document } from '@gltf-transform/core';
import { simplifyRigidParts } from './simplify-parts.mjs';

/** Wavy grid over x in [x0, x1]; every vertex gets its skin from `skin(x, z)`. */
function grid(document, segments, skin, [x0, x1] = [0, 1], buffer = document.createBuffer()) {
  const positions = [], normals = [], uvs = [], joints = [], weights = [], indices = [];
  for (let i = 0; i <= segments; i++) for (let j = 0; j <= segments; j++) {
    const x = x0 + (x1 - x0) * i / segments, z = j / segments;
    // Straight along x = 0.5, where a free simplifier would happily collapse a seam.
    positions.push(x, 0.04 * Math.sin((x - 0.5) * 9) * Math.cos(z * 7), z);
    normals.push(0, 1, 0); uvs.push(x, z);
    const [joint, weight] = skin(x, z);
    joints.push(...joint); weights.push(...weight);
  }
  for (let i = 0; i < segments; i++) for (let j = 0; j < segments; j++) {
    const a = i * (segments + 1) + j, b = a + segments + 1;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const accessor = (type, array) => document.createAccessor().setBuffer(buffer).setType(type).setArray(array);
  return document.createPrimitive().setMaterial(document.createMaterial('marfil_cloth'))
    .setAttribute('POSITION', accessor('VEC3', new Float32Array(positions)))
    .setAttribute('NORMAL', accessor('VEC3', new Float32Array(normals)))
    .setAttribute('TEXCOORD_0', accessor('VEC2', new Float32Array(uvs)))
    .setAttribute('JOINTS_0', accessor('VEC4', new Uint16Array(joints)))
    .setAttribute('WEIGHTS_0', accessor('VEC4', new Float32Array(weights)))
    .setIndices(accessor('SCALAR', new Uint32Array(indices)));
}

const tuples = primitive => Array.from({ length: primitive.getAttribute('POSITION').getCount() }, (_, i) =>
  ['POSITION', 'JOINTS_0', 'WEIGHTS_0'].map(s => primitive.getAttribute(s).getElement(i, []).map(v => v.toFixed(5)).join(',')).join('|'));

describe('per-part simplification (S16 web density)', () => {
  it('reduces blended layers to the piece budget while every survivor keeps its exact four-weight skin', async () => {
    const document = new Document();
    const cloth = grid(document, 40, x => [[0, 1, 2, 0], [0.6 - 0.4 * x, 0.3 + 0.4 * x, 0.1, 0]]);
    const source = new Set(tuples(cloth));
    const [result] = await simplifyRigidParts(document, [cloth], 600);
    const triangles = result.getIndices().getCount() / 3;
    expect(triangles).toBeGreaterThan(20);
    expect(triangles).toBeLessThanOrEqual(600);
    for (const tuple of tuples(result)) expect(source.has(tuple)).toBe(true);
  });

  it('locks positions shared by neighbouring parts so articulations cannot open', async () => {
    const document = new Document();
    // Split plates, as exported: the left follows joint 0, the right joint 1,
    // and their x = 0.5 columns coincide without sharing vertex indices.
    const buffer = document.createBuffer();
    const left = grid(document, 40, () => [[0, 0, 0, 0], [1, 0, 0, 0]], [0, 0.5], buffer);
    const right = grid(document, 40, () => [[1, 0, 0, 0], [1, 0, 0, 0]], [0.5, 1], buffer).setMaterial(left.getMaterial());
    const [result] = await simplifyRigidParts(document, [left, right], 400);
    expect(result.getIndices().getCount() / 3).toBeLessThanOrEqual(400);
    const seam = joint => new Set(Array.from({ length: result.getAttribute('POSITION').getCount() }, (_, i) => i)
      .filter(i => result.getAttribute('JOINTS_0').getElement(i, [])[0] === joint && Math.abs(result.getAttribute('POSITION').getElement(i, [])[0] - 0.5) < 1e-6)
      .map(i => result.getAttribute('POSITION').getElement(i, [])[2].toFixed(5)));
    expect(seam(0).size).toBe(41);
    expect([...seam(1)].sort()).toEqual([...seam(0)].sort());
  });

  it('leaves pieces already inside the budget untouched', async () => {
    const document = new Document();
    const cloth = grid(document, 4, () => [[0, 1, 0, 0], [0.5, 0.5, 0, 0]]);
    const [result] = await simplifyRigidParts(document, [cloth], 1000);
    expect(result.getIndices().getCount() / 3).toBe(32);
  });
});
