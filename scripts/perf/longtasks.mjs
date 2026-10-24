// Title, loading and first-capture performance against the running dev server (software GL).
// Usage: node scripts/perf/longtasks.mjs [high|low] [url] [--capture] [--shots] [--idle=<ms>]
// Reports when the title menu is visible (and that it has no canvas), the "Start game" click
// latency, Start → scene ready / reveal / playable (camera arrived, HUD up), main-thread long
// tasks (histogram, and split into title / loading / play), and with --capture the long tasks
// and worst frame gap of the first capture. --idle waits on the title before Start (the match
// bytes prefetch meanwhile); by default Start is pressed as soon as possible.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const quality = args.find((arg) => arg === "high" || arg === "low") ?? "high";
const url = args.find((arg) => arg.startsWith("http")) ?? "http://localhost:5173/";
const capture = args.includes("--capture");
const shots = args.includes("--shots");
const idleMs = Number(args.find((arg) => arg.startsWith("--idle="))?.slice(7) ?? 0);
const BUCKETS = [[50, 100], [100, 250], [250, 500], [500, 1000], [1000, Infinity]];
const shot = (page, name) => shots ? page.screenshot({ path: `.shots/h10-${name}-${quality}.png` }) : undefined;
const screenIs = (screen) => document.querySelector(".app")?.dataset.screen === screen;

const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  if (shots) mkdirSync(".shots", { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.addInitScript((q) => {
    localStorage.setItem("magic-chess.graphics-quality", q);
    localStorage.removeItem("magic-chess:game:v1");
    globalThis.__long = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) globalThis.__long.push([Math.round(entry.startTime), Math.round(entry.duration)]);
    }).observe({ type: "longtask", buffered: true });
  }, quality);
  const t0 = Date.now();
  await page.goto(url, { waitUntil: "commit" });
  const mode = page.getByRole("button", { name: capture ? "Two Players" : "Play vs Engine", exact: true });
  await mode.waitFor({ timeout: 120000 });
  const titleVisibleMs = Date.now() - t0;
  const canvasOnTitle = await page.evaluate(() => document.querySelectorAll("canvas").length);
  if (idleMs) await page.waitForTimeout(idleMs);
  await shot(page, "title");
  await mode.click();
  const button = page.getByRole("button", { name: "Start game" });
  await button.waitFor();
  await shot(page, "setup");
  const startAt = await page.evaluate(() => performance.now());
  const c0 = Date.now();
  await button.click({ timeout: 300000 });
  const clickLatencyMs = Date.now() - c0;
  if (shots) {
    await page.waitForFunction(() => {
      const snapshot = globalThis.__loadProgress?.snapshot("critical");
      return snapshot && snapshot.fraction > 0.3 && snapshot.fraction < 0.8;
    }, undefined, { timeout: 120000, polling: 50 }).catch(() => undefined);
    // The bar repaints at most every 250 ms.
    await page.waitForTimeout(300);
    await shot(page, "loading");
  }
  await page.waitForFunction(() => globalThis.__sceneLoader?.getState().stage === "ready", undefined, { timeout: 300000 });
  const sceneReadyMs = Date.now() - c0;
  await page.waitForFunction(screenIs, "reveal", { timeout: 300000 });
  const revealMs = Date.now() - c0;
  if (shots) {
    await page.waitForTimeout(900);
    await shot(page, "reveal");
  }
  await page.waitForFunction(screenIs, "playing", { timeout: 300000 });
  const playableMs = Date.now() - c0;
  const playAt = await page.evaluate(() => performance.now());
  if (shots) {
    await page.waitForTimeout(1200);
    await shot(page, "hud");
  }
  await page.waitForTimeout(6000);
  const longs = await page.evaluate(() => globalThis.__long);
  const programs = await page.evaluate(() => globalThis.__renderer?.info.programs?.length ?? null);
  const histogram = Object.fromEntries(BUCKETS.map(([low, high]) => [`${low}-${high === Infinity ? "" : high}`, longs.filter(([, d]) => d >= low && d < high).length]));
  const summary = (tasks) => ({ count: tasks.length, totalMs: tasks.reduce((sum, [, d]) => sum + d, 0), worstMs: Math.max(0, ...tasks.map(([, d]) => d)) });
  const report = {
    quality, idleMs, titleVisibleMs, canvasOnTitle, clickLatencyMs, sceneReadyMs, revealMs, playableMs, programs,
    longTaskCount: longs.length, longTaskTotalMs: longs.reduce((sum, [, d]) => sum + d, 0),
    worstMs: Math.max(0, ...longs.map(([, d]) => d)), histogram,
    // Before Start (the title), Start → playable (behind the loading screen and the reveal), then play.
    title: summary(longs.filter(([at]) => at < startAt)),
    loading: summary(longs.filter(([at]) => at >= startAt && at < playAt)),
    play: summary(longs.filter(([at]) => at >= playAt)),
    top: [...longs].sort((a, b) => b[1] - a[1]).slice(0, 8),
  };
  if (capture) {
    // e4 d5 exd5: the first capture, measured from the command to the end of its animation.
    const play = (command) => page.evaluate((text) => globalThis.__gameStore.getState().submitCommand(text), command);
    const settle = () => page.waitForFunction(() => globalThis.__gameStore.getState().animationQueue.length === 0, undefined, { timeout: 120000 });
    await play("e2e4"); await settle();
    await play("d7d5"); await settle();
    await page.waitForTimeout(3000);
    const from = await page.evaluate(() => {
      globalThis.__gaps = [];
      let last = performance.now();
      const tick = (now) => { globalThis.__gaps.push(now - last); last = now; if (!globalThis.__stopGaps) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      return performance.now();
    });
    await play("e4d5");
    if (shots) {
      await page.waitForFunction(() => globalThis.__gameStore.getState().animationQueue.length === 0 || globalThis.__gaps.length > 40, undefined, { timeout: 120000 });
      await shot(page, "first-capture");
    }
    await settle();
    await page.waitForTimeout(2500);
    const result = await page.evaluate((start) => {
      globalThis.__stopGaps = true;
      return { longs: globalThis.__long.filter(([at]) => at >= start), worstGap: Math.round(Math.max(...globalThis.__gaps)) };
    }, from);
    report.capture = {
      longTaskCount: result.longs.length, longTaskTotalMs: result.longs.reduce((sum, [, d]) => sum + d, 0),
      worstMs: Math.max(0, ...result.longs.map(([, d]) => d)), worstFrameGapMs: result.worstGap,
    };
  }
  if (shots) {
    // Back to the title: the scene stays mounted, hidden, for a fast rematch.
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await mode.waitFor();
    await page.waitForTimeout(800);
    await shot(page, "back-to-title");
  }
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
