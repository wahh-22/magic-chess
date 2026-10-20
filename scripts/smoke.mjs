// Browser smoke test against the running dev server: real mouse clicks, move
// animation, and a real Stockfish reply. Usage: node scripts/smoke.mjs [url]
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:5173/";
const shots = ".shots";
mkdirSync(shots, { recursive: true });

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
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
    .waitForFunction(predicate, undefined, { timeout })
    .then(() => true, () => false);
  console.log(`${ok ? "PASS" : "FAIL"} ${step}`, await state());
  if (!ok) {
    await page.screenshot({ path: `${shots}/smoke-fail.png` });
    console.log("errors:", errors);
    await browser.close();
    process.exit(1);
  }
}

await page.goto(url);
await expectState("setup screen opens", () => globalThis.__gameStore?.getState().phase === "setup");
await page.screenshot({ path: `${shots}/smoke-setup.png` });
await page.getByRole("button", { name: "Start game" }).click();
await expectState("game starts", () => globalThis.__gameStore?.getState().phase === "playing");
await expectState("scene renders", () => (globalThis.__frames ?? 0) > 20, 15000);

// Default camera at 1280×800: the e2 pawn and the e4 square (measured from a screenshot).
await page.mouse.click(687, 548);
await expectState("click selects e2", () => globalThis.__gameStore.getState().selected === "e2");

await page.mouse.click(680, 425);
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
