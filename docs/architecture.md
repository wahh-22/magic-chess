# Magic Chess — Architecture

A realistic 3D chess game inspired by the "wizard chess" style: stone pieces that
move on their own and shatter when captured. Web first, designed so the assets and
design can migrate to Unity or Unreal later if needed.

## Guiding principles

1. **Logic is separate from presentation.** The game core (state, rules, engine,
   commands) is plain TypeScript and never imports React, Three.js, or Rapier.
   The 3D layer only renders what the core already decided.
2. **The game state is authoritative; physics is decorative.** `chess.js` decides
   every position. Pieces move by controlled animation. Physics only drives the
   fragments of a piece that was already captured.
3. **Every replaceable part sits behind an interface:** piece models, fracture
   source, chess engine, and command input.
4. **Assets live outside the engine.** Blender is the source of truth for models,
   so they can be exported (glTF/FBX) to any engine.
5. **Tunables are data.** Animation timings, speeds, and styles live in JSON
   config, not hard-coded values.

## Layers

```text
┌──────────────────────────────────────────────────────────┐
│ UI (React): setup, HUD, promotion picker, game over      │
├──────────────────────────────────────────────────────────┤
│ Scene (React Three Fiber + drei)                         │
│   board · pieces · lighting · camera · animation queue   │
│   destruction (Rapier, decorative only)                  │
├──────────────────────────────────────────────────────────┤
│ Core (pure TypeScript, no rendering imports)             │
│   GameState (chess.js) · CommandParser · Engine port     │
└──────────────────────────────────────────────────────────┘
        ▲                                   ▲
        │ PieceModelProvider                │ Engine (UCI)
        │ FractureProvider                  │ Stockfish in a Web Worker
```

Data flow for one move: input (click, later voice) → text command →
`CommandParser` matches it against the legal moves → `GameState` applies it →
the scene receives a move event → the animation queue plays it → the scene
reports "animation done" → the next turn starts (or the engine is asked).

## Decisions

| ID | Decision | Rationale | Revisit when |
|----|----------|-----------|--------------|
| D1 | Web first: React Three Fiber + `drei` + TypeScript, built with Vite. | Rules and AI are solved by proven libraries; code-first work is easy to iterate, test, and version. R3F fits a game with a lot of UI. Unity was rejected because it is not best on either priority (realism → Unreal, iteration speed → web) and its HDRP does not export to web. | Visual realism hits the web ceiling; then migrate the presentation layer. Code is rewritten; assets, design, and test scenarios carry over. |
| D2 | Pieces: procedural (lathe geometry) in the MVP; AI-generated models (Meshy/Tripo/Rodin) cleaned in Blender later. Loaded through `PieceModelProvider`. | Procedural pieces unblock gameplay work immediately; AI generation gives an own style quickly. Designs must be *inspired by* the film, never copies (Warner Bros IP). | AI model licenses or topology quality are unacceptable. |
| D3 | Destruction: runtime Voronoi fracture + dust particles in the MVP; Blender Cell Fracture + dust with AI models. Physics with Rapier (`@react-three/rapier`), decorative only. Both behind `FractureProvider`. | Voronoi works on clean, closed procedural meshes; AI meshes go through Blender anyway, so pre-fracturing joins that pipeline. Rapier is WASM, fast, and native to R3F. | Fracture cost hurts frame rate. |
| D4 | AI opponent: Stockfish lite, single-threaded WASM, in a Web Worker, behind an `Engine` interface speaking UCI. Difficulty via `UCI_Elo`. | Strongest free engine, no server, standard protocol that also exists natively for Unity/Unreal. Single-threaded avoids COOP/COEP headers. **GPLv3:** if published, Stockfish source must be offered; it runs as a separate program over UCI. | License becomes a problem (swap for a permissive JS engine) or low levels feel inhuman (consider Maia). |
| D5 | No voice in the MVP. All moves already go through the text `CommandParser`. Later: Web Speech API for recognition plus speech synthesis. | Matching recognized text against ~30 legal moves matters more than the recognizer. Voice becomes just another text source. | Privacy or Firefox support matters (switch to local Whisper). |
| D6 | MVP scope C (base + destruction + polish), desktop browsers only, delivered in milestones H1 → H2 → H3, each playable and verified. | User decision. Milestones keep something playable at all times. | — |
| D7 | Sounds: CC0 recordings (Kenney / Sonniss) behind a `SoundProvider` interface, played with Web Audio. | Recordings sound like stone; CC0 needs no attribution. The interface allows swapping packs. | A pack lacks a convincing stone sound. |
| D8 | Undo: vs the engine, undo reverts your move and the engine's reply; in local mode, one move. | Players expect to get their own turn back. | — |
| D9 | Clock: optional, presets none / 5+0 / 10+5 / 15+10. Running out of time loses, unless the opponent cannot mate (draw, FIDE rule). The engine's clock runs too. | Real chess rules; off by default keeps casual play relaxed. | — |
| D10 | Save: autosave in the browser (continue later) plus PGN export/import. | Never lose a game; PGN is the standard format to share and analyse games. | — |
| D11 | Realistic piece models: the user generates them on the web (Meshy or Tripo) from the prompts in `docs/models/generation-guide.md` and drops the GLB files in `assets/models/source/`; one light-stone set, black pieces are a tinted copy. | No shared credentials; one consistent set for both sides. | Generated quality or license (free plans may require CC BY attribution) is not acceptable. |
| D12 | Model cleanup is an automated Node pipeline (`scripts/process-models.mjs`, gltf-transform + meshoptimizer) instead of Blender: normalize frame and size, simplify, compress textures. Fracture stays runtime Voronoi for every mesh (supersedes the Blender pre-fracture phase of D3). | Reproducible and versioned; Blender is not installed; runtime fracture already handles any mesh. | A model needs hand repair that code cannot do. |
| D13 | Attacks: humanoid pieces (pawn, bishop, queen, king) get skeletal animation from Meshy Auto Rigging + Animation Library (idle + weapon attack clips, GLB); the attack clip's hit time drives the impact. The knight bust and the rook tower cannot be rigged and use procedural attack choreography, which is also the fallback for any piece without an attack clip. | User chose skeletal animation from the start; it is the closest to the film. Pawn pilot first because Meshy rigs best in T/A-pose and our figures hold props on plinths. | Pilot rig quality is poor → regenerate humanoids in A-pose without plinth. |
| D14 | Setting: a dark vaulted stone chamber like the film — the board on a stone dais, pillars, arches, torches, fog, floating dust. | Matches the film and the user's choice. | — |
| D15 | Environment assets are CC0 (Poly Haven / ambientCG PBR textures, HDRI, props) with lighting, fog, particles and post-processing in code; a graphics-quality setting keeps modest hardware playable. | Free, realistic, license-clean; procedural lighting keeps it tunable. | Performance on low-end devices is unacceptable even on "low". |

## MVP milestones

- **H1 — Core gameplay:** board, procedural pieces, full rules (castling, en
  passant, promotion with picker, mate, stalemate, threefold repetition, 50-move
  rule, insufficient material), animated movement, Stockfish with difficulty,
  vs AI and local 2 players, game-over screen. Captured pieces sink as a
  placeholder.
- **H2 — Destruction:** Voronoi fracture, Rapier debris, dust.
- **H3 — Polish:** sounds (stone steps, shattering), cinematic capture camera,
  move history, undo, clock, save/load game.

## Out of the MVP

AI-generated models, voice, online multiplayer, mobile, and the "play as a piece"
first-person mode.
