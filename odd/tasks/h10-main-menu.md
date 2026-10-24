# H10 — AAA main menu and match loading
A standalone title menu that does not show the game environment; the match (environment, pieces, animations, effects, engine) loads only after everything is selected, behind a full loading screen, like Chess Infinity.
Branch `feat/h10-main-menu` from main (43e85b0, H9 deployed).

## Specs
- S1 (L1): "este es un juego al nivel de AAA, entonces el menu no debe mostrar el ambiente del juego aun." The title menu shows no 3D scene and no battlefield; it appears instantly (no WebGL context needed for the menu).
- S2 (L1): "sino cuando ya este todo seleccionado y que se cargue la partida y lo necesario que se haya que cargar, las fichas, movimientos y todo lo demas necesario para el juego." The game scene (environment, pieces, animations, effects, programs, Stockfish) is created and prepared only after the player has chosen everything and pressed start, behind a full-screen loading screen with real progress; then the match is revealed. Network prefetch of bytes during the menu is allowed only if invisible and non-blocking.
- S3 (L1): "asi como chess infinity. que sea lo mas acorde posible al juego" — the menu and loading screen match the game's style (dark, cinematic, medieval ARCANA ivory vs obsidian, Cinzel/Cormorant, gold filigree), with an AAA flow: title screen → match setup → loading → cinematic reveal.
- S4 (L2): menu background = "Arte clave ARCANA": a cinematic key-art image of the ARCANA pieces (an ivory knight facing an obsidian one in darkness, embers, subtle motion), rendered with our engine, instant to load.

## Tasks
- T1 S4 worker (worktree feat/h10-art) — render key-art images with the engine (title background, loading-screen art), WebP, size budget, credits/licence. commit: —
- T2 S1-S3 worker — title menu without the scene, setup screens, start → mount scene behind the full loading screen, invisible byte prefetch, cinematic reveal; tests, smoke/scenarios, docs. commit: —
- T3 S1-S4 — integrate art, verify (tests, smoke ×3 at CI scale, scenarios, live-like preview), screenshots, delivery. commit: —

## Log
- L1 (user): "vamos a mejorar el menu. este es un juego al nivel de AAA, entonces el menu no debe mostrar el ambiente del juego aun. sino cuando ya este todo seleccionado y que se cargue la partida y lo necesario que se haya que cargar, las fichas, movimientos y todo lo demas necesario para el juego. asi como chess infinity. que sea lo mas acorde posible al juego"
- L2 (user decision): menu background "Arte clave ARCANA (recomendado)" — key art of ivory vs obsidian knights in darkness with embers and subtle motion, rendered with our engine, instant.
- L3 evidence: the current menu mounts over the 3D scene and waits for the WebGL context (menu visible at ~6.1 s live, low preset, SwiftShader). Steam publishes no Chess Infinity menu screenshots; its visual language is dark cinematic backgrounds, classic serif type, crests and generous negative space (.shots/ref-ci-sheet.jpg).
