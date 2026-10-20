import { expect, it } from "vitest";
import { GameState } from "./GameState";

it.each([
  [undefined, "e2e4"],
  ["4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1", "e5d6"],
  ["4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1", "e1g1"],
  ["4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1", "e1c1"],
  ["1r2k3/P7/8/8/8/8/8/4K3 w - - 0 1", "a7b8q"],
])("undo restores exact position and piece identities: %s %s", (fen, uci) => {
  const game = new GameState(fen);
  const before = { fen: game.fen(), pieces: game.pieces() };
  expect(game.applyMove({ from: uci!.slice(0, 2), to: uci!.slice(2, 4), promotion: uci![4] as "q" | undefined }).ok).toBe(true);
  expect(game.undo()).not.toBeNull();
  expect({ fen: game.fen(), pieces: game.pieces() }).toEqual(before);
  expect(game.undo()).toBeNull();
});
