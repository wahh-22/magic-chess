import type { Engine } from "./Engine";
import { UciEngine } from "./UciEngine";

/** Path of the single-threaded lite build copied by scripts/copy-stockfish.mjs. */
const STOCKFISH_URL = `${import.meta.env.BASE_URL}stockfish/stockfish-19-lite-single.js`;

/** Runs Stockfish in a Web Worker so searches never block rendering. */
export function createStockfishEngine(url = STOCKFISH_URL): Engine {
  const worker = new Worker(url);
  worker.onerror = (event) => console.error("Stockfish worker error:", event.message);
  return new UciEngine({
    send: (command) => worker.postMessage(command),
    onLine: (listener) => {
      worker.onmessage = (event: MessageEvent) => {
        for (const line of String(event.data).split("\n")) if (line) listener(line);
      };
    },
    terminate: () => worker.terminate(),
  });
}
