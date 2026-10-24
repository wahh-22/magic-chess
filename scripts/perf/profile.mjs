// Attributes main-thread long tasks to their causes with a V8 CPU profile (CDP Profiler).
// Usage: node scripts/perf/profile.mjs [high|low] [url] — against the running dev server.
// Covers the title, the loading after Start, the cinematic reveal and a few seconds of play.
// Every busy stretch longer than 50 ms is reported with its samples grouped by cause
// (first matching frame from the leaf up) plus its hottest self-time functions.
import { writeFileSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";

const quality = process.argv[2] ?? "high";
const url = process.argv[3] ?? "http://localhost:5173/";
const LONG_MS = 50;

/** Cause rules, checked against each frame from the leaf to the root; the first match wins. */
const CAUSES = [
  ["WebGL context creation", (f) => f.functionName === "getContext"],
  ["GPU readback (readPixels)", (f) => f.functionName === "readPixels"],
  ["shader compile/link", (f) => /^(onFirstUse|getProgramParameter|getProgramInfoLog|getShaderInfoLog|linkProgram|compileShader|WebGLProgram|fetchAttributeLocations|fetchUniformLocations|getProgramInfo)$/.test(f.functionName) || /WebGLProgram\.js/.test(f.url)],
  ["texture upload", (f) => /^(texImage2D|texSubImage2D|texStorage2D|compressedTexImage2D|generateMipmap|uploadTexture|setTexture2D|initTexture)$/.test(f.functionName)],
  ["image decode", (f) => /^(createImageBitmap|decode)$/.test(f.functionName) && !/meshopt/.test(f.url)],
  ["PMREM (sky environment)", (f) => /PMREMGenerator/.test(f.url)],
  ["meshopt decode", (f) => /meshopt_decoder/.test(f.url)],
  ["GLB parse (GLTFLoader)", (f) => /GLTFLoader/.test(f.url)],
  ["piece-part split (destruction)", (f) => /pieceParts/.test(f.url)],
  ["piece rig bake (skinning/merge)", (f) => /gltfPieces/.test(f.url) || /SkeletonUtils/.test(f.url)],
  ["ruins generation", (f) => /environment\/(ruins|weathering)/.test(f.url)],
  ["terrain/plaza generation", (f) => /environment\/landscape/.test(f.url)],
  ["scatter layout", (f) => /environment\/scatterLayout/.test(f.url)],
  ["scanned nature setup", (f) => /ScannedNature/.test(f.url)],
  ["voronoi fracture", (f) => /voronoiFracture/.test(f.url)],
  ["post-processing", (f) => /postprocessing/.test(f.url)],
  ["rapier/physics", (f) => /rapier/.test(f.url)],
  ["shadow/render (WebGLRenderer)", (f) => /three\.(module|core)|three_module|WebGLRenderer|three\.js/.test(f.url) && /render|projectObject|renderObjects|renderBufferDirect|setProgram|getProgram/.test(f.functionName)],
  ["three.js (other)", (f) => /node_modules\/.*three/.test(f.url) || /three\.(module|core)\.js/.test(f.url)],
  ["React", (f) => /react-dom|react-reconciler|scheduler|@react-three/.test(f.url)],
  ["app code", (f) => /\/src\//.test(f.url)],
  ["garbage collection", (f) => f.functionName === "(garbage collector)"],
  ["(program)", (f) => f.functionName === "(program)"],
];

const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.addInitScript((q) => localStorage.setItem("magic-chess.graphics-quality", q), quality);
  // Same-origin first: the renderer process (and its V8 profiler) survives the real navigation.
  await page.goto(new URL("/favicon.svg", url).href);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 500 });
  await cdp.send("Profiler.start");
  const t0 = Date.now();
  await page.goto(url);
  // Title menu (no scene) → match setup → Start: the match loads behind the loading screen.
  const capture = Boolean(process.env.CAPTURE);
  const mode = page.getByRole("button", { name: capture ? "Two Players" : "Play vs Engine" });
  await mode.waitFor({ timeout: 120000 });
  // Let the title idle like a player reading it (the match bytes prefetch meanwhile), then start.
  await page.waitForTimeout(Number(process.env.MENU_WAIT_MS ?? 6000));
  await mode.click();
  const button = page.getByRole("button", { name: "Start game" });
  const c0 = Date.now();
  await button.click({ timeout: 300000 });
  const clickMs = Date.now() - c0;
  await page.waitForFunction(() => document.querySelector(".app")?.dataset.screen === "playing", undefined, { timeout: 300000 });
  await page.waitForTimeout(6000);
  if (capture) {
    // CAPTURE=1: e4 d5 exd5 in a local game; the capture's tasks are marked in the output.
    const play = (command) => page.evaluate((text) => globalThis.__gameStore.getState().submitCommand(text), command);
    const settle = () => page.waitForFunction(() => globalThis.__gameStore.getState().animationQueue.length === 0, undefined, { timeout: 120000 });
    await play("e2e4"); await settle();
    await play("d7d5"); await settle();
    await page.waitForTimeout(2000);
    console.log("capture starts at", Date.now() - t0, "ms (wall)");
    await play("e4d5"); await settle();
    await page.waitForTimeout(2500);
  }
  const { profile } = await cdp.send("Profiler.stop");
  mkdirSync(".shots", { recursive: true });
  writeFileSync(`.shots/profile-${quality}.cpuprofile`, JSON.stringify(profile));

  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const parent = new Map();
  for (const node of profile.nodes) for (const child of node.children ?? []) parent.set(child, node.id);
  const causeOf = new Map();
  const cause = (id) => {
    if (causeOf.has(id)) return causeOf.get(id);
    let result = "other";
    for (let current = id; current !== undefined; current = parent.get(current)) {
      const frame = nodes.get(current).callFrame;
      const hit = CAUSES.find(([, test]) => test(frame));
      if (hit) { result = hit[0]; break; }
    }
    causeOf.set(id, result);
    return result;
  };
  // Busy stretches: consecutive non-idle samples.
  const times = [];
  let t = profile.startTime;
  for (const delta of profile.timeDeltas) { t += delta; times.push(t); }
  const tasks = [];
  let current;
  profile.samples.forEach((id, index) => {
    const idle = nodes.get(id).callFrame.functionName === "(idle)";
    const time = times[index];
    const dt = ((times[index + 1] ?? time) - time) / 1000;
    if (idle) { current = undefined; return; }
    if (!current) { current = { start: (time - profile.startTime) / 1000, ms: 0, causes: {}, self: {} }; tasks.push(current); }
    current.ms += dt;
    const c = cause(id);
    current.causes[c] = (current.causes[c] ?? 0) + dt;
    const frame = nodes.get(id).callFrame;
    const key = `${frame.functionName || "(anon)"} ${frame.url.replace(/^.*\/(node_modules|src)\//, "$1/").replace(/\?.*$/, "")}:${frame.lineNumber + 1}`;
    current.self[key] = (current.self[key] ?? 0) + dt;
  });
  const long = tasks.filter((task) => task.ms >= LONG_MS);
  const round = (value) => Math.round(value);
  const top = (record, count) => Object.entries(record).sort((a, b) => b[1] - a[1]).slice(0, count).map(([k, v]) => `${k} ${round(v)}`);
  const totals = {};
  for (const task of long) for (const [c, ms] of Object.entries(task.causes)) totals[c] = (totals[c] ?? 0) + ms;
  console.log(JSON.stringify({ quality, clickLatencyMs: clickMs, wallMs: Date.now() - t0, longTasks: long.length, longTaskTotalMs: round(long.reduce((s, x) => s + x.ms, 0)) }));
  console.log("causes over all long tasks (ms):", top(totals, 30));
  for (const task of [...long].sort((a, b) => b.ms - a.ms).slice(0, Number(process.env.TOP ?? 12))) {
    console.log(`\n@${round(task.start)} ms: ${round(task.ms)} ms`);
    console.log("  causes:", top(task.causes, 8).join(" | "));
    console.log("  self:", top(task.self, 8).join(" | "));
  }
} finally {
  await browser.close();
}
