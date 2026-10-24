// Renders the ARCANA key art with the engine (tools/key-art.html) and writes WebP files to
// public/art/ within a size budget, plus a tiny blurred placeholder per image (docs/art.md).
// Needs the dev server: pnpm exec vite --port 5174 --strictPort
// Usage: node scripts/art/render-key-art.mjs [--url http://localhost:5174] [--only title,loading-1] [--preview 0.5]
// --preview renders at a fraction of the size into .shots/key-art/ only (public/art/ is untouched).
import { mkdirSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { chromium } from "playwright";
import sharp from "sharp";

const { values } = parseArgs({
  options: {
    url: { type: "string", default: process.env.URL ?? "http://localhost:5174" },
    only: { type: "string" },
    preview: { type: "string" },
    // Supersampling: render larger and downsize with Lanczos for crisper thin edges (lances, staffs).
    ss: { type: "string", default: "1.5" },
  },
});

const OUTPUTS = [
  { name: "title", width: 2560, height: 1440 },
  { name: "title-portrait", width: 1080, height: 1920 },
  { name: "loading-1", width: 2560, height: 1440 },
  { name: "loading-2", width: 2560, height: 1440 },
];
const IMAGE_BUDGET = 350 * 1024;
const TOTAL_BUDGET = 1.2 * 1024 * 1024;
const LQIP_BUDGET = 2 * 1024;
const LQIP_WIDTH = 32;
// Software GL renders a 2560×1440 frame with shadows, MSAA and depth of field in minutes.
const RENDER_TIMEOUT_MS = 15 * 60 * 1000;

const scale = values.preview ? Number(values.preview) : 1;
const ss = Number(values.ss);
const only = values.only?.split(",");
const outputs = OUTPUTS.filter((output) => !only || only.includes(output.name));
const shots = ".shots/key-art";
mkdirSync(shots, { recursive: true });
if (!values.preview) mkdirSync("public/art", { recursive: true });

/** Highest WebP quality (sharp, effort 6) that fits the budget; dark gradients need the headroom. */
async function encode(png, budget) {
  let best;
  for (let quality = 96; quality >= 40; quality -= 2) {
    const data = await sharp(png).webp({ quality, effort: 6, smartSubsample: true }).toBuffer();
    best = { data, quality };
    if (data.length <= budget) return best;
  }
  throw new Error(`Cannot fit ${budget} bytes (quality ${best.quality}: ${best.data.length} bytes)`);
}

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const index = {};
let total = 0;
try {
  for (const output of outputs) {
    const width = Math.round(output.width * scale), height = Math.round(output.height * scale);
    const page = await browser.newPage({ viewport: { width: Math.round(width * ss), height: Math.round(height * ss) } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
    page.on("response", (response) => response.status() >= 400 && errors.push(`${response.status()} ${response.url()}`));
    const started = Date.now();
    await page.goto(`${values.url}/tools/key-art.html?shot=${output.name}&ss=${ss}`);
    await page.waitForFunction(() => globalThis.__keyArt?.state !== "rendering", undefined, { timeout: RENDER_TIMEOUT_MS, polling: 1000 });
    const status = await page.evaluate(() => globalThis.__keyArt);
    if (status.state !== "ready") throw new Error(`${output.name}: ${status.error}`);
    if (errors.length) throw new Error(`${output.name}: ${errors.join("\n")}`);
    const frame = await page.locator("canvas").screenshot({ type: "png" });
    const png = ss === 1 ? frame : await sharp(frame).resize(width, height, { kernel: "lanczos3" }).png().toBuffer();
    await page.close();
    writeFileSync(`${shots}/${output.name}.png`, png);
    const seconds = ((Date.now() - started) / 1000).toFixed(0);
    if (values.preview) {
      console.log(`${output.name}: ${width}×${height} preview in ${seconds} s → ${shots}/${output.name}.png`);
      continue;
    }
    const image = await encode(png, IMAGE_BUDGET);
    const lqip = await sharp(png).resize(LQIP_WIDTH).blur(0.6).webp({ quality: 50 }).toBuffer();
    if (lqip.length > LQIP_BUDGET) throw new Error(`${output.name}: placeholder is ${lqip.length} bytes`);
    writeFileSync(`public/art/${output.name}.webp`, image.data);
    writeFileSync(`public/art/${output.name}-lqip.webp`, lqip);
    total += image.data.length;
    index[output.name] = {
      src: `/art/${output.name}.webp`, width, height,
      lqip: `data:image/webp;base64,${lqip.toString("base64")}`,
    };
    console.log(`${output.name}: ${width}×${height} in ${seconds} s, WebP q${image.quality} ${(image.data.length / 1024).toFixed(1)} KB, placeholder ${lqip.length} B`);
  }
} finally {
  await browser.close();
}

if (!values.preview) {
  console.log(`total: ${(total / 1024).toFixed(1)} KB`);
  if (!only && total > TOTAL_BUDGET) throw new Error(`Key art exceeds the total budget: ${total} bytes`);
  // A partial run (--only) keeps the other entries of the existing index.
  const path = "public/art/key-art.json";
  let previous = {};
  try { previous = JSON.parse((await import("node:fs")).readFileSync(path, "utf8")); } catch { /* first run */ }
  writeFileSync(path, `${JSON.stringify({ ...previous, ...index }, null, 2)}\n`);
}
