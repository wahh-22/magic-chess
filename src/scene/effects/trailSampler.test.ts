import { expect, it } from 'vitest';
import { sampleTrail, weaponTipBinding } from './trailSampler';
it('binds each trail to its actual weapon hand (V6–V8: queen staff left, bishop lance right)', () => {
  expect(weaponTipBinding('q')).toEqual({ bone: 'handL', direction: 1 });
  expect(weaponTipBinding('b')).toEqual({ bone: 'handR', direction: 1 });
  expect(weaponTipBinding('k')).toEqual({ bone: 'handR', direction: -1 });
  expect(weaponTipBinding('p')).toEqual({ bone: 'handR', direction: 1 });
  expect(weaponTipBinding('n')).toEqual({ bone: 'lance', direction: 1 });
  expect(weaponTipBinding('r')).toEqual({ bone: 'hand_R', direction: 1 });
});
it('uses the selected attack event window rather than a guessed hit window', () => {
  const window = { startMs: 100, endMs: 200 };
  expect(sampleTrail([], [0, 0, 0], 99, 500, 100, true, window)).toEqual([]);
  let points = sampleTrail([], [0, 0, 0], 100, 500, 100, true, window);
  expect(points).toHaveLength(1);
  points = sampleTrail(points, [1, 0, 0], 180, 500, 100, true, window);
  expect(points).toHaveLength(2);
  expect(sampleTrail(points, [2, 0, 0], 220, 500, 100, true, window)).toHaveLength(1);
  expect(sampleTrail(points, [2, 0, 0], 300, 500, 100, true, window)).toEqual([]);
});
it('keeps a bounded, fading hit-window ribbon; resets on rewind and expires', () => {
  let points = sampleTrail([], [0, 0, 0], 440, 500, 100);
  expect(points).toHaveLength(1);
  points = sampleTrail(points, [1, 0, 0], 500, 500, 100);
  expect(points).toHaveLength(2);
  expect(points[0]!.alpha).toBeCloseTo(0.4);
  for (let t = 501; t < 550; t++) points = sampleTrail(points, [t, 0, 0], t, 500, 100);
  expect(points.length).toBeLessThanOrEqual(16);
  expect(sampleTrail(points, [0, 0, 0], 300, 500, 100)).toEqual([]);
  expect(sampleTrail(points, [0, 0, 0], 800, 500, 100)).toEqual([]);
  expect(sampleTrail([], [0, 0, 0], 500, 500, 100, false)).toEqual([]);
});
