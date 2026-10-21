import { describe, expect, it } from "vitest";
import { CAMERA_KEEP_OUT, DAIS, parseQuality, PILLARS, PILLAR_RADIUS, PILLAR_HALF_WIDTH, QUALITY_PRESETS, torchFlicker, WALL_DISTANCE } from "./chamberConfig";

describe("chamber presentation contract", () => {
  it("flickers deterministically, smoothly and within its energy budget", () => {
    for (let t = 0; t < 60; t += 0.03) {
      const value = torchFlicker(t, 3);
      expect(value).toBe(torchFlicker(t, 3));
      expect(value).toBeGreaterThanOrEqual(0.835);
      expect(value).toBeLessThanOrEqual(1.165);
      expect(Math.abs(value - torchFlicker(t + 0.01, 3))).toBeLessThan(0.02);
    }
    expect(torchFlicker(1, 1)).not.toBe(torchFlicker(1, 2));
  });
  it("defaults invalid or absent saved quality to high", () => {
    expect(parseQuality(null)).toBe("high");
    expect(parseQuality("invalid")).toBe("high");
    expect(parseQuality("high")).toBe("high");
    expect(parseQuality("low")).toBe("low");
  });
  it("removes postprocessing and torch shadows and reduces particles on low", () => {
    expect(QUALITY_PRESETS.high.postprocessing).toBe(true);
    expect(QUALITY_PRESETS.low.postprocessing).toBe(false);
    expect(QUALITY_PRESETS.low.torchShadows).toBe(0);
    expect(QUALITY_PRESETS.low.dustCount).toBeLessThan(QUALITY_PRESETS.high.dustCount);
    expect(QUALITY_PRESETS.low.dpr).toBeLessThan(QUALITY_PRESETS.high.dpr);
  });
  it("keeps pillars, inward torch brackets, walls and arch chords outside the orbit", () => {
    expect(PILLARS).toHaveLength(12);
    for (const { x, z } of PILLARS) {
      expect(Math.hypot(x, z) - PILLAR_HALF_WIDTH - 1.2).toBeGreaterThan(CAMERA_KEEP_OUT);
    }
    expect(PILLAR_RADIUS * Math.cos(Math.PI / 12) - PILLAR_HALF_WIDTH).toBeGreaterThan(CAMERA_KEEP_OUT);
    expect(WALL_DISTANCE - 0.5).toBeGreaterThan(CAMERA_KEEP_OUT);
  });
  it("places ascending steps below the unchanged board frame", () => {
    DAIS.forEach((step, index) => {
      expect(step.y + step.height / 2).toBeLessThanOrEqual(-0.26 + 1e-9);
      expect(step.width).toBeGreaterThan(9.2);
      if (index > 0) {
        expect(step.width).toBeLessThan(DAIS[index - 1]!.width);
        expect(step.y).toBeGreaterThan(DAIS[index - 1]!.y);
      }
    });
  });
});
