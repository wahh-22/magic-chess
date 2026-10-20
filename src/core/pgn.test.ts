import { expect, it } from "vitest";
import { GameState } from "./GameState";
import { exportPgn, importPgn } from "./pgn";
it("PGN export/import round trip preserves history and piece ids", () => {
  const game = new GameState();
  for (const uci of ["e2e4", "d7d5", "e4d5", "d8d5", "b1c3"]) game.applyMove({ from: uci.slice(0, 2), to: uci.slice(2, 4) });
  const text = exportPgn(game, { white: "You", black: "Stockfish (Casual)", date: new Date(2026, 5, 29) });
  expect(text).toContain('[Event "Magic Chess"]');
  expect(text).toContain('[Date "2026.06.29"]');
  const loaded = importPgn(text);
  expect(loaded.history()).toEqual(game.history());
  expect(loaded.pieces()).toEqual(game.pieces());
});
it.each([
  "1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O *",
  "1. e4 a6 2. e5 d5 3. exd6 *",
  "1. h4 g5 2. hxg5 h6 3. gxh6 Nf6 4. h7 Ng8 5. hxg8=Q *",
])("PGN round trip preserves special moves: %s", (text) => {
  const game = importPgn(text);
  const roundTrip = importPgn(exportPgn(game, { white: "White", black: "Black", date: new Date(0) }));
  expect(roundTrip.fen()).toBe(game.fen());
  expect(roundTrip.pieces()).toEqual(game.pieces());
  expect(roundTrip.history()).toEqual(game.history());
});
it("invalid PGN has a readable error", () => expect(() => importPgn("1. e4 banana")).toThrow(/Invalid PGN/));
