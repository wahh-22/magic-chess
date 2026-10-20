// Copies the single-threaded lite Stockfish engine (js + wasm) into public/ so the
// browser can load it as a Web Worker. Runs before dev and build.
import { copyFileSync, mkdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const engineDir = dirname(require.resolve("stockfish/package.json"));
const targetDir = join(import.meta.dirname, "..", "public", "stockfish");
const files = [
  "bin/stockfish-19-lite-single.js",
  "bin/stockfish-19-lite-single.wasm",
  "Copying.txt",
];

mkdirSync(targetDir, { recursive: true });
for (const file of files) copyFileSync(join(engineDir, file), join(targetDir, basename(file)));
console.log(`Copied Stockfish engine to ${targetDir}`);
