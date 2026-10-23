# H9 — Professional loading and smooth start
The game must never freeze: real loading progress, staged streaming, shader warm-up and time-sliced uploads, like a professional game.
Branch `feat/h9-loading` from main (fff4102, H8 deployed).

## Specs
- S1 (L1): "si, realiza 1. pero como juego profesional" — item 1 was: "Carga inicial más fluida: la escena bloquea el navegador unos segundos mientras carga (causa del fallo intermitente); conviene repartir la carga para que la pantalla de inicio siga respondiendo." Professional loading: a branded loading screen with real progress (bytes/assets), the menu stays responsive while assets stream, no main-thread long task above ~50–100 ms on a real GPU (and none above a few hundred ms even in software GL where avoidable), no hitch at game start or at the first capture.

## Tasks
- T1 S1 worker — measure (long tasks + CPU profile attribution), then: loading screen with progress, staged critical/secondary loading, async shader compilation and warm-up, time-sliced GPU uploads, off-main-thread decoding, heavy CPU work moved to workers/idle/time slices, smooth reveal; metrics script and regression guard. commit: —
- T2 S1 — verify (tests, smoke ×3 at CI scale, scenarios, build), before/after metrics to the user, PR. commit: —

## Log
- L1 (user): "si, realiza 1. pero como juego profesional"
- L2 baseline (.shots/longtasks.mjs, high preset, SwiftShader, load avg ~3): load event 555 ms; Start button visible 648 ms; click latency 4467 ms; 10 frames at 42 s; 30 long tasks totalling 39.8 s; worst 9.6 s, 7.4 s, 6.4 s, 5.6 s.
