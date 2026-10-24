import { describe, expect, it } from "vitest";
import { flowReducer, initialFlow, isMenuScreen, readyToReveal, SECONDARY_WAIT_MS, type FlowEvent, type FlowState } from "./flow";

const run = (events: FlowEvent[], state: FlowState = initialFlow) => events.reduce(flowReducer, state);

describe("app flow", () => {
  it("starts on the title with no scene", () => {
    expect(initialFlow).toMatchObject({ screen: "title", sceneMounted: false, matchCount: 0 });
    expect(isMenuScreen(initialFlow.screen)).toBe(true);
  });

  it("goes title → setup → loading → reveal → playing → title, mounting the scene only at start", () => {
    let state = run([{ type: "setup", mode: "local" }]);
    expect(state).toMatchObject({ screen: "setup", mode: "local", sceneMounted: false });
    state = flowReducer(state, { type: "start" });
    expect(state).toMatchObject({ screen: "loading", sceneMounted: true, matchCount: 1 });
    expect(isMenuScreen(state.screen)).toBe(false);
    state = flowReducer(state, { type: "loaded" });
    expect(state.screen).toBe("reveal");
    state = flowReducer(state, { type: "revealed" });
    expect(state.screen).toBe("playing");
    state = flowReducer(state, { type: "menu" });
    // The scene stays mounted (hidden) for a fast rematch.
    expect(state).toMatchObject({ screen: "title", sceneMounted: true });
    state = run([{ type: "setup", mode: "ai" }, { type: "start" }], state);
    expect(state).toMatchObject({ screen: "loading", mode: "ai", matchCount: 2 });
  });

  it("Back (Escape) returns from setup and settings to the title, and nowhere else", () => {
    expect(run([{ type: "setup", mode: "ai" }, { type: "back" }]).screen).toBe("title");
    expect(run([{ type: "settings" }, { type: "back" }]).screen).toBe("title");
    expect(run([{ type: "back" }])).toBe(initialFlow);
    const playing = run([{ type: "start" }, { type: "loaded" }, { type: "revealed" }]);
    expect(flowReducer(playing, { type: "back" })).toBe(playing);
  });

  it("starts straight from the title (Continue game, Import PGN)", () => {
    expect(run([{ type: "start" }])).toMatchObject({ screen: "loading", sceneMounted: true });
  });

  it("ignores events that do not belong to the current screen", () => {
    const loading = run([{ type: "start" }]);
    for (const event of [{ type: "start" }, { type: "setup", mode: "ai" }, { type: "settings" }, { type: "revealed" }, { type: "menu" }] as FlowEvent[]) {
      expect(flowReducer(loading, event)).toBe(loading);
    }
    expect(flowReducer(initialFlow, { type: "loaded" })).toBe(initialFlow);
    expect(flowReducer(initialFlow, { type: "menu" })).toBe(initialFlow);
    const settings = run([{ type: "settings" }]);
    expect(flowReducer(settings, { type: "start" })).toBe(settings);
    expect(flowReducer(settings, { type: "setup", mode: "ai" })).toBe(settings);
  });

  it("returns to the title from the reveal too (Menu pressed while the camera arrives)", () => {
    expect(run([{ type: "start" }, { type: "loaded" }, { type: "menu" }]).screen).toBe("title");
  });
});

describe("readyToReveal", () => {
  const ready = { scene: "ready", engine: "none", secondary: "ready", secondaryWaitMs: 0 } as const;

  it("waits for the critical scene", () => {
    expect(readyToReveal({ ...ready, scene: "loading" })).toBe(false);
    expect(readyToReveal({ ...ready, scene: "warming" })).toBe(false);
    expect(readyToReveal(ready)).toBe(true);
  });

  it("waits for Stockfish in a game vs the engine; a failed start does not hold the game back", () => {
    expect(readyToReveal({ ...ready, engine: "pending" })).toBe(false);
    expect(readyToReveal({ ...ready, engine: "ready" })).toBe(true);
    expect(readyToReveal({ ...ready, engine: "failed" })).toBe(true);
  });

  it("waits for the secondary set, but not forever", () => {
    expect(readyToReveal({ ...ready, secondary: "loading", secondaryWaitMs: 0 })).toBe(false);
    expect(readyToReveal({ ...ready, secondary: "waiting", secondaryWaitMs: SECONDARY_WAIT_MS - 1 })).toBe(false);
    expect(readyToReveal({ ...ready, secondary: "loading", secondaryWaitMs: SECONDARY_WAIT_MS })).toBe(true);
  });
});
