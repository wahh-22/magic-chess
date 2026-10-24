import { describe, expect, it } from "vitest";
import { matchProgress, SECONDARY_SHARE } from "./loadingProgress";

const snapshot = (fraction: number, items = 4, phase: "download" | "compile" | "done" = fraction >= 1 ? "done" : "download") =>
  ({ fraction, items, phase, done: fraction >= 1 });

describe("match loading progress", () => {
  it("is the critical progress when the secondary set is already prepared (rematch) or not awaited", () => {
    expect(matchProgress(snapshot(0.4), snapshot(0), "ready")).toEqual({ fraction: 0.4, phase: "download" });
    expect(matchProgress(snapshot(1), snapshot(1), "ready")).toEqual({ fraction: 1, phase: "done" });
  });

  it("keeps a share of the bar for the secondary set while the reveal waits for it", () => {
    expect(SECONDARY_SHARE).toBeGreaterThan(0);
    expect(SECONDARY_SHARE).toBeLessThan(0.3);
    const critical = matchProgress(snapshot(0.5), snapshot(0, 0), "waiting");
    expect(critical.fraction).toBeCloseTo(0.5 * (1 - SECONDARY_SHARE));
    expect(critical.phase).toBe("download");
    const secondary = matchProgress(snapshot(1), snapshot(0.5), "loading");
    expect(secondary.fraction).toBeCloseTo(1 - SECONDARY_SHARE / 2);
    expect(secondary.phase).toBe("secondary");
  });

  it("does not count a secondary stage with no items yet as finished, nor reach 100% before it is ready", () => {
    expect(matchProgress(snapshot(1), snapshot(1, 0), "loading").fraction).toBeCloseTo(1 - SECONDARY_SHARE);
    expect(matchProgress(snapshot(1), snapshot(1), "loading").fraction).toBeLessThan(1);
  });
});
