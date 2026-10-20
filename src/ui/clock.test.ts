import { expect, it } from "vitest";
import { createGameStore } from "./gameStore";
import { remainingAt } from "../core/clock";
const local = { mode: "local", humanColor: "w", difficultyId: "casual", timeControl: "10+5" } as const;
it("store switches on application, keeps elapsed times on undo and pauses on menu", () => {
  let now = 0;
  const store = createGameStore({ createEngine: () => { throw Error("unused"); }, now: () => now });
  store.getState().startGame(local);
  now = 2000; store.getState().submitCommand("e4");
  expect(store.getState().clock?.running).toBe("b");
  expect(store.getState().clock?.remaining.w).toBe(603000);
  store.getState().animationDone(); now = 3000; store.getState().undo();
  expect(remainingAt(store.getState().clock!, now)).toEqual({ w: 603000, b: 599000 });
  expect(store.getState().clock?.running).toBe("w");
  store.getState().backToSetup(); now = 10000;
  expect(remainingAt(store.getState().clock!, now).w).toBe(603000);
});
it("rejects moves at flag fall, ends and pauses even during animation", () => {
  let now = 0;
  const store = createGameStore({ createEngine: () => { throw Error("unused"); }, now: () => now });
  store.getState().startGame({ ...local, timeControl: "5+0" });
  now = 300000; store.getState().submitCommand("e4");
  expect(store.getState().game.history()).toEqual([]);
  expect(store.getState().outcome).toEqual({ kind: "timeout", winner: "b" });
  expect(store.getState().clock?.running).toBeNull();
});
it("a terminal move still earns its increment before the clock pauses", () => {
  let now = 0;
  const store = createGameStore({ createEngine: () => { throw Error("unused"); }, now: () => now });
  store.getState().startGame(local);
  for (const move of ["f3", "e5", "g4"]) { store.getState().submitCommand(move); store.getState().animationDone(); }
  now = 1000; store.getState().submitCommand("Qh4#");
  expect(store.getState().clock?.remaining.b).toBe(609000);
  expect(store.getState().clock?.running).toBeNull();
});
it("clock tick ends the game and does not let animation overwrite timeout", () => {
  let now = 0;
  const store = createGameStore({ createEngine: () => { throw Error("unused"); }, now: () => now });
  store.getState().startGame({ ...local, timeControl: "5+0" });
  store.getState().submitCommand("e4"); now = 300000; store.getState().tick();
  store.getState().animationDone();
  expect(store.getState().outcome).toEqual({ kind: "timeout", winner: "w" });
  expect(store.getState().phase).toBe("over");
});
