// Plays a line in local two-player mode and screenshots the last move around its capture:
// right after the impact is registered and then after each extra delay (real time).
// Headless software rendering is slow (~4 fps), so shots are driven by the impact event
// rather than by fixed times since the move started.
// Usage: node scripts/capture-sequence.mjs <name> <uci moves, comma separated> [ms after impact, comma separated]
// Example: node scripts/capture-sequence.mjs pawn-capture e2e4,d7d5,e4d5 0,400,1000
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const [name = "sequence", movesArg = "e2e4,d7d5,e4d5", delaysArg = "0,400,1000"] = process.argv.slice(2);
const moves = movesArg.split(",");
const delays = delaysArg.split(",").map(Number).sort((a, b) => a - b);
const url = process.env.URL ?? "http://localhost:5173/";
mkdirSync(".shots", { recursive: true });

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => message.type() === "error" && errors.push(message.text()));

await page.goto(url);
// Title menu → match setup; the match loads after "Start game" and is playable once revealed.
await page.getByRole("button", { name: "Two Players", exact: true }).click();
await page.getByRole("button", { name: "Start game", exact: true }).click();
await page.waitForFunction(() => document.querySelector(".app")?.dataset.screen === "playing", undefined, { timeout: 300000 });
await page.waitForFunction(() => (globalThis.__frames ?? 0) > 20, undefined, { timeout: 15000 });

const idle = () => page.waitForFunction(() => globalThis.__gameStore.getState().animationQueue.length === 0, undefined, { timeout: 30000 });
for (const uci of moves.slice(0, -1)) {
  await page.evaluate((command) => globalThis.__gameStore.getState().submitCommand(command), uci);
  await idle();
}

// Earlier captures may still have live bursts, so wait for one created by the last move.
const lastBurstId = await page.evaluate(() => Math.max(0, ...globalThis.__effectsStore.getState().bursts.map((b) => b.id)));
await page.evaluate((command) => globalThis.__gameStore.getState().submitCommand(command), moves.at(-1));
await page.waitForFunction(
  (previous) => globalThis.__effectsStore.getState().bursts.some((b) => b.id > previous),
  lastBurstId,
  { timeout: 30000 },
);
const impactAt = Date.now();
for (const delay of delays) {
  await page.waitForTimeout(Math.max(0, delay - (Date.now() - impactAt)));
  const path = `.shots/${name}-impact+${String(delay).padStart(4, "0")}ms.png`;
  await page.screenshot({ path });
  console.log(`saved ${path} (bursts: ${await page.evaluate(() => globalThis.__effectsStore.getState().bursts.length)})`);
}
await idle();
console.log("history:", await page.evaluate(() => globalThis.__gameStore.getState().game.history().join(" ")));
console.log("errors:", errors.length ? errors : "none");
await browser.close();
