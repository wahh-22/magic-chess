import { describe, expect, it } from "vitest";
import { createProgressTracker } from "./progress";

describe("progress tracker", () => {
  it("weighs downloads by bytes, not by file count", () => {
    const tracker = createProgressTracker();
    tracker.add("big", { stage: "critical", phase: "download", total: 900 });
    tracker.add("small", { stage: "critical", phase: "download", total: 100 });
    tracker.update("small", 100);
    const snapshot = tracker.snapshot("critical");
    expect(snapshot.fraction).toBeCloseTo(0.1);
    expect(snapshot.loadedBytes).toBe(100);
    expect(snapshot.totalBytes).toBe(1000);
  });

  it("estimates unknown sizes from the known ones so the bar does not jump to 100%", () => {
    const tracker = createProgressTracker();
    tracker.add("known", { stage: "critical", phase: "download", total: 1000 });
    tracker.add("unknown", { stage: "critical", phase: "download" });
    tracker.update("known", 1000);
    expect(tracker.snapshot("critical").fraction).toBeCloseTo(0.5);
    tracker.update("unknown", 1000, 3000);
    expect(tracker.snapshot("critical").fraction).toBeCloseTo(0.5);
    tracker.done("unknown");
    expect(tracker.snapshot("critical").fraction).toBe(1);
  });

  it("splits the bar across phases that have work and reports the first unfinished phase", () => {
    const tracker = createProgressTracker();
    tracker.add("tex", { stage: "critical", phase: "download", total: 10 });
    tracker.add("upload", { stage: "critical", phase: "upload", total: 4 });
    tracker.add("shaders", { stage: "critical", phase: "compile", total: 10 });
    tracker.done("tex");
    let snapshot = tracker.snapshot("critical");
    expect(snapshot.phase).toBe("upload");
    expect(snapshot.fraction).toBeGreaterThan(0.5);
    expect(snapshot.fraction).toBeLessThan(1);
    tracker.update("upload", 4);
    tracker.update("shaders", 5);
    snapshot = tracker.snapshot("critical");
    expect(snapshot.phase).toBe("compile");
    tracker.done("shaders");
    snapshot = tracker.snapshot("critical");
    expect(snapshot).toMatchObject({ fraction: 1, phase: "done", done: true });
  });

  it("keeps stages apart and counts failed items as finished", () => {
    const tracker = createProgressTracker();
    tracker.add("piece", { stage: "critical", phase: "download", total: 10 });
    tracker.add("tree", { stage: "secondary", phase: "download", total: 10 });
    tracker.fail("piece");
    expect(tracker.snapshot("critical").fraction).toBe(1);
    expect(tracker.snapshot("secondary").fraction).toBe(0);
    expect(tracker.snapshot("critical").failed).toBe(1);
    expect(tracker.pending("secondary")).toEqual(["tree"]);
    expect(tracker.pending("critical")).toEqual([]);
  });

  it("an empty stage is complete and adding an existing id keeps its progress", () => {
    const tracker = createProgressTracker();
    expect(tracker.snapshot("critical")).toMatchObject({ fraction: 1, done: true });
    tracker.add("a", { stage: "critical", phase: "build", total: 2 });
    tracker.update("a", 1);
    tracker.add("a", { stage: "critical", phase: "build", total: 2 });
    expect(tracker.snapshot("critical").fraction).toBeCloseTo(0.5);
  });

  it("notifies subscribers on every change until they unsubscribe", () => {
    const tracker = createProgressTracker();
    const calls: number[] = [];
    const stop = tracker.subscribe(() => calls.push(tracker.snapshot("critical").fraction));
    tracker.add("a", { stage: "critical", phase: "build", total: 2 });
    tracker.update("a", 2);
    stop();
    tracker.done("a");
    expect(calls).toEqual([0, 1]);
  });
});
