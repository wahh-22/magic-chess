import { expect, it } from "vitest";
import { startClock, switchClock, pauseClock, resumeClock, remainingAt, flagFall, formatTime } from "./clock";
import { GameState } from "./GameState";
it("formats clocks as mm:ss and tenths below ten seconds", () => {
  expect(formatTime(61000)).toBe("01:01");
  expect(formatTime(9900)).toBe("00:09.9");
  expect(formatTime(0)).toBe("00:00.0");
});
it("none has no clock", () => expect(startClock("none", "w", 0)).toBeNull());
it("switches, increments, pauses and resumes with injected time", () => {
  let clock = startClock("10+5", "w", 100)!;
  clock = switchClock(clock, "b", 2100);
  expect(remainingAt(clock, 3100)).toEqual({ w: 603000, b: 599000 });
  clock = pauseClock(clock, 3100);
  expect(remainingAt(clock, 9000)).toEqual({ w: 603000, b: 599000 });
  clock = resumeClock(clock, "b", 10000);
  expect(remainingAt(clock, 11000).b).toBe(598000);
});
it("flags exactly at zero and adjudicates the opponent's material only", () => {
  const clock = startClock("5+0", "w", 0)!;
  expect(flagFall(clock, 299999, new GameState().pieces())).toBeNull();
  expect(flagFall(clock, 300000, new GameState().pieces())).toEqual({ kind: "timeout", winner: "b" });
  for (const material of ["k7", "kb6", "kn6"]) {
    const game = new GameState(`${material}/8/8/8/8/8/8/4K2R w - - 0 1`);
    expect(flagFall(clock, 300000, game.pieces())).toEqual({ kind: "timeout-draw" });
  }
});
