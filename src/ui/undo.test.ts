import { expect, it, vi } from "vitest";
import { canUndo, createGameStore } from "./gameStore";
const local = { mode: "local", humanColor: "w", difficultyId: "casual" } as const;
const make = () => createGameStore({ createEngine: () => ({ newGame: async () => {}, bestMove: vi.fn(async () => "e7e5"), dispose() {} }) });
it("local undo is gated, restores presentation and clears selection", () => {
  const store = make();
  expect(canUndo(store.getState())).toBe(false);
  store.getState().startGame(local);
  expect(canUndo(store.getState())).toBe(false);
  const pieces = store.getState().game.pieces();
  store.getState().submitCommand("e4");
  expect(canUndo(store.getState())).toBe(false);
  store.getState().animationDone();
  store.getState().selectSquare("e7");
  const version = store.getState().positionVersion;
  store.getState().undo();
  expect(store.getState().displayedPieces).toEqual(pieces);
  expect(store.getState().selected).toBeNull();
  expect(store.getState().positionVersion).toBeGreaterThan(version);
});
it("AI undo requires a completed pair and returns the human turn", async () => {
  const store = make();
  store.getState().startGame({ ...local, mode: "ai" });
  store.getState().submitCommand("e4");
  store.getState().animationDone();
  expect(canUndo(store.getState())).toBe(false);
  for (let i = 0; i < 8; i++) await Promise.resolve();
  expect(canUndo(store.getState())).toBe(false);
  store.getState().animationDone();
  expect(canUndo(store.getState())).toBe(true);
  store.getState().undo();
  expect(store.getState().game.history()).toEqual([]);
  expect(store.getState().game.turn()).toBe("w");
});
it("an outstanding old AI result cannot mutate a position after undo", async () => {
  let resolve!: (uci: string) => void;
  const store = createGameStore({ createEngine: () => ({ newGame: async () => {},
    bestMove: () => new Promise<string>((done) => { resolve = done; }), dispose() {} }) });
  store.getState().startGame({ ...local, mode: "ai", humanColor: "b" });
  for (let i = 0; i < 8; i++) await Promise.resolve();
  store.getState().startGame(local);
  store.getState().submitCommand("d4"); store.getState().animationDone();
  const id = store.getState().gameId; store.getState().undo();
  expect(store.getState().gameId).toBeGreaterThan(id);
  resolve("e2e4");
  for (let i = 0; i < 8; i++) await Promise.resolve();
  expect(store.getState().game.history()).toEqual([]);
  expect(store.getState().animationQueue).toEqual([]);
});
it("undo reopens a finished local game", () => {
  const store = make(); store.getState().startGame(local);
  for (const move of ["f3", "e5", "g4", "Qh4#"]) { store.getState().submitCommand(move); store.getState().animationDone(); }
  expect(store.getState().phase).toBe("over");
  store.getState().undo();
  expect(store.getState().phase).toBe("playing");
  expect(store.getState().outcome).toBeNull();
});
