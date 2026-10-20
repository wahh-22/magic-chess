// H1/T10 browser verification. Run against Vite: node scripts/scenarios.mjs [url]
// Only submit commands: the mounted scene must finish every real animation.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { Chess } from "chess.js";
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:5173/";
const shots = ".shots";
mkdirSync(shots, { recursive: true });

// Validate from the initial position before opening Chrome; retain UCI commands
// so the browser exercises the same command path as typed user input.
function validatedLine(san, expectedEnding) {
  const game = new Chess();
  const commands = san.split(" ").map((text) => {
    const move = game.move(text);
    return `${move.from}${move.to}${move.promotion ?? ""}`;
  });
  if (expectedEnding === "stalemate") assert.ok(game.isStalemate());
  if (expectedEnding === "promotion") assert.equal(game.get("g8")?.type, "q");
  return commands;
}

const lines = {
  kingside: validatedLine("e4 e5 Nf3 Nc6 Bc4 Bc5 O-O"),
  queenside: validatedLine("d4 d5 Nc3 Nc6 Bf4 Bf5 Qd2 Qd7 O-O-O"),
  enPassant: validatedLine("e4 a6 e5 d5 exd6"),
  promotion: validatedLine("h4 g5 hxg5 h6 gxh6 Nf6 h7 Ng8 hxg8=Q", "promotion"),
  mate: validatedLine("e4 e5 Bc4 Nc6 Qh5 Nf6 Qxf7#"),
  stalemate: validatedLine(
    "e3 a5 Qh5 Ra6 Qxa5 h5 h4 Rah6 Qxc7 f6 Qxd7+ Kf7 Qxb7 Qd3 Qxb8 Qh7 Qxc8 Kg6 Qe6",
    "stalemate",
  ),
};

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(15000);
const errors = [];
let currentScenario = "startup";
page.on("pageerror", (error) => errors.push(`${currentScenario}: ${error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`${currentScenario}: ${message.text()}`);
});

const state = () => page.evaluate(() => {
  const s = globalThis.__gameStore.getState();
  return {
    phase: s.phase,
    settings: s.settings,
    history: s.game.history(),
    turn: s.game.turn(),
    queue: s.animationQueue.length,
    pendingPromotion: s.pendingPromotion,
    outcome: s.outcome,
    lastError: s.lastError,
    aiThinking: s.aiThinking,
    displayedPieces: s.displayedPieces,
    pieces: s.game.pieces(),
  };
});

function assertScene(s) {
  const map = (pieces) => pieces.map(({ id, square, type }) => [id, square, type])
    .sort(([a], [b]) => a.localeCompare(b));
  assert.deepEqual(map(s.displayedPieces), map(s.pieces), "displayed id→square/type map matches authoritative pieces");
  assert.equal(s.queue, 0, "all real animations completed");
  assert.equal(s.lastError, null, "no store error");
}

function assertPiece(s, id, square, type) {
  const piece = s.displayedPieces.find((piece) => piece.id === id);
  assert.ok(piece, `${id} exists`);
  assert.equal(piece.square, square, `${id} square`);
  assert.equal(piece.type, type, `${id} type`);
}

async function start(ai = false) {
  // A fresh document resets the vanilla store, worker, and frame counter.
  if (page.url() === "about:blank") await page.goto(url);
  else await page.reload();
  await page.waitForFunction(() => globalThis.__gameStore?.getState().phase === "setup");
  await page.getByLabel(ai ? "Play vs the engine" : "Two players on this computer", { exact: true }).check();
  if (ai) {
    await page.getByLabel("White", { exact: true }).check();
    await page.getByLabel("Difficulty", { exact: true }).selectOption({ label: "Beginner" });
  }
  await page.getByRole("button", { name: "Start game", exact: true }).click();
  await page.waitForFunction(() => globalThis.__gameStore.getState().phase === "playing" && globalThis.__frames > 20);
  const s = await state();
  assert.equal(s.settings.mode, ai ? "ai" : "local");
  assert.equal(s.history.length, 0);
  if (ai) assert.equal(s.settings.humanColor, "w");
}

async function submit(uci) {
  return page.evaluate((command) => {
    const s = globalThis.__gameStore.getState();
    const before = s.game.history().length;
    s.submitCommand(command);
    const after = globalThis.__gameStore.getState();
    return { before, after: after.game.history().length, queue: after.animationQueue.length, error: after.lastError };
  }, uci);
}

async function move(uci) {
  const result = await submit(uci);
  assert.equal(result.error, null, `${uci} accepted without error`);
  assert.equal(result.after, result.before + 1, `${uci} adds exactly one ply`);
  assert.equal(result.queue, 1, `${uci} enqueues a real animation`);
  await page.waitForFunction(() => globalThis.__gameStore.getState().animationQueue.length === 0);
}

async function play(commands) {
  for (const uci of commands) await move(uci);
}

const scenarios = [
  ["castling-kingside", async () => {
    await play(lines.kingside);
    const s = await state();
    assertPiece(s, "w-k-e1", "g1", "k");
    assertPiece(s, "w-r-h1", "f1", "r");
    assert.equal(s.history.at(-1), "O-O");
    return "king g1; w-r-h1 f1; history ends O-O";
  }],
  ["castling-queenside", async () => {
    await play(lines.queenside);
    const s = await state();
    assertPiece(s, "w-k-e1", "c1", "k");
    assertPiece(s, "w-r-a1", "d1", "r");
    assert.equal(s.history.at(-1), "O-O-O");
    return "king c1; w-r-a1 d1; history ends O-O-O";
  }],
  ["en-passant", async () => {
    await play(lines.enPassant);
    const s = await state();
    assertPiece(s, "w-p-e2", "d6", "p");
    assert.ok(!s.displayedPieces.some(({ id }) => id === "b-p-d7"));
    assert.equal(s.history.at(-1), "exd6");
    return "w-p-e2 d6; b-p-d7 absent; history ends exd6";
  }],
  ["promotion", async () => {
    await play(lines.promotion.slice(0, -1));
    const result = await submit("h7g8");
    assert.equal(result.error, null);
    assert.equal(result.after, result.before, "no move before picker choice");
    assert.equal(result.queue, 0);
    assert.deepEqual((await state()).pendingPromotion, { from: "h7", to: "g8" });
    const picker = page.getByRole("dialog", { name: "Promote your pawn" });
    assert.ok(await picker.isVisible(), "promotion picker visible");
    await picker.getByRole("button", { name: "Queen", exact: true }).click();
    await page.waitForFunction(() => {
      const s = globalThis.__gameStore.getState();
      return s.game.history().length === 9 && s.animationQueue.length === 0;
    });
    const s = await state();
    assertPiece(s, "w-p-h2", "g8", "q");
    assert.equal(s.pendingPromotion, null);
    assert.ok(!await picker.isVisible());
    return "h7g8 sets pendingPromotion; picker visible; Queen click promotes w-p-h2 to q g8";
  }],
  ["scholars-mate", async () => {
    await play(lines.mate);
    const s = await state();
    assert.equal(s.phase, "over");
    assert.deepEqual(s.outcome, { kind: "checkmate", winner: "w" });
    const panel = await page.locator(".game-over-panel").innerText();
    assert.match(panel, /Checkmate/);
    assert.match(panel, /White wins/);
    assertScene(s);
    await page.screenshot({ path: `${shots}/scenario-scholars-mate-checkmate.png` });
    await page.getByRole("button", { name: "Play again", exact: true }).click();
    const restarted = await state();
    assert.equal(restarted.phase, "playing");
    assert.deepEqual(restarted.history, []);
    return "over; checkmate winner w; panel Checkmate / White wins; Play again resets to playing, empty history";
  }],
  ["stalemate", async () => {
    await play(lines.stalemate);
    const s = await state();
    assert.equal(s.phase, "over");
    assert.equal(s.outcome?.kind, "stalemate");
    assert.match(await page.locator(".game-over-panel").innerText(), /Stalemate/);
    return "validated Loyd line; over; outcome stalemate; panel Stalemate";
  }],
  ["vs-engine", async () => {
    let replies = 0;
    let whiteMoves = 0;
    for (let turn = 0; turn < 6; turn++) {
      const before = await state();
      if (before.phase === "over") break;
      assert.equal(before.turn, "w");
      const uci = await page.evaluate(() => {
        const moves = globalThis.__gameStore.getState().game.legalMoves();
        const move = moves.find((move) => move.isCapture) ?? moves[0];
        return `${move.from}${move.to}${move.isPromotion ? "q" : ""}`;
      });
      const accepted = await submit(uci);
      assert.equal(accepted.error, null);
      assert.equal(accepted.after, before.history.length + 1);
      assert.equal(accepted.queue, 1);
      whiteMoves++;
      await page.waitForFunction((length) => {
        const s = globalThis.__gameStore.getState();
        return s.animationQueue.length === 0 && !s.aiThinking &&
          (s.phase === "over" || s.game.history().length === length + 2);
      }, before.history.length, { timeout: 20000 });
      const after = await state();
      assert.equal(after.lastError, null);
      if (after.history.length === before.history.length + 2) replies++;
      else assert.equal(after.phase, "over", "missing reply only allowed when game ends");
      assertScene(after);
    }
    const end = await state();
    assert.ok(whiteMoves === 6 || end.phase === "over");
    assert.ok(replies === whiteMoves || end.phase === "over");
    return `Beginner, White; ${whiteMoves} white moves, ${replies} engine replies; phase ${end.phase}; no lastError`;
  }],
];

let failures = 0;
try {
  for (const [name, scenario] of scenarios.filter(([n]) => !process.env.SCENARIO || n === process.env.SCENARIO)) {
    currentScenario = name;
    let facts;
    let failure;
    try {
      await start(name === "vs-engine");
      facts = await scenario();
      assertScene(await state());
    } catch (error) {
      failure = error.stack ?? String(error);
      const snapshot = await state().catch(() => null);
      failure += `\nstate: ${JSON.stringify(snapshot)}`;
    }
    const path = `${shots}/scenario-${name}.png`;
    try {
      await page.screenshot({ path });
    } catch (error) {
      failure = `${failure ?? ""}\nscreenshot: ${error.message}`;
    }
    if (failure) {
      failures++;
      console.log(`FAIL ${name}: ${failure}; screenshot ${path}`);
    } else {
      console.log(`PASS ${name}: ${facts}; displayed id→square/type = game.pieces(); queue empty; no lastError; screenshot ${path}`);
    }
  }
} finally {
  await browser.close();
}
console.log("errors:", errors.length ? JSON.stringify(errors) : "none");
if (failures || errors.length) process.exitCode = 1;
