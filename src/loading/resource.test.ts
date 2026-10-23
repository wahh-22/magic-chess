import { describe, expect, it, vi } from "vitest";
import { createResourceCache } from "./resource";

describe("suspense resource cache", () => {
  it("suspends with the pending promise, then returns the value without loading twice", async () => {
    const cache = createResourceCache();
    const load = vi.fn(async () => 42);
    let thrown: unknown;
    try { cache.read("answer", load); } catch (error) { thrown = error; }
    expect(thrown).toBeInstanceOf(Promise);
    await thrown;
    expect(cache.read("answer", load)).toBe(42);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("preload starts the work early and read reuses it", async () => {
    const cache = createResourceCache();
    const load = vi.fn(async () => "sky");
    await expect(cache.preload("sky", load)).resolves.toBe("sky");
    expect(cache.read("sky", load)).toBe("sky");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("rethrows a failure to the error boundary and lets a later read retry", async () => {
    const cache = createResourceCache();
    const load = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce("ok");
    await cache.preload("x", load).catch(() => undefined);
    expect(() => cache.read("x", load)).toThrow("offline");
    let thrown: unknown;
    try { cache.read("x", load); } catch (error) { thrown = error; }
    expect(thrown).toBeInstanceOf(Promise);
    await thrown;
    expect(cache.read("x", load)).toBe("ok");
  });
});
