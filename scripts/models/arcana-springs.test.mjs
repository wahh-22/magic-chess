import { describe, expect, it } from 'vitest';
import { Quaternion } from 'three';
import { bakeQuaternionSpring, springProfile } from './arcana-springs.mjs';

describe('quaternion pose springs', () => {
  const target = new Quaternion().setFromAxisAngle({ x: 0, y: 1, z: 0 }, 1).toArray();
  it('converges with small, bounded underdamped overshoot', () => {
    const samples = bakeQuaternionSpring([0, 0.15, 0.8, 1.5], [[0, 0, 0, 1], target, target, target], 1.5, { frequency: 25, damping: 0.72, delay: 0 });
    const angles = samples.map(q => 2 * Math.atan2(q[1], q[3]));
    expect(Math.max(...angles)).toBeGreaterThan(1.001);
    expect(Math.max(...angles)).toBeLessThan(1.12);
    expect(angles.at(-1)).toBeCloseTo(1, 4);
    expect(samples.every(q => Math.abs(Math.hypot(...q) - 1) < 1e-6)).toBe(true);
  });
  it('propagates down the chain rather than starting every joint together', () => {
    const chain = ['pelvis', 'chest', 'shoulder.R', 'forearm.R', 'hand.R'];
    expect(chain.map(n => springProfile(n).delay)).toEqual([0, 0.03, 0.05, 0.07, 0.09]);
    const firstMotion = chain.map(name => bakeQuaternionSpring([0, 0.1, 1], [[0, 0, 0, 1], target, target], 1, springProfile(name)).findIndex(q => Math.abs(q[1]) > 0.001));
    for (let i = 1; i < firstMotion.length; i++) expect(firstMotion[i]).toBeGreaterThan(firstMotion[i - 1]);
  });
});
