import { describe, expect, it, vi } from "vitest";
import { createPrefetchCache, scenePrefetchList } from "./prefetch";

/** A fetch whose responses resolve when the test says so; records the request options. */
function controlledFetch() {
  const calls: { url: string; init?: RequestInit; resolve: (body: Uint8Array) => void; reject: (error: Error) => void }[] = [];
  const fetch = vi.fn((url: string, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
    calls.push({ url, init, resolve: (body) => resolve(new Response(body as BodyInit, { headers: { "Content-Length": String(body.byteLength) } })), reject });
  }));
  return { fetch, calls };
}
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

describe("prefetch cache", () => {
  it("downloads bytes at low priority, a few at a time, in order", async () => {
    const { fetch, calls } = controlledFetch();
    const cache = createPrefetchCache({ fetch, concurrency: 2 });
    cache.prefetch(["/a.webp", "/b.glb", "/c.glb"]);
    await flush();
    expect(calls.map((call) => call.url)).toEqual(["/a.webp", "/b.glb"]);
    expect(calls[0]!.init).toMatchObject({ priority: "low" });
    calls[0]!.resolve(new Uint8Array(4));
    await flush();
    expect(calls.map((call) => call.url)).toEqual(["/a.webp", "/b.glb", "/c.glb"]);
  });

  it("hands finished bytes to the loader once, with their progress", async () => {
    const { fetch, calls } = controlledFetch();
    const cache = createPrefetchCache({ fetch });
    cache.prefetch(["/a.webp"]);
    await flush();
    calls[0]!.resolve(new Uint8Array([1, 2, 3]));
    await flush();
    const progress = vi.fn();
    const taken = cache.take("/a.webp", progress);
    expect(taken).toBeDefined();
    expect(new Uint8Array(await taken!)).toEqual(new Uint8Array([1, 2, 3]));
    expect(progress).toHaveBeenLastCalledWith(3, 3);
    // Taken bytes leave the cache (no second copy kept in memory).
    expect(cache.take("/a.webp", progress)).toBeUndefined();
  });

  it("joins a download still in flight and forwards its progress", async () => {
    const { fetch, calls } = controlledFetch();
    const cache = createPrefetchCache({ fetch });
    cache.prefetch(["/a.webp"]);
    await flush();
    const progress = vi.fn();
    const taken = cache.take("/a.webp", progress)!;
    calls[0]!.resolve(new Uint8Array(5));
    expect((await taken).byteLength).toBe(5);
    expect(progress).toHaveBeenLastCalledWith(5, 5);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not hold back a queued download the loader asks for: it starts now", async () => {
    const { fetch, calls } = controlledFetch();
    const cache = createPrefetchCache({ fetch, concurrency: 1 });
    cache.prefetch(["/a.webp", "/b.glb"]);
    await flush();
    expect(cache.take("/b.glb", () => {})).toBeUndefined();
    await flush();
    calls[0]!.resolve(new Uint8Array(1));
    await flush();
    // The loader fetches /b.glb itself; the prefetcher skips it.
    expect(calls.map((call) => call.url)).toEqual(["/a.webp"]);
  });

  it("forgets failed downloads so the loader fetches them again", async () => {
    const { fetch, calls } = controlledFetch();
    const cache = createPrefetchCache({ fetch });
    cache.prefetch(["/missing.webp"]);
    await flush();
    calls[0]!.reject(new Error("offline"));
    await flush();
    expect(cache.take("/missing.webp", () => {})).toBeUndefined();
  });

  it("prefetches each URL once and only local asset paths", async () => {
    const { fetch, calls } = controlledFetch();
    const cache = createPrefetchCache({ fetch });
    cache.prefetch(["/a.webp", "/a.webp", "https://example.com/x.glb", "//cdn/x.glb"]);
    cache.prefetch(["/a.webp"]);
    await flush();
    expect(calls.map((call) => call.url)).toEqual(["/a.webp"]);
  });

  it("warms the HTTP cache without keeping bytes (files a worker loads itself)", async () => {
    const { fetch, calls } = controlledFetch();
    const cache = createPrefetchCache({ fetch });
    cache.warm(["/stockfish/engine.wasm"]);
    await flush();
    expect(calls[0]).toMatchObject({ url: "/stockfish/engine.wasm", init: { priority: "low" } });
    calls[0]!.resolve(new Uint8Array(8));
    await flush();
    expect(cache.take("/stockfish/engine.wasm", () => {})).toBeUndefined();
  });
});

describe("scene prefetch list", () => {
  const textures = ["/environment/marble_01_diff.webp", "/environment/sky.webp"];
  const manifest = {
    version: 1,
    materialLibrary: "arcana-materials.glb",
    pieces: {
      p: { colors: { w: { file: "p-w.glb" }, b: { file: "p-b.glb" } } },
      n: { file: "n.glb" },
    },
  };

  it("lists critical textures, the material library and every piece model, then the secondary set", () => {
    expect(scenePrefetchList(manifest, textures, ["/environment/models/tree.glb"])).toEqual([
      ...textures,
      "/models/arcana-materials.glb", "/models/p-w.glb", "/models/p-b.glb", "/models/n.glb",
      "/environment/models/tree.glb",
    ]);
  });

  it("keeps only plain local file names from the manifest", () => {
    const hostile = { pieces: { p: { file: "../../secret.glb" }, n: { file: "https://evil.example/n.glb" }, b: { colors: { w: { file: "b w.glb" } } }, k: { file: "k.glb" } } };
    expect(scenePrefetchList(hostile, [], [])).toEqual(["/models/k.glb"]);
    expect(scenePrefetchList({ materialLibrary: "../x.glb", pieces: {} }, [], [])).toEqual([]);
  });

  it("falls back to the textures alone without a usable manifest", () => {
    for (const bad of [null, undefined, "x", 3, { pieces: null }, { pieces: [1, 2] }]) {
      expect(scenePrefetchList(bad, textures, [])).toEqual(textures);
    }
  });
});
