import { describe, expect, it, vi } from "vitest";
import { GameState } from "../core/GameState";
import type { Engine } from "../core/engine/Engine";
import { createGameStore } from "./gameStore";

const local = { mode: "local", humanColor: "w", difficultyId: "casual" } as const;
const ai = { ...local, mode: "ai" } as const;
function setup() {
  const requests: { resolve: (uci: string) => void; reject: (error: Error) => void }[] = [];
  const engine: Engine = {
    newGame: vi.fn(async () => {}),
    bestMove: vi.fn(() => new Promise<string>((resolve, reject) => requests.push({ resolve, reject }))),
    dispose: vi.fn(),
  };
  const createEngine = vi.fn(() => engine);
  return { store: createGameStore({ createEngine }), engine, createEngine, requests };
}
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

describe("gameStore", () => {
  it("selects, reselects, clears, enqueues a move and blocks input until animationDone", () => {
    const { store, createEngine } = setup();
    store.getState().startGame(local);
    const before = store.getState().displayedPieces;
    store.getState().selectSquare("e7");
    expect(store.getState().selected).toBeNull();
    store.getState().selectSquare("e2");
    expect(store.getState().legalTargets.map((move) => move.to)).toEqual(expect.arrayContaining(["e3", "e4"]));
    store.getState().selectSquare("d2");
    expect(store.getState().selected).toBe("d2");
    store.getState().selectSquare("a5");
    expect(store.getState().selected).toBeNull();
    store.getState().selectSquare("e2");
    store.getState().selectSquare("e4");
    expect(store.getState().animationQueue).toHaveLength(1);
    expect(store.getState().displayedPieces).toEqual(before);
    const fen = store.getState().game.fen();
    store.getState().selectSquare("e7");
    store.getState().submitCommand("e7e5");
    expect(store.getState().game.fen()).toBe(fen);
    store.getState().animationDone();
    expect(store.getState().animationQueue).toHaveLength(0);
    expect(store.getState().displayedPieces.find((piece) => piece.square === "e4")?.type).toBe("p");
    store.getState().selectSquare("e7");
    expect(store.getState().selected).toBe("e7");
    expect(createEngine).not.toHaveBeenCalled();
  });

  it("illegal commands set lastError without changing the position or queue", () => {
    const { store } = setup();
    store.getState().startGame(local);
    const fen = store.getState().game.fen();
    store.getState().submitCommand("e2e5");
    expect(store.getState().lastError).toBe("illegal");
    expect(store.getState().game.fen()).toBe(fen);
    expect(store.getState().animationQueue).toEqual([]);
  });

  it("prompts for promotion, supports cancellation, then enqueues the chosen piece", () => {
    const { store } = setup();
    store.getState().startGame(local);
    const game = new GameState("4k3/P7/8/8/8/8/8/4K3 w - - 0 1");
    store.setState({ game, displayedPieces: game.pieces() });
    store.getState().submitCommand("a7a8");
    expect(store.getState().pendingPromotion).toEqual({ from: "a7", to: "a8" });
    expect(store.getState().animationQueue).toEqual([]);
    store.getState().cancelPromotion();
    expect(store.getState().pendingPromotion).toBeNull();
    store.getState().submitCommand("a7a8");
    store.getState().choosePromotion("n");
    expect(store.getState().pendingPromotion).toBeNull();
    expect(store.getState().animationQueue[0]?.promotion).toBe("n");
  });

  it("requests an AI reply only after animationDone and enqueues it before displaying it", async () => {
    const { store, engine, requests } = setup();
    store.getState().startGame(ai);
    store.getState().submitCommand("e4");
    await flush();
    expect(engine.bestMove).not.toHaveBeenCalled();
    store.getState().animationDone();
    expect(store.getState().aiThinking).toBe(true);
    const fen = store.getState().game.fen();
    store.getState().submitCommand("e5");
    expect(store.getState().game.fen()).toBe(fen);
    await flush();
    expect(engine.bestMove).toHaveBeenCalledWith(fen, expect.objectContaining({ id: "casual" }));
    requests[0]!.resolve("e7e5");
    await flush();
    expect(store.getState().animationQueue[0]?.uci).toBe("e7e5");
    expect(store.getState().aiThinking).toBe(false);
    expect(store.getState().displayedPieces.some((piece) => piece.square === "e7")).toBe(true);
    store.getState().animationDone();
    expect(store.getState().displayedPieces.some((piece) => piece.square === "e5")).toBe(true);
  });

  it("starts the AI first for a black human and reuses the lazily created engine", async () => {
    const { store, engine, createEngine, requests } = setup();
    expect(createEngine).not.toHaveBeenCalled();
    store.getState().startGame({ ...ai, humanColor: "b" });
    await flush();
    expect(engine.newGame).toHaveBeenCalledTimes(1);
    expect(engine.bestMove).toHaveBeenCalledTimes(1);
    requests[0]!.resolve("e2e4");
    await flush();
    expect(store.getState().animationQueue[0]?.uci).toBe("e2e4");
    store.getState().startGame(ai);
    await flush();
    expect(createEngine).toHaveBeenCalledTimes(1);
    expect(engine.newGame).toHaveBeenCalledTimes(2);
  });

  it.each(["new game", "setup"])("discards stale AI results after %s", async (transition) => {
    const { store, requests } = setup();
    store.getState().startGame({ ...ai, humanColor: "b" });
    await flush();
    const oldId = store.getState().gameId;
    if (transition === "setup") store.getState().backToSetup();
    else store.getState().startGame(local);
    const fen = store.getState().game.fen();
    requests[0]!.resolve("e2e4");
    await flush();
    expect(store.getState().gameId).toBeGreaterThan(oldId);
    expect(store.getState().game.fen()).toBe(fen);
    expect(store.getState().animationQueue).toEqual([]);
    expect(store.getState().aiThinking).toBe(false);
  });

  it("reports engine rejection and releases the thinking lock", async () => {
    const { store, requests } = setup();
    store.getState().startGame({ ...ai, humanColor: "b" });
    await flush();
    requests[0]!.reject(new Error("engine failed"));
    await flush();
    expect(store.getState().lastError).toBe("engine failed");
    expect(store.getState().aiThinking).toBe(false);
  });

  it("retries a rejected AI move and enqueues the successful retry", async () => {
    const { store, engine, requests } = setup();
    store.getState().startGame({ ...ai, humanColor: "b" });
    await flush();
    requests[0]!.reject(new Error("temporary failure"));
    await flush();
    store.getState().retryAiMove();
    expect(store.getState().lastError).toBeNull();
    expect(store.getState().aiThinking).toBe(true);
    store.getState().retryAiMove();
    await flush();
    expect(engine.bestMove).toHaveBeenCalledTimes(2);
    requests[1]!.resolve("e2e4");
    await flush();
    expect(store.getState().animationQueue[0]?.uci).toBe("e2e4");
    expect(store.getState().lastError).toBeNull();
  });

  it("retry is a no-op on a human turn, including an input error", async () => {
    const { store, engine } = setup();
    store.getState().startGame(ai);
    store.getState().submitCommand("e2e5");
    store.getState().retryAiMove();
    await flush();
    expect(store.getState().lastError).toBe("illegal");
    expect(engine.bestMove).not.toHaveBeenCalled();
  });

  it.each(["no error", "queued", "thinking", "over", "setup"] as const)("retry is a no-op when %s", async (guard) => {
    const { store, engine } = setup();
    store.getState().startGame(ai);
    store.getState().submitCommand("e4");
    store.setState({
      lastError: guard === "no error" ? null : "engine failed",
      animationQueue: guard === "queued" ? store.getState().animationQueue : [],
      aiThinking: guard === "thinking",
      phase: guard === "over" || guard === "setup" ? guard : "playing",
    });
    const before = store.getState();
    store.getState().retryAiMove();
    await flush();
    expect(store.getState()).toBe(before);
    expect(engine.bestMove).not.toHaveBeenCalled();
  });

  it("retry recovers from failed engine initialization", async () => {
    const { store, engine, requests } = setup();
    vi.mocked(engine.newGame).mockRejectedValueOnce(new Error("initialization failed"));
    store.getState().startGame({ ...ai, humanColor: "b" });
    await flush();
    store.getState().retryAiMove();
    await flush();
    expect(engine.newGame).toHaveBeenCalledTimes(2);
    requests[0]!.resolve("e2e4");
    await flush();
    expect(store.getState().animationQueue[0]?.uci).toBe("e2e4");
  });

  // CI smoke (PR #7): Stockfish's handshake timed out while the scene loaded; the human's move
  // cleared the error and the AI never moved again, with no retry button left. The AI's turn now
  // retries initialization once.
  it("retries a failed initialization when the AI's turn comes, then plays", async () => {
    const { store, engine, requests } = setup();
    vi.mocked(engine.newGame).mockRejectedValueOnce(new Error("Engine timed out"));
    store.getState().startGame(ai);
    await flush();
    expect(store.getState().lastError).toBe("Engine timed out");
    store.getState().submitCommand("e4");
    store.getState().animationDone();
    await flush();
    expect(engine.newGame).toHaveBeenCalledTimes(2);
    expect(store.getState().aiThinking).toBe(true);
    requests[0]!.resolve("e7e5");
    await flush();
    expect(store.getState().animationQueue[0]?.uci).toBe("e7e5");
    expect(store.getState().lastError).toBeNull();
  });

  it("reports a second initialization failure, releasing the lock so the player can retry", async () => {
    const { store, engine } = setup();
    vi.mocked(engine.newGame).mockRejectedValueOnce(new Error("Engine timed out")).mockRejectedValueOnce(new Error("Engine timed out"));
    store.getState().startGame(ai);
    await flush();
    store.getState().submitCommand("e4");
    store.getState().animationDone();
    await flush();
    expect(engine.newGame).toHaveBeenCalledTimes(2);
    expect(store.getState().aiThinking).toBe(false);
    expect(store.getState().lastError).toBe("Engine timed out");
    expect(engine.bestMove).not.toHaveBeenCalled();
  });

  it("ignores stale engine failures without clearing a newer game's thinking lock", async () => {
    const { store, requests } = setup();
    store.getState().startGame({ ...ai, humanColor: "b" });
    await flush();
    store.getState().startGame({ ...ai, humanColor: "b" });
    await flush();
    requests[0]!.reject(new Error("old failure"));
    await flush();
    expect(store.getState().lastError).toBeNull();
    expect(store.getState().aiThinking).toBe(true);
    requests[1]!.resolve("d2d4");
    await flush();
    expect(store.getState().animationQueue[0]?.uci).toBe("d2d4");
  });

  it("applies the promotion suffix from an AI UCI result", async () => {
    const { store, requests } = setup();
    store.getState().startGame(ai);
    const game = new GameState("4k3/8/8/8/8/8/p7/4K3 w - - 0 1");
    store.setState({ game, displayedPieces: game.pieces() });
    store.getState().submitCommand("Kd2");
    store.getState().animationDone();
    await flush();
    requests[0]!.resolve("a2a1q");
    await flush();
    expect(store.getState().animationQueue[0]?.promotion).toBe("q");
    store.getState().animationDone();
    expect(store.getState().displayedPieces.find((piece) => piece.square === "a1")?.type).toBe("q");
  });

  it("local mode allows both colors and reports checkmate only after the final animation", () => {
    const { store } = setup();
    store.getState().startGame(local);
    for (const command of ["f3", "e5", "g4"]) {
      store.getState().submitCommand(command);
      store.getState().animationDone();
    }
    store.getState().submitCommand("Qh4#");
    expect(store.getState().phase).toBe("playing");
    expect(store.getState().outcome).toBeNull();
    store.getState().animationDone();
    expect(store.getState().phase).toBe("over");
    expect(store.getState().outcome).toEqual({ kind: "checkmate", winner: "b" });
    const fen = store.getState().game.fen();
    store.getState().submitCommand("a3");
    expect(store.getState().game.fen()).toBe(fen);
    store.getState().backToSetup();
    store.getState().selectSquare("a2");
    expect(store.getState().phase).toBe("setup");
    expect(store.getState().selected).toBeNull();
  });
});
