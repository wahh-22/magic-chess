import { describe, expect, it } from "vitest";
import { DEFAULT_ANIMATION_CONFIG } from "../../config/animation";
import type { Track } from "./planMove";
import { sampleTrack } from "./sampleTrack";

const config = { ...DEFAULT_ANIMATION_CONFIG, liftHeight: 0.2, knightHopHeight: 1.3 };
function track(kind: Track["kind"]): Track {
  return { pieceId: "piece", kind, startMs: 200, durationMs: 1000, from: [1, 2], to: [5, 6] };
}

describe("sampleTrack", () => {
  it.each(["glide", "hop"] as const)("holds %s at its origin before and at start", (kind) => {
    expect(sampleTrack(track(kind), -100, config)).toEqual({ x: 1, y: 0, z: 2, visible: true });
    expect(sampleTrack(track(kind), 200, config)).toEqual({ x: 1, y: 0, z: 2, visible: true });
  });

  it.each([["glide", config.liftHeight], ["hop", config.knightHopHeight]] as const)(
    "samples %s at midpoint with the configured peak height", (kind, peak) => {
      expect(sampleTrack(track(kind), 700, config)).toEqual({ x: 3, y: peak, z: 4, visible: true });
    },
  );

  it.each(["glide", "hop"] as const)("eases %s horizontally in and out", (kind) => {
    const early = sampleTrack(track(kind), 450, config);
    const late = sampleTrack(track(kind), 950, config);
    expect(early.x).toBeGreaterThan(1);
    expect(early.x).toBeLessThan(2);
    expect(late.x).toBeGreaterThan(4);
    expect(late.x).toBeLessThan(5);
    expect(early.x + late.x).toBeCloseTo(6);
  });

  it.each(["glide", "hop"] as const)("clamps %s to its destination at and after end", (kind) => {
    for (const elapsed of [1200, 5000]) {
      const sample = sampleTrack(track(kind), elapsed, config);
      expect(sample.x).toBe(5);
      expect(sample.z).toBe(6);
      expect(sample.y).toBeCloseTo(0);
      expect(sample.visible).toBe(true);
    }
  });

  it("keeps a shattering piece in place until impact, then hides it", () => {
    const shattering = { ...track("shatter"), durationMs: 0 };
    expect(sampleTrack(shattering, 199, config)).toEqual({ x: 1, y: 0, z: 2, visible: true });
    for (const elapsed of [200, 5000]) {
      expect(sampleTrack(shattering, elapsed, config)).toEqual({ x: 1, y: 0, z: 2, visible: false });
    }
  });
});
