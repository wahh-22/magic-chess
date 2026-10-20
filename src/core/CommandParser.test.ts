import { describe, expect, it } from "vitest";
import { parseCommand } from "./CommandParser";
import { GameState } from "./GameState";

function parse(text: string, fen?: string) {
  return parseCommand(text, new GameState(fen).legalMoves());
}

const PROMOTION_FEN = "8/4P3/8/8/8/8/k7/4K3 w - - 0 1";
// Knights on b1 and f3 can both reach d2.
const TWO_KNIGHTS_FEN = "4k3/8/8/8/8/5N2/8/1N2K3 w - - 0 1";
const PAWN_CAPTURES_FEN = "4k3/8/8/3p4/2P1P3/8/8/4K3 w - - 0 1";

describe("parseCommand — coordinates", () => {
  it.each(["e2e4", "E2E4", "e2-e4", "e2 e4", "e2 to e4", "e2 a e4", "  e2e4  "])("accepts %j", (text) => {
    expect(parse(text)).toEqual({ ok: true, move: { from: "e2", to: "e4" } });
  });

  it("accepts a promotion suffix", () => {
    expect(parse("e7e8q", PROMOTION_FEN)).toEqual({ ok: true, move: { from: "e7", to: "e8", promotion: "q" } });
    expect(parse("e7-e8=N", PROMOTION_FEN)).toEqual({ ok: true, move: { from: "e7", to: "e8", promotion: "n" } });
  });

  it("asks for the promotion piece when it is missing", () => {
    expect(parse("e7e8", PROMOTION_FEN)).toEqual({ ok: false, error: "promotion-required", from: "e7", to: "e8" });
  });

  it("rejects illegal coordinate moves", () => {
    expect(parse("e2e5")).toEqual({ ok: false, error: "illegal" });
    expect(parse("e7e8q")).toEqual({ ok: false, error: "illegal" });
  });
});

describe("parseCommand — algebraic notation", () => {
  it.each([
    ["Nf3", { from: "g1", to: "f3" }],
    ["nf3", { from: "g1", to: "f3" }],
    ["e4", { from: "e2", to: "e4" }],
    ["Nf3+", { from: "g1", to: "f3" }],
  ])("accepts %j", (text, move) => {
    expect(parse(text)).toEqual({ ok: true, move });
  });

  it("accepts captures with or without the x", () => {
    expect(parse("exd5", PAWN_CAPTURES_FEN)).toEqual({ ok: true, move: { from: "e4", to: "d5" } });
    expect(parse("ed5", PAWN_CAPTURES_FEN)).toEqual({ ok: true, move: { from: "e4", to: "d5" } });
  });

  it.each(["O-O", "0-0", "o-o"])("accepts castling %j", (text) => {
    expect(parse(text, "4k3/8/8/8/8/8/8/4K2R w K - 0 1")).toEqual({ ok: true, move: { from: "e1", to: "g1" } });
  });

  it("accepts long castling", () => {
    expect(parse("O-O-O", "4k3/8/8/8/8/8/8/R3K3 w Q - 0 1")).toEqual({ ok: true, move: { from: "e1", to: "c1" } });
  });

  it("accepts promotions", () => {
    expect(parse("e8=Q", PROMOTION_FEN)).toEqual({ ok: true, move: { from: "e7", to: "e8", promotion: "q" } });
    expect(parse("e8R", PROMOTION_FEN)).toEqual({ ok: true, move: { from: "e7", to: "e8", promotion: "r" } });
    expect(parse("e8", PROMOTION_FEN)).toEqual({ ok: false, error: "promotion-required", from: "e7", to: "e8" });
  });

  it("reports ambiguity and accepts the disambiguated form", () => {
    expect(parse("Nd2", TWO_KNIGHTS_FEN)).toEqual({ ok: false, error: "ambiguous" });
    expect(parse("dxd5", PAWN_CAPTURES_FEN)).toEqual({ ok: false, error: "illegal" });
    expect(parse("d5", PAWN_CAPTURES_FEN)).toEqual({ ok: false, error: "ambiguous" });
    expect(parse("Nbd2", TWO_KNIGHTS_FEN)).toEqual({ ok: true, move: { from: "b1", to: "d2" } });
  });

  it("rejects illegal notation moves", () => {
    expect(parse("Nf6")).toEqual({ ok: false, error: "illegal" });
    expect(parse("O-O")).toEqual({ ok: false, error: "illegal" });
  });
});

describe("parseCommand — invalid input", () => {
  it("rejects empty input", () => {
    expect(parse("   ")).toEqual({ ok: false, error: "empty" });
  });

  it.each(["hello", "z9z9", "e2e4e5"])("rejects unrecognized %j", (text) => {
    expect(parse(text)).toEqual({ ok: false, error: "unrecognized" });
  });
});
