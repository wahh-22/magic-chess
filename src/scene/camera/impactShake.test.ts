import { expect, it } from "vitest";
import { sampleImpactShake } from "./impactShake";
import { DEFAULT_ANIMATION_CONFIG as config } from "../../config/animation";

it("shake decays to zero, has no persistent offset, and respects reduced motion", () => {
  const shake = config.shake;
  expect(sampleImpactShake(-1, "r", shake, false)).toEqual([0, 0, 0]);
  expect(sampleImpactShake(shake.durationMs, "r", shake, false)).toEqual([0, 0, 0]);
  expect(sampleImpactShake(10, "r", shake, true)).toEqual([0, 0, 0]);
  for (let time = 0; time < shake.durationMs; time += 5) {
    const envelope = shake.intensity.r * (1 - time / shake.durationMs) ** 2;
    for (const value of sampleImpactShake(time, "r", shake, false)) expect(Math.abs(value)).toBeLessThanOrEqual(envelope);
  }
  expect(Math.abs(sampleImpactShake(10, "r", shake, false)[0])).toBeGreaterThan(Math.abs(sampleImpactShake(10, "p", shake, false)[0]));
});
