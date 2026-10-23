/**
 * Minimal Suspense resources keyed by string: `read` returns the value or throws the pending
 * promise (Suspense) or the error (error boundary); `preload` starts the same work early.
 */
type Entry<T> =
  | { status: "pending"; promise: Promise<T> }
  | { status: "done"; value: T }
  | { status: "failed"; error: unknown };

export interface ResourceCache {
  read<T>(key: string, load: () => Promise<T>): T;
  preload<T>(key: string, load: () => Promise<T>): Promise<T>;
}

export function createResourceCache(): ResourceCache {
  const entries = new Map<string, Entry<unknown>>();
  const start = <T,>(key: string, load: () => Promise<T>): Promise<T> => {
    const promise = load().then(
      (value) => { entries.set(key, { status: "done", value }); return value; },
      (error: unknown) => { entries.set(key, { status: "failed", error }); throw error; },
    );
    entries.set(key, { status: "pending", promise });
    return promise;
  };
  return {
    read<T>(key: string, load: () => Promise<T>): T {
      const entry = entries.get(key) as Entry<T> | undefined;
      if (!entry) throw start(key, load).catch(() => undefined);
      if (entry.status === "done") return entry.value;
      if (entry.status === "pending") throw entry.promise.catch(() => undefined);
      // Report the failure once, then allow a retry (e.g. after going back online).
      entries.delete(key);
      throw entry.error;
    },
    preload<T>(key: string, load: () => Promise<T>): Promise<T> {
      const entry = entries.get(key) as Entry<T> | undefined;
      if (entry?.status === "done") return Promise.resolve(entry.value);
      if (entry?.status === "pending") return entry.promise;
      return start(key, load);
    },
  };
}

/** The app-wide cache for scene assets. */
export const resources = createResourceCache();
