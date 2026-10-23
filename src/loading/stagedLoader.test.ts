import { describe, expect, it, vi } from "vitest";
import { createStagedLoader } from "./stagedLoader";

describe("staged loader", () => {
  it("goes critical download → warm-up → ready, and only then streams the secondary set", () => {
    const loader = createStagedLoader();
    expect(loader.getState()).toMatchObject({ stage: "loading", secondary: "waiting" });
    loader.getState().warmed();
    expect(loader.getState().stage).toBe("loading");
    loader.getState().criticalMounted();
    expect(loader.getState().stage).toBe("warming");
    loader.getState().secondaryLoaded();
    expect(loader.getState().secondary).toBe("waiting");
    loader.getState().warmed();
    expect(loader.getState()).toMatchObject({ stage: "ready", secondary: "loading" });
    loader.getState().secondaryLoaded();
    expect(loader.getState().secondary).toBe("ready");
  });

  it("Start pressed while loading waits behind the loading screen and runs once when ready", () => {
    const loader = createStagedLoader();
    const start = vi.fn();
    expect(loader.getState().requestStart(start)).toBe(false);
    expect(loader.getState().startPending).toBe(true);
    loader.getState().criticalMounted();
    expect(start).not.toHaveBeenCalled();
    loader.getState().warmed();
    expect(start).toHaveBeenCalledTimes(1);
    expect(loader.getState().startPending).toBe(false);
    loader.getState().warmed();
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("runs Start immediately once ready, and the latest request wins while waiting", () => {
    const loader = createStagedLoader();
    const first = vi.fn(), second = vi.fn(), later = vi.fn();
    loader.getState().requestStart(first);
    loader.getState().requestStart(second);
    loader.getState().criticalMounted();
    loader.getState().warmed();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(loader.getState().requestStart(later)).toBe(true);
    expect(later).toHaveBeenCalledTimes(1);
  });

  it("a pending Start can be cancelled", () => {
    const loader = createStagedLoader();
    const start = vi.fn();
    loader.getState().requestStart(start);
    loader.getState().cancelStart();
    loader.getState().criticalMounted();
    loader.getState().warmed();
    expect(start).not.toHaveBeenCalled();
  });

  it("re-warms after a scene change without dropping back to the download stage", () => {
    const loader = createStagedLoader();
    loader.getState().criticalMounted();
    loader.getState().warmed();
    loader.getState().rewarm();
    expect(loader.getState().stage).toBe("warming");
    loader.getState().warmed();
    expect(loader.getState().stage).toBe("ready");
  });
});
