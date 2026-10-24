import { describe, expect, it } from "vitest";
import { LOADING_ART, LOADING_TIPS, loadingArtFor, TIP_INTERVAL_MS, tipAt } from "./loadingTips";

describe("loading tips", () => {
  it("has several short tips", () => {
    expect(LOADING_TIPS.length).toBeGreaterThanOrEqual(6);
    for (const tip of LOADING_TIPS) expect(tip.length).toBeLessThan(160);
    expect(new Set(LOADING_TIPS).size).toBe(LOADING_TIPS.length);
  });

  it("rotates every few seconds from a per-match starting tip, wrapping around", () => {
    expect(TIP_INTERVAL_MS).toBeGreaterThanOrEqual(4000);
    expect(TIP_INTERVAL_MS).toBeLessThanOrEqual(8000);
    expect(tipAt(0, 0)).toBe(0);
    expect(tipAt(TIP_INTERVAL_MS - 1, 0)).toBe(0);
    expect(tipAt(TIP_INTERVAL_MS, 0)).toBe(1);
    expect(tipAt(TIP_INTERVAL_MS * 2.5, 3)).toBe(5 % LOADING_TIPS.length);
    expect(tipAt(TIP_INTERVAL_MS * LOADING_TIPS.length, 0)).toBe(0);
    // Each match starts on a different tip.
    expect(tipAt(0, 1)).not.toBe(tipAt(0, 2));
  });

  it("never returns an out-of-range tip for odd inputs", () => {
    for (const [elapsed, seed] of [[-500, 0], [0, -1], [1e12, 7], [Number.NaN, 2]]) {
      const index = tipAt(elapsed!, seed!);
      expect(Number.isInteger(index)).toBe(true);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(LOADING_TIPS.length);
    }
  });

  it("alternates the loading key art between matches", () => {
    expect(LOADING_ART).toEqual(["/art/loading-1.webp", "/art/loading-2.webp"]);
    expect(loadingArtFor(1)).not.toBe(loadingArtFor(2));
    expect(loadingArtFor(1)).toBe(loadingArtFor(3));
    expect(LOADING_ART).toContain(loadingArtFor(0));
  });
});
