import type { Difficulty } from "./difficulty";
import type { Engine } from "./Engine";

export interface UciTransport {
  send(command: string): void;
  onLine(listener: (line: string) => void): void;
  terminate(): void;
}

interface Waiter {
  matches: (line: string) => boolean;
  resolve: (line: string) => void;
  reject: (error: Error) => void;
}

/** Extra time a search may take beyond its move time before it counts as hung. */
const SEARCH_GRACE_MS = 10_000;

/** Speaks UCI to an engine over any line-based transport. Requests run one at a time. */
export class UciEngine implements Engine {
  private queue: Promise<unknown> = Promise.resolve();
  private waiters: Waiter[] = [];
  private handshakeDone = false;
  private appliedDifficultyId: string | undefined;
  private disposed = false;

  constructor(private readonly transport: UciTransport) {
    transport.onLine((line) => this.handleLine(line));
  }

  bestMove(fen: string, difficulty: Difficulty): Promise<string> {
    return this.enqueue(async () => {
      await this.handshake();
      if (this.appliedDifficultyId !== difficulty.id) {
        this.send(`setoption name Skill Level value ${difficulty.skillLevel}`);
        this.send(`setoption name UCI_LimitStrength value ${difficulty.elo !== undefined}`);
        if (difficulty.elo !== undefined) this.send(`setoption name UCI_Elo value ${difficulty.elo}`);
        await this.sync();
        this.appliedDifficultyId = difficulty.id;
      }
      this.send(`position fen ${fen}`);
      this.send(`go movetime ${difficulty.moveTimeMs}`);
      const line = await this.waitFor((l) => l.startsWith("bestmove"), difficulty.moveTimeMs + SEARCH_GRACE_MS);
      const move = line.split(/\s+/)[1];
      if (!move || move === "(none)") throw new Error("Engine returned no move");
      return move;
    });
  }

  newGame(): Promise<void> {
    return this.enqueue(async () => {
      await this.handshake();
      this.send("ucinewgame");
      await this.sync();
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const waiter of this.waiters.splice(0)) waiter.reject(new Error("Engine disposed"));
    this.transport.terminate();
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(() => {
      if (this.disposed) throw new Error("Engine disposed");
      return task();
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async handshake(): Promise<void> {
    if (this.handshakeDone) return;
    this.send("uci");
    await this.waitFor((line) => line === "uciok");
    await this.sync();
    this.handshakeDone = true;
  }

  private async sync(): Promise<void> {
    this.send("isready");
    await this.waitFor((line) => line === "readyok");
  }

  private send(command: string): void {
    this.transport.send(command);
  }

  private waitFor(matches: (line: string) => boolean, timeoutMs = SEARCH_GRACE_MS): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== waiter);
        reject(new Error("Engine timed out"));
      }, timeoutMs);
      const waiter: Waiter = {
        matches,
        resolve: (line) => {
          clearTimeout(timer);
          resolve(line);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      };
      this.waiters.push(waiter);
    });
  }

  private handleLine(line: string): void {
    const trimmed = line.trim();
    const index = this.waiters.findIndex((w) => w.matches(trimmed));
    if (index === -1) return;
    const [waiter] = this.waiters.splice(index, 1);
    waiter!.resolve(trimmed);
  }
}
