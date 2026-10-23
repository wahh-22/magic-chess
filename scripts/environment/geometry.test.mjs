import { describe, expect, it } from 'vitest';
import { bounds, groundOffset, hash01, leafCards, simplifySolid, thinComponents, translate, triangleComponents, triangleCount } from './geometry.mjs';

/** n separate bent "leaves": two triangles each, folded along their middle, with a UV rectangle per leaf. */
function leaves(n) {
  const positions = [], normals = [], uvs = [], indices = [];
  for (let i = 0; i < n; i++) {
    const x = i * 2, base = positions.length / 3;
    positions.push(x, 0, 0, x + 1, 0, 0, x + 1, 1, 0.2, x, 1, 0.2);
    normals.push(0, -0.2, 1, 0, -0.2, 1, 0, -0.2, 1, 0, -0.2, 1);
    const u = (i % 4) / 4, v = Math.floor(i / 4) / 4;
    uvs.push(u, v, u + 0.25, v, u + 0.25, v + 0.25, u, v + 0.25);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), uvs: new Float32Array(uvs), indices: new Uint32Array(indices) };
}

describe('environment geometry reduction', () => {
  it('finds one component per separate leaf, welding UV seams by position', () => {
    expect(triangleComponents(leaves(5)).count).toBe(5);
  });

  it('replaces each modelled leaf by one quad spanning the same texture rectangle and position', () => {
    const source = leaves(3);
    const cards = leafCards(source);
    expect(triangleCount(cards)).toBe(6);
    const box = bounds(cards), sourceBox = bounds(source);
    for (let axis = 0; axis < 3; axis++) {
      expect(box.min[axis]).toBeCloseTo(sourceBox.min[axis], 4);
      expect(box.max[axis]).toBeCloseTo(sourceBox.max[axis], 4);
    }
    expect(Math.min(...cards.uvs)).toBeCloseTo(0, 6);
    expect(Math.max(...cards.uvs)).toBeCloseTo(0.75, 6);
  });

  it('thins components deterministically and grows survivors about their own centre', () => {
    const source = leaves(400);
    const thinned = thinComponents(source, 0.25, 2, 3);
    expect(thinned).toEqual(thinComponents(source, 0.25, 2, 3));
    const kept = triangleComponents(thinned).count;
    expect(kept).toBeGreaterThan(70);
    expect(kept).toBeLessThan(130);
    // Each leaf is 1 unit wide; grown ×2 about its centre.
    expect(thinned.positions[3] - thinned.positions[0]).toBeCloseTo(2, 5);
    expect(hash01(17, 3)).toBe(hash01(17, 3));
  });

  it('simplifies toward a triangle budget and puts a variant on the ground origin', async () => {
    const segments = 40, positions = [], normals = [], uvs = [], indices = [];
    for (let j = 0; j <= segments; j++) {
      for (let i = 0; i <= segments; i++) {
        positions.push(i / segments + 3, 0.5, j / segments - 2);
        normals.push(0, 1, 0);
        uvs.push(i / segments, j / segments);
      }
    }
    for (let j = 0; j < segments; j++) {
      for (let i = 0; i < segments; i++) {
        const a = j * (segments + 1) + i;
        indices.push(a, a + segments + 1, a + 1, a + 1, a + segments + 1, a + segments + 2);
      }
    }
    const grid = { positions: new Float32Array(positions), normals: new Float32Array(normals), uvs: new Float32Array(uvs), indices: new Uint32Array(indices) };
    const simplified = await simplifySolid(grid, 200, { error: 0.05 });
    expect(triangleCount(simplified)).toBeLessThanOrEqual(200);
    expect(triangleCount(simplified)).toBeGreaterThan(0);
    const placed = translate(grid, groundOffset([grid]));
    const box = bounds(placed);
    expect(box.min[1]).toBeCloseTo(0, 6);
    expect(box.min[0] + box.max[0]).toBeCloseTo(0, 5);
    expect(box.min[2] + box.max[2]).toBeCloseTo(0, 5);
  });
});
