/**
 * Runs queued work (GPU texture uploads, program links) a few milliseconds per frame instead
 * of all at once, so input and painting keep flowing between slices. Each task is atomic: a
 * task larger than the budget runs alone in its frame, so the queue always makes progress.
 * A task may return a promise (e.g. waiting for the GPU to finish an upload): the queue then
 * pauses, with the main thread free, and resumes on the frame after it settles.
 */
export interface TimeSlicedQueue {
  enqueue(task: () => void | Promise<void>): Promise<void>;
  /** Resolves when every task queued so far has run (immediately when empty). */
  idle(): Promise<void>;
  pending(): number;
}

export interface TimeSlicedQueueOptions {
  /** Main-thread time per frame; ~4–8 ms leaves room for the frame itself at 60 Hz. */
  budgetMs?: number;
  now?: () => number;
  schedule?: (callback: () => void) => void;
}

const defaultSchedule = (callback: () => void) => {
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => callback());
  else setTimeout(callback, 16);
};

export function createTimeSlicedQueue({
  budgetMs = 6,
  now = () => performance.now(),
  schedule = defaultSchedule,
}: TimeSlicedQueueOptions = {}): TimeSlicedQueue {
  const tasks: { run: () => void | Promise<void>; resolve: () => void; reject: (error: unknown) => void }[] = [];
  let waiting = false;
  let idleWaiters: (() => void)[] = [];
  let scheduled = false;

  const settleIdle = () => {
    if (tasks.length || waiting) return;
    const waiters = idleWaiters;
    idleWaiters = [];
    waiters.forEach((resolve) => resolve());
  };

  const tick = () => {
    scheduled = false;
    const start = now();
    let ran = 0;
    while (tasks.length && (ran === 0 || now() - start < budgetMs)) {
      const task = tasks.shift()!;
      ran++;
      try {
        const result = task.run();
        if (result) {
          waiting = true;
          void result.then(task.resolve, task.reject).finally(() => {
            waiting = false;
            if (tasks.length) request();
            else settleIdle();
          });
          return;
        }
        task.resolve();
      } catch (error) {
        task.reject(error);
      }
    }
    if (tasks.length) request();
    else settleIdle();
  };

  const request = () => {
    if (scheduled || waiting) return;
    scheduled = true;
    schedule(tick);
  };

  return {
    enqueue(run) {
      return new Promise<void>((resolve, reject) => {
        tasks.push({ run, resolve, reject });
        request();
      });
    },
    idle() {
      if (!tasks.length && !waiting) return Promise.resolve();
      return new Promise<void>((resolve) => { idleWaiters.push(resolve); });
    },
    pending: () => tasks.length,
  };
}
