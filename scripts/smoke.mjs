// Browser smoke test against the running dev server: real mouse clicks, move
// animation, and a real Stockfish reply. Usage: node scripts/smoke.mjs [url]
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:5173/";
// Software rendering on CI runners can be several times slower than a local machine.
const TIMEOUT_SCALE = Number(process.env.TIMEOUT_SCALE ?? 1);
const shots = ".shots";
mkdirSync(shots, { recursive: true });

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
// Gameplay checks, not visuals: run on the low graphics preset (software GL renders the
// full scene at well under 1 fps). Set GRAPHICS=high to exercise the high preset.
await page.addInitScript((quality) => localStorage.setItem("magic-chess.graphics-quality", quality), process.env.GRAPHICS ?? "low");
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => message.type() === "error" && errors.push(message.text()));

const state = () =>
  page.evaluate(() => {
    const s = globalThis.__gameStore.getState();
    return {
      phase: s.phase,
      selected: s.selected,
      targets: s.legalTargets.map((m) => m.to),
      queue: s.animationQueue.length,
      history: s.game.history(),
      aiThinking: s.aiThinking,
      lastError: s.lastError,
    };
  });

/** Waits for a store condition; on timeout prints the state and exits non-zero. */
async function expectState(step, predicate, timeout = 5000) {
  const ok = await page
    .waitForFunction(predicate, undefined, { timeout: timeout * TIMEOUT_SCALE })
    .then(() => true, () => false);
  console.log(`${ok ? "PASS" : "FAIL"} ${step}`, await state());
  if (!ok) {
    console.log("diagnostics:", await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2");
      const info = gl?.getExtension("WEBGL_debug_renderer_info");
      return {
        frames: globalThis.__frames ?? 0,
        webgl2: Boolean(gl),
        renderer: gl && info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : null,
        sceneCanvas: Boolean(document.querySelector("canvas")),
      };
    }));
    await page.screenshot({ path: `${shots}/smoke-fail.png` });
    console.log("errors:", errors);
    await browser.close();
    process.exit(1);
  }
}

// Regression guard for the loading work (docs/performance.md): the menu must stay responsive
// while the scene loads, so pressing "Start game" as soon as it shows returns quickly. The
// budget is generous (a busy main thread used to delay this click by 4–5 s).
const START_CLICK_BUDGET_MS = 1000 * TIMEOUT_SCALE;

await page.goto(url);
await expectState("setup screen opens", () => globalThis.__gameStore?.getState().phase === "setup");
await page.screenshot({ path: `${shots}/smoke-setup.png` });
const startButton = page.getByRole("button", { name: "Start game" });
await startButton.waitFor({ timeout: 60000 * TIMEOUT_SCALE });
const clickedAt = Date.now();
await startButton.click();
const startClickMs = Date.now() - clickedAt;
const responsive = startClickMs <= START_CLICK_BUDGET_MS;
console.log(`${responsive ? "PASS" : "FAIL"} "Start game" click latency ${startClickMs} ms (budget ${START_CLICK_BUDGET_MS} ms)`);
if (!responsive) {
  await browser.close();
  process.exit(1);
}
// Pressed early, the game waits behind the loading screen until the critical set is ready.
await expectState("game starts", () => globalThis.__gameStore?.getState().phase === "playing", 60000);
// A few frames are enough: clicks are projected with the live camera, not fixed pixels.
await expectState("scene renders", () => (globalThis.__frames ?? 0) > 5, 15000);

// Click where the squares appear on screen (projected with the real camera), so model
// sizes or camera tweaks do not break the test.
// Pieces are clicked on their upper body: a taller piece in front can hide the base.
const project = (square, height = 0) => page.evaluate(([s, h]) => globalThis.__projectSquare(s, h), [square, height]);
// Aim at the pawn's upper body (70% of its real height): piece heights change with the model set,
// and a fixed height can pass over a short piece into the hall behind the board.
const pawnHeight = await page.evaluate(async () => {
  const { loadPieceModels } = await import("/src/scene/pieces/gltfPieces.ts");
  const { modelBounds } = await import("/src/scene/effects/pieceColliders.ts");
  return modelBounds(await loadPieceModels()).p.height;
});
await page.mouse.click(...(await project("e2", pawnHeight * 0.7)));
await expectState("click selects e2", () => globalThis.__gameStore.getState().selected === "e2");

await page.mouse.click(...(await project("e4")));
await expectState("click on e4 starts the move", () => globalThis.__gameStore.getState().game.history()[0] === "e4");
await page.waitForTimeout(250);
await page.screenshot({ path: `${shots}/smoke-mid-move.png` });

await expectState(
  "AI replies after the animation",
  () => {
    const s = globalThis.__gameStore.getState();
    return s.game.history().length >= 2 && s.animationQueue.length === 0;
  },
  20000,
);
await page.screenshot({ path: `${shots}/smoke-after-ai.png` });
await page.getByRole("button", { name: "Menu", exact: true }).click();
await expectState("Menu returns to setup", () => globalThis.__gameStore.getState().phase === "setup");
console.log("errors:", errors.length ? errors : "none");
await browser.close();
if (errors.length) process.exitCode = 1;
