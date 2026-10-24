import { fetchWithProgress, isAssetPath } from "./fetchProgress";

/**
 * Invisible byte prefetch while the title menu is shown: downloads at low priority, a few at
 * a time, and keeps the bytes for the asset manager — nothing is decoded, parsed or sent to
 * the GPU. When the match loads, `take` hands over finished bytes (or joins a download still
 * in flight) exactly once, so the loading bar still counts them and memory is released.
 */
export interface PrefetchCache {
  /** Downloads and keeps the bytes until the loader takes them. */
  prefetch(urls: readonly string[]): void;
  /** Downloads into the HTTP cache only (files a worker or the browser loads itself). */
  warm(urls: readonly string[]): void;
  /** Prefetched bytes of `url`, replaying and forwarding their progress; undefined to fetch normally. */
  take(url: string, onProgress: (loaded: number, total: number | undefined) => void): Promise<ArrayBuffer> | undefined;
}

interface Entry {
  url: string;
  keep: boolean;
  state: "queued" | "loading" | "done";
  loaded: number;
  total?: number;
  promise?: Promise<ArrayBuffer>;
  listener?: (loaded: number, total: number | undefined) => void;
}

export function createPrefetchCache({ fetch: load = (url, init) => fetch(url, init), concurrency = 2 }: {
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
  concurrency?: number;
} = {}): PrefetchCache {
  const entries = new Map<string, Entry>();
  const seen = new Set<string>();
  const queue: Entry[] = [];
  let active = 0;
  const lowPriority = (url: string) => load(url, { priority: "low" });

  const start = (entry: Entry) => {
    active++;
    entry.state = "loading";
    const download = entry.keep
      ? fetchWithProgress(entry.url, {
        fetch: lowPriority,
        onProgress: (loaded, total) => { entry.loaded = loaded; entry.total = total; entry.listener?.(loaded, total); },
      })
      : lowPriority(entry.url).then((response) => response.arrayBuffer());
    entry.promise = download;
    void download.then(
      () => { entry.state = "done"; if (!entry.keep) entries.delete(entry.url); },
      () => { entries.delete(entry.url); },
    ).finally(() => { active--; pump(); });
  };
  const pump = () => {
    while (active < concurrency && queue.length) start(queue.shift()!);
  };
  const add = (urls: readonly string[], keep: boolean) => {
    for (const url of urls) {
      if (seen.has(url) || !isAssetPath(url)) continue;
      seen.add(url);
      const entry: Entry = { url, keep, state: "queued", loaded: 0 };
      entries.set(url, entry);
      queue.push(entry);
    }
    pump();
  };

  return {
    prefetch: (urls) => add(urls, true),
    warm: (urls) => add(urls, false),
    take(url, onProgress) {
      const entry = entries.get(url);
      if (!entry?.keep) return undefined;
      entries.delete(url);
      if (entry.state === "queued") {
        // Not started yet: the loader fetches it now instead of waiting in this queue.
        queue.splice(queue.indexOf(entry), 1);
        return undefined;
      }
      entry.listener = onProgress;
      onProgress(entry.loaded, entry.total);
      return entry.promise;
    },
  };
}

/** Plain file names only: the manifest never chooses a path or a host. */
const MODEL_FILE = /^[\w-]+\.glb$/;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * What the match downloads, in loading order: the critical textures, the piece material
 * library and models declared by `/models/manifest.json`, then the secondary set.
 */
export function scenePrefetchList(manifest: unknown, criticalTextures: readonly string[], secondary: readonly string[]): string[] {
  const models: string[] = [];
  const addModel = (file: unknown) => { if (typeof file === "string" && MODEL_FILE.test(file)) models.push(`/models/${file}`); };
  if (isRecord(manifest)) {
    if (manifest.materialLibrary !== undefined) addModel(manifest.materialLibrary);
    if (isRecord(manifest.pieces)) {
      for (const piece of Object.values(manifest.pieces)) {
        if (!isRecord(piece)) continue;
        if (isRecord(piece.colors)) for (const entry of Object.values(piece.colors)) addModel(isRecord(entry) ? entry.file : undefined);
        else addModel(piece.file);
      }
    }
  }
  return [...new Set([...criticalTextures, ...models, ...secondary])];
}
