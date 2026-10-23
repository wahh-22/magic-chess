import { createStore } from "zustand/vanilla";

/**
 * Scene loading stages: the critical set (board, pieces, sky, ground, lights) downloads and
 * mounts hidden ("loading"), its GPU programs and textures are prepared in time slices
 * ("warming"), then the scene is revealed ("ready") and the secondary set (scanned nature)
 * streams in behind it without blocking input.
 */
export type SceneStage = "loading" | "warming" | "ready";

export interface StagedLoaderState {
  stage: SceneStage;
  secondary: "waiting" | "loading" | "ready";
  /** "Start game" was pressed before the critical set was ready. */
  startPending: boolean;
  criticalMounted(): void;
  warmed(): void;
  /** Scene content changed (e.g. graphics preset): prepare it again behind the loading screen. */
  rewarm(): void;
  secondaryLoaded(): void;
  /** Runs `action` now if the scene is ready (true), otherwise once it is (false); the latest request wins. */
  requestStart(action: () => void): boolean;
  cancelStart(): void;
}

export function createStagedLoader() {
  let pending: (() => void) | null = null;
  return createStore<StagedLoaderState>()((set, get) => ({
    stage: "loading",
    secondary: "waiting",
    startPending: false,
    criticalMounted() {
      if (get().stage === "loading") set({ stage: "warming" });
    },
    warmed() {
      if (get().stage !== "warming") return;
      set({ stage: "ready", secondary: get().secondary === "waiting" ? "loading" : get().secondary, startPending: false });
      const action = pending;
      pending = null;
      action?.();
    },
    rewarm() {
      if (get().stage === "ready") set({ stage: "warming" });
    },
    secondaryLoaded() {
      if (get().secondary === "loading") set({ secondary: "ready" });
    },
    requestStart(action) {
      if (get().stage === "ready") {
        action();
        return true;
      }
      pending = action;
      set({ startPending: true });
      return false;
    },
    cancelStart() {
      pending = null;
      set({ startPending: false });
    },
  }));
}
