import { expect, it } from "vitest";
import { createGameStore } from "./gameStore";
import { SAVE_KEY, readSave } from "./persistence";
const local = { mode: "local", humanColor: "w", difficultyId: "casual", timeControl: "5+0" } as const;
function storage() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
}
it("corrupt and incompatible autosaves are removed safely", () => {
  const disk = storage();
  for (const text of ["{", '{"version":99}', '{"version":1,"moves":["x"]}', 'null']) {
    disk.setItem(SAVE_KEY, text); expect(readSave(disk)).toBeNull(); expect(disk.getItem(SAVE_KEY)).toBeNull();
  }
});
it("autosaves on move and undo, continues with exact ids and paused offline time", () => {
  const disk = storage(); let now = 0;
  const deps = { storage: disk, now: () => now, createEngine: () => { throw Error("unused"); } };
  const first = createGameStore(deps); first.getState().startGame(local);
  now = 1000; first.getState().submitCommand("e4");
  const pieces = first.getState().game.pieces();
  now = 100000;
  const loaded = createGameStore(deps);
  expect(loaded.getState().hasSavedGame).toBe(true);
  loaded.getState().continueGame();
  expect(loaded.getState().displayedPieces).toEqual(pieces);
  expect(loaded.getState().clock?.remaining).toEqual({ w: 299000, b: 300000 });
  loaded.getState().undo();
  expect(readSave(disk)?.game.history()).toEqual([]);
  loaded.getState().startGame({ ...local, timeControl: "none" });
  expect(readSave(disk)?.clock).toBeNull();
});
it("menu preserves unfinished save and game end no longer offers Continue", () => {
  const disk = storage();
  const store = createGameStore({ storage: disk, createEngine: () => { throw Error("unused"); } });
  store.getState().startGame({ ...local, timeControl: "none" });
  store.getState().submitCommand("f3"); store.getState().animationDone(); store.getState().backToSetup();
  expect(store.getState().hasSavedGame).toBe(true); store.getState().continueGame();
  for (const move of ["e5", "g4", "Qh4#"]) { store.getState().submitCommand(move); store.getState().animationDone(); }
  expect(readSave(disk)?.phase).toBe("over");
  expect(store.getState().hasSavedGame).toBe(false);
});
it("storage denial never interrupts play", () => {
  const denied = { getItem() { throw Error("denied"); }, setItem() { throw Error("denied"); }, removeItem() { throw Error("denied"); } };
  const store = createGameStore({ storage: denied, createEngine: () => { throw Error("unused"); } });
  store.getState().startGame(local); store.getState().submitCommand("e4"); store.getState().animationDone();
  expect(store.getState().game.history()).toEqual(["e4"]);
  expect(store.getState().hasSavedGame).toBe(false);
});
it("timeout saves remain finished across repeated Menu actions", () => {
  const disk = storage(); let now = 0;
  const store = createGameStore({ storage: disk, now: () => now, createEngine: () => { throw Error("unused"); } });
  store.getState().startGame(local); now = 300000; store.getState().tick();
  store.getState().backToSetup(); store.getState().backToSetup();
  expect(readSave(disk)?.outcome).toEqual({ kind: "timeout", winner: "b" });
  expect(store.getState().hasSavedGame).toBe(false);
});
it("PGN import is local with no clock and invalid PGN leaves the game unchanged", () => {
  const store = createGameStore({ storage: storage(), createEngine: () => { throw Error("unused"); } });
  expect(store.getState().importPgn("1. e4 e5 2. Nf3 *")).toBeNull();
  expect(store.getState().settings.mode).toBe("local");
  expect(store.getState().clock).toBeNull();
  const fen = store.getState().game.fen();
  expect(store.getState().importPgn("banana")).toMatch(/Invalid PGN/);
  expect(store.getState().game.fen()).toBe(fen);
});
