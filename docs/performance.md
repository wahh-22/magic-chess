# Magic Chess — Loading performance (H9, H10)

The game must never freeze: the menu answers at once, the match loads behind a loading screen
with real progress, the scene appears when it is ready, and neither the start nor the first
capture hitches. This page records how loading is measured, what blocked the main thread,
what fixed it, and what remains. H10 (title menu without the scene) is at the end; the H9
sections describe the scene pipeline it still uses.

## How to measure

Both scripts drive the running dev server (`pnpm dev --port 5173`) in headless Chrome with
software GL (SwiftShader), the same renderer CI uses. Software GL is the worst case: every
GPU operation runs on the CPU in Chrome's GPU process, and the page waits for it whenever a
WebGL call needs a result.

| Script | What it reports |
|--------|-----------------|
| `node scripts/perf/longtasks.mjs <high\|low> [--capture] [--shots] [--idle=<ms>]` | Title menu visible time (and that it has no canvas), "Start game" click latency, Start → scene ready / board revealed / playable (camera arrived, HUD up), long-task count/total/worst and histogram, split into title / loading / play, and with `--capture` the first capture's long tasks and worst frame gap. `--idle` waits on the title before Start (the match prefetches meanwhile; default: Start at once). `--shots` saves title, setup, loading, reveal, HUD, capture and back-to-title screenshots in `.shots/h10-*`. |
| `node scripts/perf/profile.mjs <high\|low>` | A V8 CPU profile (CDP `Profiler`) of the same flow; every busy stretch over 50 ms is grouped by cause (shader link, texture upload, context creation, GPU readback, procedural generation, part splitting, React…) with its hottest functions. `CAPTURE=1` adds the first capture, `MENU_WAIT_MS` sets how long the title idles before Start. |

The warm-up steps are also in the browser's performance timeline as `magic-chess:*`
measures (environment map, uploads, programs, first frame), visible in DevTools.

Numbers vary with machine load (the runs below had a load average of 4–11); compare
counts and orders of magnitude, not single milliseconds.

## Before: what blocked the main thread

Baseline (`e3b5d2c`, high preset unless noted), attributed with the CPU profile:

| Cause | Main-thread time | Why it blocked |
|-------|------------------|----------------|
| Shader program links | 12.9 s high, 8.3 s low | Every program compiled on its first draw, all in the first frames after the menu (three's `onFirstUse` waits for each link). |
| GPU-process backlog (texture uploads, mipmaps, environment map) | 2.5 s `texSubImage2D` + 2.8 s `createBuffer` stalls (low) | `generateMipmap` takes 2–3.5 s per 1024² texture in software GL; drei's `useTexture` also uploaded every texture twice (the original, then the configured clone). The next WebGL call waited for all of it. |
| WebGL context creation | 2.3–2.7 s | One native call in software GL (tens of ms on a GPU). |
| Procedural ruins, terrain, plaza, scatter layout | ~1.0 s | Built synchronously while mounting. |
| Destruction parts split + CPU skinning | ~0.6 s | Every piece's armour parts were split while loading, although only a capture needs them. |
| `AudioContext` creation | 0.1–0.3 s | Inside the first click (required by autoplay rules). |

Two later discoveries mattered as much:

- **PCFSoft shadow maps.** React Three Fiber's `shadows` asks for `PCFSoftShadowMap`, which
  three r186 replaces by `PCFShadowMap` at the first shadow render. Every program compiled
  before that frame carried the wrong shadow define and was compiled again (8 s on low, and
  the 4.5 s + 3.1 s hitch at the first capture). The scene now asks for PCF explicitly —
  what three already rendered.
- **Looping CSS animation.** A looping glint on the loading bar (and the menu's
  `backdrop-filter`) made the compositor redraw every frame; with software GL the shared GPU
  process then starved WebGL completely (the environment map never finished). The bar now
  repaints a few times per second, without animation or blur.

## Before / after

Dev server, SwiftShader, 1280×800, Start pressed as soon as it is visible.

| Metric | High before | High after | Low before | Low after |
|--------|-------------|------------|------------|-----------|
| "Start game" click latency | 3.7–4.5 s | 0.4–0.8 s | 4.8 s | 0.9–1.2 s |
| Start button visible | 0.6 s | 4.0–4.7 s ¹ | 0.6 s | 4.3–4.5 s ¹ |
| First interactive frame | 40–42 s ² | 15.2–15.4 s | 27.4 s ² | 13.4–15.1 s |
| Long tasks: count / total | 28–30 / 37–40 s | 7 / 3.0–4.1 s | 25 / 24.9 s | 7 / 3.4 s |
| Worst long task | 9.6–10.9 s | 1.8–2.9 s ³ | 6.9 s | 2.0–2.1 s ³ |
| Long tasks while the menu is shown | (all of the above) | 5 / 0.87 s, worst 0.30 s | (all of the above) | 5 / 1.0 s, worst 0.39 s |
| First capture (e4 d5 exd5) | 4.5 s + 3.1 s link stalls ⁴ | 3 tasks / 0.3 s, worst 0.11 s | — | 3 tasks / 0.37–0.46 s, worst 0.16–0.19 s |
| Linked programs (after capture) | — | 50 | — | 25 |

¹ The menu appears once the WebGL context exists: creating it is the one long task left in
software GL, so it runs behind the splash instead of freezing a menu that looks usable.
On a GPU this costs tens of milliseconds.
² Before: ten frames after the click; the scene compiled and uploaded everything then.
³ WebGL context creation, before the menu is shown.
⁴ Measured mid-way (before the shadow-type fix); the baseline compiled the same programs.

Screenshots: `.shots/h9-loading-menu-<preset>.png` (bar under the menu, mid-progress),
`.shots/h9-loading-full-<preset>.png` (Start pressed early), `.shots/h9-reveal-<preset>.png`,
`.shots/h9-first-capture-<preset>.png`.

## What changed

| Cause | Fix | Where |
|-------|-----|-------|
| No feedback, menu frozen | Branded loading screen with real progress: bytes for downloads (streamed `fetch`), then build, upload and shader steps; static splash from first paint; the bar sits under the menu, which stays usable; "Start game" pressed early waits behind the full loading screen and starts when the critical set is ready. | `src/loading/progress.ts`, `fetchProgress.ts`, `src/ui/LoadingScreen.tsx`, `index.html` |
| Everything loaded at once | Staged loading: the critical set (board, pieces, sky, ground, lights, capture effects, post stack) downloads at app start and mounts hidden; the canvas does not render (`frameloop="never"`) until it is prepared; then it fades in. Scanned nature (secondary) streams after the critical downloads, is prepared hidden and dissolves in. | `src/loading/stagedLoader.ts`, `src/scene/sceneAssets.ts`, `SceneWarmup.tsx`, `StreamIn.tsx` |
| Program links on first draw | Every program is compiled before the reveal, a slice at a time: with `KHR_parallel_shader_compile` the link runs in the background and is only queried when ready; without it (software GL) a GPU fence waits for the link without blocking. Hidden stand-ins add programs that appear later (debris, fragments, dust, selection markers). Post-processing scenes compile into a render target (they render through one). One warm frame behind the loading screen links what only a render compiles (shadow depth, post passes). | `src/loading/programWarmup.ts`, `src/scene/effects/EffectsWarmup.tsx`, `src/scene/Board.tsx` |
| GPU work stalling the next WebGL call | Time-sliced GPU queue: one upload (or environment map) at a time, each awaited through a WebGL 2 fence polled with a zero-timeout `clientWaitSync` (non-blocking; Chrome refreshes `getSyncParameter` only as frames are produced). | `src/loading/timeSlicedQueue.ts`, `gpuFence.ts`, `assets.ts` |
| Image decode and mipmaps | Images decode off the main thread (`createImageBitmap`, flipped while decoding); each texture uploads once. With software GL the mip chain is resized in a worker instead of `generateMipmap`. | `src/loading/assets.ts`, `mipmaps.ts`, `mipmap.worker.ts` |
| Procedural generation | Ruins, terrain, plaza and the scatter layout are built in a Web Worker and transferred without copying (main-thread fallback: one part per task). | `src/scene/environment/environment.worker.ts`, `environmentData.ts`, `geometryTransfer.ts` |
| Destruction parts | Split on first use and pre-split in idle callbacks once the scene is shown (one piece/colour per callback). | `src/scene/pieces/gltfPieces.ts`, `src/scene/effects/destructionParts.ts` |
| Meshopt decoding | Decoder workers. | `src/loading/assets.ts` |
| Lazy extension queries | Enabled while the context is created. | `src/scene/ChessScene.tsx` |

Graphics preset changes prepare the new scene behind the loading screen too ("Applying the
new graphics").

## H10 — title menu without the scene, match loading after Start

The H9 menu sat over the scene and appeared only once the WebGL context existed (4–6 s in
software GL). H10 splits the app in two (architecture decision D17):

```text
title (DOM + key art) ─▶ match setup ─▶ Start ─▶ loading screen ─▶ reveal ─▶ play
        ▲   no canvas, no three.js         canvas + scene + Stockfish        │
        └──────────── Menu: the scene stays mounted, hidden, not rendering ◀─┘
```

| Step | What happens | Where |
|------|--------------|-------|
| First paint | `index.html` paints the title's first frame (inlined key-art placeholder, logo) and preloads the title image; React adds the menu in the same place. | `index.html`, `src/ui/TitleScreen.tsx`, `KeyArt.tsx` |
| Title | Plain DOM; CSS ken-burns drift and a few CSS embers (off under reduced motion). The main chunk has no three.js: the match (canvas, scene, HUD) is a lazy chunk. | `src/ui/App.tsx`, `Match.tsx` |
| Prefetch while the title idles | In an idle callback: the match chunk, then its bytes at low priority, two at a time — Stockfish into the HTTP cache, critical textures and models (from the model manifest), then the secondary set — kept as bytes, never decoded. Skipped with Save-Data. | `src/loading/prefetch.ts`, `src/scene/sceneAssets.ts` |
| Start | Full-screen loading screen first; the canvas is created two frames later (context creation is one long task). The H9 pipeline runs (critical set, warm-up, secondary set) plus the Stockfish handshake vs the engine; downloads take the prefetched bytes (`fetchAsset` → prefetch cache) and the bar counts them. | `src/ui/App.tsx`, `src/loading/assets.ts`, `LoadingScreen.tsx` |
| Reveal | When the critical set, Stockfish and the secondary set are ready (the secondary set gets at most 12 s), the game starts; the loading screen fades through black while the camera arrives from above (2.6 s, a click or key skips it); the HUD fades in. | `src/ui/flow.ts`, `src/scene/camera/ArrivalCamera.tsx`, `arrival.ts` |
| Menu → title | The scene stays mounted with `frameloop="never"` and `visibility: hidden`; a rematch reveals it at once. A graphics change on the title waits for the next Start (then prepared behind the loading screen). | `src/ui/Match.tsx`, `App.tsx` |

### What the reveal taught

- **Full-screen layers over the canvas stall software GL.** With the loading screen fading,
  a black veil lifting and the HUD fading in over the first frames, the page froze 2–6 s
  (the CPU profile: one `uniformMatrix4fv` waiting for the GPU process). A veil that only
  stepped six times still froze it; with no layer over the canvas the stall was gone (two
  runs each). With software GL the loading screen now cuts straight to the scene and the
  HUD and tips appear without fading; on a GPU the fades stay.
- **The arrival shot frames the plaza.** A low shot across the land (ruins, foliage, terrain)
  costs several times more per frame than the play camera and froze software GL for up to
  5.8 s; the arrival now descends from above the board.
- **Draw everything once behind the loading screen.** The warm-up frame used to draw only
  what the play camera sees; any other camera then paid first draws (buffer uploads, and
  in software GL pipeline builds). The warm frame now renders with frustum culling off.

### Numbers

Dev server, SwiftShader, 1280×800, load average 5–6 (compare orders of magnitude). "Idle" is
how long the title was shown before Start; vs the engine (`longtasks.mjs`).

| Metric | Low | High |
|--------|-----|------|
| Title menu visible (navigation → menu) | 118–135 ms | 120–124 ms |
| Canvas on the title / long tasks while it is shown | none / 2, worst 0.13–0.17 s | none / 2, worst 0.12–0.17 s |
| "Start game" click latency — idle 6 s / 1.5 s / Start at once | 30 ms / 236 ms / 1.3 s ¹ | 41 ms / — / 1.9 s ¹ |
| Start → critical set ready — idle 6 s / at once | 8.8 s / 12.1 s | 10.3 s / 13.3 s |
| Start → board revealed — idle 6 s / at once | 10.8 s / 13.9 s | 12.0 s / 15.0 s |
| Start → playable (camera arrived, HUD up) — idle 6 s / at once | 15.3 s / 19.1 s ² | 18.2 s / 20.3 s ² |
| Long tasks Start → playable — idle 6 s / at once | 13 / 1.1 s, worst 0.23 s; 15 / 2.0 s, worst 0.81 s ³ | 4 / 0.49 s, worst 0.31 s; 6 / 1.4 s, worst 0.77 s ³ |
| Long tasks in the first 6 s of play | 0 | 0 |
| Rematch (Menu → Start): Start → revealed / → playable | 0.03–0.09 s / 2.7–2.9 s ² | — |

The prefetch takes about 3 s off the loading (scene ready 12.1 → 8.8 s low, 13.3 → 10.3 s
high). H9 for comparison: menu visible after 4.0–4.7 s, first interactive frame 13.4–15.4 s
after navigation, with the secondary set streaming in after the reveal and no arrival.

¹ Start pressed ~0.1 s after the title appears, while the match code is still evaluating
(hundreds of modules in the dev server); no player gets there that fast.
² Includes the camera arrival; software GL renders it at a few frames per second, so it
ends by its timer (2.6 s + 1.5 s grace). On a GPU it takes 2.6 s.
³ The worst task is WebGL context creation (0.7–1 s here), behind the loading screen.

Screenshots: `.shots/h10-title-<preset>.png`, `h10-setup-*`, `h10-loading-*` (mid-progress),
`h10-reveal-*`, `h10-hud-*`, `h10-back-to-title-*` (`longtasks.mjs --shots`).

## Regression guard

- `scripts/smoke.mjs` (low preset) fails when the title menu takes longer than
  `2500 ms × TIMEOUT_SCALE` to show, when a canvas exists on the title or the match setup,
  or when "Start game" takes longer than `1000 ms × TIMEOUT_SCALE` (4 s at CI scale; the old
  loading took 4–5 s unscaled); it then waits for the reveal, plays, and checks that Menu
  returns to the title with the scene parked hidden.
- `scripts/perf/longtasks.mjs` gives the full numbers above.
- Unit tests cover the progress aggregation, the time-sliced queue, the staged loader, the
  fence, the program warm-up, mip chains, geometry transfer, the idle part splitting, and
  (H10) the app flow and reveal gate, menu navigation, the prefetch cache and list, the
  loading tips and bar, the arrival camera and the key-art placeholders.

## Still open

- **WebGL context creation** (0.7–5 s in software GL) cannot be split; since H10 it runs
  after Start, behind the loading screen. On a GPU it is tens of milliseconds.
- **Arrival in software GL** renders at a few frames per second (it ends by its timer).
- **Prefetched code is evaluated** in an idle callback on the title (one task per module;
  the three.js chunk is the largest): a Start pressed in that instant waits for it.
- **The parked scene** keeps its WebGL context and GPU memory while the title is shown.
- **First warm frame**: shadow-depth and post-processing programs compile inside the one
  frame rendered behind the loading screen (three gives no async path for them); its GPU
  work then finishes without blocking (3–5 s in software GL).
- **`AudioContext`** is created in the first click or key press (0.1–0.3 s headless) — since
  H10 on the title, for the menu sounds, not in "Start game".
- **Idle part splitting** is ~0.1 s per piece/colour in software GL; a capture before it
  finishes splits that piece on the spot.
- Tasks while the match loads are 0.1–0.4 s in software GL (GLB parsing, CPU skinning of
  the rigs, React mounting the scene); on a GPU machine they are several times shorter.
