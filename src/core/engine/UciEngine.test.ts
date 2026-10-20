import { describe, expect, it } from "vitest";
import { DIFFICULTIES, type Difficulty } from "./difficulty";
import { UciEngine, type UciTransport } from "./UciEngine";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/** Scripted stand-in for the Stockfish worker. */
class FakeTransport implements UciTransport {
  sent: string[] = [];
  terminated = false;
  bestMoves = ["e2e4", "d2d4"];
  autoReplyToGo = true;
  private listener: (line: string) => void = () => {};

  send(command: string) {
    this.sent.push(command);
    if (command === "uci") this.emit("id name Fake", "uciok");
    if (command === "isready") this.emit("readyok");
    if (command.startsWith("go") && this.autoReplyToGo) this.replyBestMove();
  }

  onLine(listener: (line: string) => void) {
    this.listener = listener;
  }

  terminate() {
    this.terminated = true;
  }

  replyBestMove() {
    this.emit("info depth 10 score cp 30", `bestmove ${this.bestMoves.shift() ?? "(none)"} ponder e7e5`);
  }

  private emit(...lines: string[]) {
    queueMicrotask(() => lines.forEach((line) => this.listener(line)));
  }
}

const byId = (id: string): Difficulty => DIFFICULTIES.find((d) => d.id === id)!;

describe("UciEngine", () => {
  it("handshakes, configures strength, and returns the best move", async () => {
    const transport = new FakeTransport();
    const engine = new UciEngine(transport);

    await expect(engine.bestMove(START_FEN, byId("club"))).resolves.toBe("e2e4");

    expect(transport.sent).toEqual([
      "uci",
      "isready",
      "setoption name Skill Level value 20",
      "setoption name UCI_LimitStrength value true",
      "setoption name UCI_Elo value 1800",
      "isready",
      `position fen ${START_FEN}`,
      `go movetime ${byId("club").moveTimeMs}`,
    ]);
  });

  it("only resends options when the difficulty changes", async () => {
    const transport = new FakeTransport();
    transport.bestMoves = ["e2e4", "d2d4", "c2c4"];
    const engine = new UciEngine(transport);

    await engine.bestMove(START_FEN, byId("beginner"));
    await engine.bestMove(START_FEN, byId("beginner"));
    await engine.bestMove(START_FEN, byId("master"));

    const options = transport.sent.filter((line) => line.startsWith("setoption"));
    expect(options).toEqual([
      "setoption name Skill Level value 0",
      "setoption name UCI_LimitStrength value false",
      "setoption name Skill Level value 20",
      "setoption name UCI_LimitStrength value false",
    ]);
  });

  it("serializes concurrent searches", async () => {
    const transport = new FakeTransport();
    transport.autoReplyToGo = false;
    const engine = new UciEngine(transport);

    const first = engine.bestMove(START_FEN, byId("casual"));
    const second = engine.bestMove("other-fen", byId("casual"));
    await flush();
    expect(transport.sent.filter((l) => l.startsWith("position"))).toEqual([`position fen ${START_FEN}`]);

    transport.replyBestMove();
    await expect(first).resolves.toBe("e2e4");
    await flush();
    expect(transport.sent.filter((l) => l.startsWith("position"))).toHaveLength(2);
    transport.replyBestMove();
    await expect(second).resolves.toBe("d2d4");
  });

  it("starts a new game", async () => {
    const transport = new FakeTransport();
    await new UciEngine(transport).newGame();
    expect(transport.sent).toEqual(["uci", "isready", "ucinewgame", "isready"]);
  });

  it("rejects when the engine has no move", async () => {
    const transport = new FakeTransport();
    transport.bestMoves = [];
    await expect(new UciEngine(transport).bestMove(START_FEN, byId("casual"))).rejects.toThrow("no move");
  });

  it("rejects pending searches and terminates the worker on dispose", async () => {
    const transport = new FakeTransport();
    transport.autoReplyToGo = false;
    const engine = new UciEngine(transport);
    const pending = engine.bestMove(START_FEN, byId("casual"));
    await flush();

    engine.dispose();

    await expect(pending).rejects.toThrow("disposed");
    expect(transport.terminated).toBe(true);
    await expect(engine.bestMove(START_FEN, byId("casual"))).rejects.toThrow("disposed");
  });
});

describe("DIFFICULTIES", () => {
  it("offers ordered presets with unique ids", () => {
    expect(DIFFICULTIES.map((d) => d.id)).toEqual(["beginner", "casual", "club", "expert", "master"]);
  });
});

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
