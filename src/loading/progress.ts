/**
 * Real loading progress: every asset or step of work registers an item; the bar is the
 * weighted sum of what is actually done. Downloads weigh by bytes (a 2 MB tree counts more
 * than a 10 kB roughness map), the CPU/GPU phases that follow weigh by item.
 */
export type LoadStage = "critical" | "secondary";
/** Ordered phases of the bar; a stage only uses the phases it has items for. */
export type LoadPhase = "download" | "build" | "upload" | "compile";

const PHASES: readonly LoadPhase[] = ["download", "build", "upload", "compile"];
const PHASE_WEIGHT: Record<LoadPhase, number> = { download: 0.6, build: 0.1, upload: 0.15, compile: 0.15 };

interface Item { stage: LoadStage; phase: LoadPhase; loaded: number; total?: number; finished: boolean; failed: boolean }

export interface ProgressSnapshot {
  /** 0..1 over the whole stage. */
  fraction: number;
  /** First phase with unfinished items, or "done". */
  phase: LoadPhase | "done";
  done: boolean;
  loadedBytes: number;
  totalBytes: number;
  items: number;
  finishedItems: number;
  failed: number;
}

export interface ProgressTracker {
  /** Registers an item; registering an existing id keeps its progress. */
  add(id: string, item: { stage: LoadStage; phase: LoadPhase; total?: number }): void;
  update(id: string, loaded: number, total?: number): void;
  done(id: string): void;
  /** A failed optional asset no longer holds the bar back. */
  fail(id: string): void;
  has(id: string): boolean;
  /** Ids still in progress (diagnostics: what the bar is waiting for). */
  pending(stage: LoadStage): string[];
  snapshot(stage: LoadStage): ProgressSnapshot;
  subscribe(listener: () => void): () => void;
}

export function createProgressTracker(): ProgressTracker {
  const items = new Map<string, Item>();
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  const finish = (id: string, failed: boolean) => {
    const item = items.get(id);
    if (!item || item.finished) return;
    item.finished = true;
    item.failed = failed;
    item.total ??= Math.max(item.loaded, 1);
    item.loaded = item.total;
    notify();
  };

  return {
    add(id, { stage, phase, total }) {
      if (items.has(id)) return;
      items.set(id, { stage, phase, loaded: 0, total, finished: false, failed: false });
      notify();
    },
    update(id, loaded, total) {
      const item = items.get(id);
      if (!item || item.finished) return;
      if (total !== undefined && total > 0) item.total = total;
      item.loaded = Math.max(0, item.total === undefined ? loaded : Math.min(loaded, item.total));
      // Reaching the declared total completes the item (bytes received, steps counted).
      if (item.total !== undefined && item.loaded >= item.total) item.finished = true;
      notify();
    },
    done: (id) => finish(id, false),
    fail: (id) => finish(id, true),
    has: (id) => items.has(id),
    pending: (stage) => [...items].filter(([, item]) => item.stage === stage && !item.finished).map(([id]) => id),
    snapshot(stage) {
      const own = [...items.values()].filter((item) => item.stage === stage);
      const downloads = own.filter((item) => item.phase === "download");
      const known = downloads.filter((item) => item.total !== undefined);
      // Until a response reports its size, assume it is as large as the average known file.
      const estimate = known.length ? known.reduce((sum, item) => sum + item.total!, 0) / known.length : 1;
      const totalBytes = downloads.reduce((sum, item) => sum + (item.total ?? Math.max(estimate, item.loaded)), 0);
      const loadedBytes = downloads.reduce((sum, item) => sum + item.loaded, 0);
      let weighted = 0, weights = 0;
      for (const phase of PHASES) {
        const group = own.filter((item) => item.phase === phase);
        if (!group.length) continue;
        const fraction = phase === "download"
          ? (totalBytes > 0 ? loadedBytes / totalBytes : 1)
          : group.reduce((sum, item) => sum + (item.finished ? 1 : item.total ? item.loaded / item.total : 0), 0) / group.length;
        weighted += PHASE_WEIGHT[phase] * fraction;
        weights += PHASE_WEIGHT[phase];
      }
      const unfinished = PHASES.find((phase) => own.some((item) => item.phase === phase && !item.finished));
      const done = !unfinished && own.every((item) => item.finished);
      return {
        fraction: done ? 1 : weights ? Math.min(1, weighted / weights) : 1,
        phase: unfinished ?? "done",
        done,
        loadedBytes,
        totalBytes,
        items: own.length,
        finishedItems: own.filter((item) => item.finished).length,
        failed: own.filter((item) => item.failed).length,
      };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
