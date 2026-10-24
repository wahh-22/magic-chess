import type { SceneStage, StagedLoaderState } from "../loading/stagedLoader";

/**
 * The app's screens, AAA style: a title menu with no scene, match setup, then a full-screen
 * loading screen while the match is created, a cinematic reveal, and play. The scene is
 * created at the first start only; back on the title it stays mounted, hidden and idle, so a
 * rematch does not load everything again.
 */
export type MenuScreen = "title" | "setup" | "settings";
export type MatchScreen = "loading" | "reveal" | "playing";
export type FlowScreen = MenuScreen | MatchScreen;
export type SetupMode = "ai" | "local";

export interface FlowState {
  screen: FlowScreen;
  /** The match setup being shown (vs the engine or two players). */
  mode: SetupMode;
  /** The canvas and scene exist (created at the first start, kept for the session). */
  sceneMounted: boolean;
  /** Starts so far: picks the loading art and the first tip. */
  matchCount: number;
}

export type FlowEvent =
  | { type: "setup"; mode: SetupMode }
  | { type: "settings" }
  | { type: "back" }
  | { type: "start" }
  | { type: "loaded" }
  | { type: "revealed" }
  | { type: "menu" };

export const initialFlow: FlowState = { screen: "title", mode: "ai", sceneMounted: false, matchCount: 0 };

export const isMenuScreen = (screen: FlowScreen): screen is MenuScreen =>
  screen === "title" || screen === "setup" || screen === "settings";

/** Events outside their screen are ignored (the same state object comes back). */
export function flowReducer(state: FlowState, event: FlowEvent): FlowState {
  switch (event.type) {
    case "setup":
      return state.screen === "title" ? { ...state, screen: "setup", mode: event.mode } : state;
    case "settings":
      return state.screen === "title" ? { ...state, screen: "settings" } : state;
    case "back":
      return state.screen === "setup" || state.screen === "settings" ? { ...state, screen: "title" } : state;
    case "start":
      return state.screen === "title" || state.screen === "setup"
        ? { ...state, screen: "loading", sceneMounted: true, matchCount: state.matchCount + 1 }
        : state;
    case "loaded":
      return state.screen === "loading" ? { ...state, screen: "reveal" } : state;
    case "revealed":
      return state.screen === "reveal" ? { ...state, screen: "playing" } : state;
    case "menu":
      return state.screen === "reveal" || state.screen === "playing" ? { ...state, screen: "title" } : state;
  }
}

/** How long the reveal may wait for the secondary set (scanned nature) after the critical set is ready. */
export const SECONDARY_WAIT_MS = 12000;

export type EngineStatus = "none" | "pending" | "ready" | "failed";

/**
 * The loading screen gives way when the critical scene is prepared, Stockfish has answered
 * (vs the engine; a failed start is retried on its turn and reported there), and the
 * secondary set is prepared too — or has had its time: it can still dissolve in afterwards.
 */
export function readyToReveal({ scene, engine, secondary, secondaryWaitMs }: {
  scene: SceneStage;
  engine: EngineStatus;
  secondary: StagedLoaderState["secondary"];
  /** Time since the critical scene became ready. */
  secondaryWaitMs: number;
}): boolean {
  if (scene !== "ready" || engine === "pending") return false;
  return secondary === "ready" || secondaryWaitMs >= SECONDARY_WAIT_MS;
}
