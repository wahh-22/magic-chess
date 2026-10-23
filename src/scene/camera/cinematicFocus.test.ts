import { expect, it } from "vitest";
import { DEFAULT_CINEMATIC_CONFIG as config } from "./cinematicConfig";
import { focusAmount } from "./cinematicFocus";

it("ramps depth of field in during the approach, holds it, and releases it by the end of the return", () => {
  const { approachMs, holdMs, returnMs } = config;
  const at = (ms: number) => focusAmount(ms, approachMs, holdMs, returnMs);
  expect(at(0)).toBe(0);
  expect(at(approachMs)).toBe(1);
  expect(at(approachMs + holdMs)).toBe(1);
  expect(at(approachMs + holdMs + returnMs)).toBe(0);
  for (let ms = 0; ms < approachMs + holdMs + returnMs; ms += 10) {
    expect(at(ms)).toBeGreaterThanOrEqual(0);
    expect(at(ms)).toBeLessThanOrEqual(1);
    expect(Math.abs(at(ms + 10) - at(ms))).toBeLessThan(0.05);
  }
});
