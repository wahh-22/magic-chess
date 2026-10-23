// Loading and first-capture performance against the running dev server (software GL).
// Usage: node scripts/perf/longtasks.mjs [high|low] [url] [--capture] [--shots]
// Reports "Start game" click latency (pressed as soon as it is visible), time until the
// scene is ready and the first interactive frame, a histogram of main-thread long tasks,
// and with --capture the long tasks and worst frame gap of the first capture.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const quality = args.find((arg) => arg === "high" || arg === "low") ?? "high";
const url = args.find((arg) => arg.startsWith("http")) ?? "http://localhost:5173/";
const capture = args.includes("--capture");
const shots = args.includes("--shots");
const BUCKETS = [[50, 100], [100, 250], [250, 500], [500, 1000], [1000, Infinity]];

const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
try {
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
  await page.goto(url, { waitUntil: "load" });
  const loadEventMs = Date.now() - t0;
  const button = page.getByRole("button", { name: "Start game" });
  await button.waitFor({ timeout: 120000 });
  const startVisibleMs = Date.now() - t0;
  const menuAt = await page.evaluate(() => performance.now());
  if (capture) await page.getByLabel("Two players on this computer", { exact: true }).click({ timeout: 120000 });
  if (shots) {
    mkdirSync(".shots", { recursive: true });
    await page.waitForFunction(() => {
      const snapshot = globalThis.__loadProgress?.snapshot("critical");
      return snapshot && snapshot.fraction > 0.3;
    }, undefined, { timeout: 120000 }).catch(() => undefined);
    await page.screenshot({ path: `.shots/h9-loading-menu-${quality}.png` });
  }
  const c0 = Date.now();
  await button.click({ timeout: 300000 });
  const clickLatencyMs = Date.now() - c0;
  if (shots) await page.screenshot({ path: `.shots/h9-loading-full-${quality}.png` });
  await page.waitForFunction(() => globalThis.__sceneLoader?.getState().stage === "ready", undefined, { timeout: 300000 });
  const sceneReadyMs = Date.now() - t0;
  const framesAtReady = await page.evaluate(() => globalThis.__frames ?? 0);
  await page.waitForFunction((frames) => globalThis.__gameStore.getState().phase === "playing" && (globalThis.__frames ?? 0) > frames,
    framesAtReady, { timeout: 300000 });
  const interactiveMs = Date.now() - t0;
  if (shots) {
    await page.waitForTimeout(400);
    await page.screenshot({ path: `.shots/h9-reveal-${quality}.png` });
  }
  await page.waitForFunction(() => globalThis.__sceneLoader.getState().secondary === "ready" || !document.querySelector(".loading-screen"),
    undefined, { timeout: 300000 });
  await page.waitForTimeout(6000);
  const longs = await page.evaluate(() => globalThis.__long);
  const programs = await page.evaluate(() => globalThis.__renderer?.info.programs?.length ?? null);
  const histogram = Object.fromEntries(BUCKETS.map(([low, high]) => [`${low}-${high === Infinity ? "" : high}`, longs.filter(([, d]) => d >= low && d < high).length]));
  // Tasks that overlap the interactive menu (boot work behind the splash excluded).
  const afterMenu = longs.filter(([at, d]) => at + d > menuAt);
  const report = {
    quality, loadEventMs, startVisibleMs, clickLatencyMs, sceneReadyMs, interactiveMs, programs,
    longTaskCount: longs.length, longTaskTotalMs: longs.reduce((sum, [, d]) => sum + d, 0),
    worstMs: Math.max(0, ...longs.map(([, d]) => d)), histogram,
    afterMenu: { count: afterMenu.length, totalMs: afterMenu.reduce((sum, [, d]) => sum + d, 0), worstMs: Math.max(0, ...afterMenu.map(([, d]) => d)) },
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
      await page.screenshot({ path: `.shots/h9-first-capture-${quality}.png` });
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
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
