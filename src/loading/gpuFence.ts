/** The WebGL 2 sync API (absent on WebGL 1 contexts). */
export interface FenceContext {
  SYNC_GPU_COMMANDS_COMPLETE?: number;
  TIMEOUT_EXPIRED?: number;
  ALREADY_SIGNALED?: number;
  CONDITION_SATISFIED?: number;
  WAIT_FAILED?: number;
  fenceSync?(condition: number, flags: number): WebGLSync | null;
  clientWaitSync?(sync: WebGLSync, flags: number, timeout: number): number;
  deleteSync?(sync: WebGLSync): void;
  flush?(): void;
  isContextLost?(): boolean;
}

const later = (poll: () => void) => { setTimeout(poll, 4); };

/**
 * Resolves once the GPU has finished every command issued so far, without blocking: a fence
 * is polled on later tasks with a zero-timeout client wait (WebGL 2 never lets it block;
 * Chrome refreshes getSyncParameter only as frames are produced, which a paused canvas does
 * not). GPU work such as uploads, mipmaps, environment maps and program links then runs
 * while the main thread keeps handling input, instead of stalling the next WebGL call that
 * needs a result.
 */
export function waitForGpu(gl: FenceContext, schedule: (poll: () => void) => void = later): Promise<void> {
  const sync = gl.fenceSync?.(gl.SYNC_GPU_COMMANDS_COMPLETE!, 0);
  if (!sync) return Promise.resolve();
  gl.flush?.();
  return new Promise((resolve) => {
    const poll = () => {
      if (gl.isContextLost?.() || gl.clientWaitSync!(sync, 0, 0) !== gl.TIMEOUT_EXPIRED) {
        gl.deleteSync?.(sync);
        resolve();
        return;
      }
      schedule(poll);
    };
    schedule(poll);
  });
}
