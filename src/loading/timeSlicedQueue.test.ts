import { describe, expect, it } from "vitest";
import { createTimeSlicedQueue } from "./timeSlicedQueue";

/** Manual frames and a fake clock: each task "costs" the time it adds to the clock. */
function harness(budgetMs: number) {
  let clock = 0;
  const frames: (() => void)[] = [];
  const queue = createTimeSlicedQueue({ budgetMs, now: () => clock, schedule: (callback) => { frames.push(callback); } });
  const work = (log: string[], name: string, cost: number) => () => { log.push(name); clock += cost; };
  const frame = () => frames.shift()?.();
  return { queue, work, frame, frames };
}

describe("time-sliced queue", () => {
  it("runs tasks on later frames, never synchronously inside enqueue", () => {
    const { queue, work, frames } = harness(8);
    const log: string[] = [];
    void queue.enqueue(work(log, "a", 1));
    expect(log).toEqual([]);
    expect(frames).toHaveLength(1);
  });

  it("fits as many tasks as the budget allows per frame and resolves each one", async () => {
    const { queue, work, frame } = harness(8);
    const log: string[] = [];
    const done = ["a", "b", "c", "d"].map((name) => queue.enqueue(work(log, name, 3)));
    frame();
    // a (3 ms) and b (6 ms) start inside the 8 ms budget; c would start at 6 ms < 8 ms too.
    expect(log).toEqual(["a", "b", "c"]);
    expect(queue.pending()).toBe(1);
    frame();
    expect(log).toEqual(["a", "b", "c", "d"]);
    await expect(Promise.all(done)).resolves.toHaveLength(4);
  });

  it("always makes progress: a task larger than the budget runs alone in its frame", () => {
    const { queue, work, frame } = harness(4);
    const log: string[] = [];
    void queue.enqueue(work(log, "huge", 50));
    void queue.enqueue(work(log, "next", 1));
    frame();
    expect(log).toEqual(["huge"]);
    frame();
    expect(log).toEqual(["huge", "next"]);
  });

  it("a failing task rejects its own promise and the queue keeps going", async () => {
    const { queue, work, frame } = harness(8);
    const log: string[] = [];
    const failing = queue.enqueue(() => { throw new Error("lost context"); });
    const next = queue.enqueue(work(log, "next", 1));
    frame();
    await expect(failing).rejects.toThrow("lost context");
    await expect(next).resolves.toBeUndefined();
    expect(log).toEqual(["next"]);
  });

  it("an async task (e.g. waiting for the GPU) holds the queue without holding the frame", async () => {
    const { queue, work, frame, frames } = harness(8);
    const log: string[] = [];
    let release!: () => void;
    const gpu = new Promise<void>((resolve) => { release = resolve; });
    const first = queue.enqueue(async () => { log.push("upload"); await gpu; log.push("gpu done"); });
    void queue.enqueue(work(log, "next", 1));
    frame();
    expect(log).toEqual(["upload"]);
    expect(frames).toHaveLength(0);
    release();
    await first;
    await Promise.resolve();
    expect(frames).toHaveLength(1);
    frame();
    expect(log).toEqual(["upload", "gpu done", "next"]);
  });

  it("idle resolves once everything queued so far has run", async () => {
    const { queue, work, frame } = harness(2);
    const log: string[] = [];
    await expect(queue.idle()).resolves.toBeUndefined();
    void queue.enqueue(work(log, "a", 2));
    void queue.enqueue(work(log, "b", 2));
    let idle = false;
    void queue.idle().then(() => { idle = true; });
    frame();
    await Promise.resolve();
    expect(idle).toBe(false);
    frame();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(idle).toBe(true);
  });
});
