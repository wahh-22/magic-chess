import { describe, expect, it } from "vitest";
import { waitForGpu, type FenceContext } from "./gpuFence";

function fakeGl(signalAfterPolls: number) {
  let polls = 0;
  const log: string[] = [];
  const gl: FenceContext = {
    SYNC_GPU_COMMANDS_COMPLETE: 1, TIMEOUT_EXPIRED: 2, ALREADY_SIGNALED: 3, CONDITION_SATISFIED: 4, WAIT_FAILED: 5,
    fenceSync: () => { log.push("fence"); return {} as WebGLSync; },
    flush: () => { log.push("flush"); },
    // A zero timeout never blocks (WebGL 2 forbids longer client waits).
    clientWaitSync: (_sync, _flags, timeout) => { log.push(`wait ${timeout}`); return ++polls > signalAfterPolls ? 3 : 2; },
    deleteSync: () => { log.push("delete"); },
    isContextLost: () => false,
  };
  return { gl, log, polls: () => polls };
}

describe("waitForGpu", () => {
  it("polls the fence on later tasks (never blocking) and frees it once the GPU has caught up", async () => {
    const { gl, log, polls } = fakeGl(2);
    const ticks: (() => void)[] = [];
    let settled = false;
    const done = waitForGpu(gl, (poll) => { ticks.push(poll); }).then(() => { settled = true; });
    expect(log).toEqual(["fence", "flush"]);
    expect(polls()).toBe(0);
    while (ticks.length) ticks.shift()!();
    await done;
    expect(settled).toBe(true);
    expect(polls()).toBe(3);
    expect(log.filter((entry) => entry.startsWith("wait"))).toEqual(["wait 0", "wait 0", "wait 0"]);
    expect(log.at(-1)).toBe("delete");
  });

  it("resolves at once without fences (WebGL 1) and when the context is lost", async () => {
    await expect(waitForGpu({} as FenceContext)).resolves.toBeUndefined();
    const { gl } = fakeGl(1000);
    gl.isContextLost = () => true;
    await expect(waitForGpu(gl, (poll) => poll())).resolves.toBeUndefined();
  });
});
