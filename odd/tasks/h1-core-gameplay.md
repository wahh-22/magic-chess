# H1 — Core gameplay

First milestone of the Magic Chess MVP: a playable 3D chess game with full rules,
animated moves, and a Stockfish opponent. Architecture and decisions: `docs/architecture.md`.

## Specs

- **S1** Goal (L1): "quiero hacer un juego de ajedres, como el ajedres magico de harry potter. quiero que sea bastante realista."
- **S2** Web stack (D1, L4–L5): "podemos hacerlo primero web. y luego pasar a unity o unreal si lo vemos necesario?"; "si, vamos con la recomendacion" (React Three Fiber + drei + TypeScript). The core never imports rendering code.
- **S3** Pieces (D2, L6): "si, vamos con D inicialmente, y luego con C". H1 uses procedural pieces loaded through a swappable `PieceModelProvider`.
- **S4** AI opponent (D4, L8): "si, dale" (Stockfish lite, single-threaded, in a Web Worker, behind an `Engine` interface, difficulty selectable).
- **S5** Commands (D5, L9): "si,  dale con D". No voice; every move goes through the text `CommandParser` that matches input against the legal moves.
- **S6** Scope (D6, L10–L11): "vamos con C"; "si" (desktop browsers only). H1 contents as accepted: board, full rules (castling, en passant, promotion with piece picker, checkmate, stalemate, threefold repetition, 50-move rule, insufficient material), animated movement, Stockfish with difficulty, vs AI and local 2 players, game-over screen. Captured pieces sink as a placeholder until H2.

## Tasks

| ID | Specs | Task | Route | Status | Commit |
|----|-------|------|-------|--------|--------|
| T1 | S2 | Scaffold Vite + React + TypeScript + R3F + drei, Vitest, ESLint, pnpm; `src/core`, `src/scene`, `src/ui` folders. | inline | pending | — |
| T2 | S2, S6 | `GameState` over chess.js: apply move, legal moves per square, promotion, game-over reason (all S6 endings), move events. Pure TS, tested. | inline | pending | — |
| T3 | S5 | `CommandParser`: SAN, UCI, and square-pair text → legal move or explicit error. Clicks produce commands too. Tested. | inline | pending | — |
| T4 | S4 | `Engine` interface + Stockfish Web Worker adapter (UCI, `UCI_Elo`); fake engine for tests. | inline | pending | — |
| T5 | S3 | `PieceModelProvider` + procedural lathe pieces for all six types, two stone materials. | inline | pending | — |
| T6 | S2 | Scene: board, lighting with shadows, orbit camera limits, environment. | inline | pending | — |
| T7 | S5, S6 | Interaction: select piece, highlight legal squares, click to move, promotion picker. | inline | pending | — |
| T8 | S6 | Animation queue: pieces glide between squares, castling moves both pieces, captured piece sinks; core waits for "animation done". Timings in JSON config. | inline | pending | — |
| T9 | S4, S6 | UI: setup (vs AI / local 2 players, color, difficulty), turn/check indicator, game-over screen, new game. | inline | pending | — |
| T10 | S1–S6 | H1 verification: unit suite, build, and manual scenario checklist (castling both sides, en passant, promotion, scholar's mate, stalemate, AI full game). | inline | pending | — |

Notes: the project is not a git repository yet; T1 initializes it so each task can
be committed as a work unit. Delivery (push, remote, publishing) stays a user decision.

## Log

- **L1** (user, original request): "quiero hacer un juego de ajedres, como el ajedres magico de harry potter. quiero que sea bastante realista. como lo puedo conseguir?"
- **L2** (user): "comportate tu como el arquitecto pero yo tomo las decisiones, me das las opciones, con justificaciones y lo revisamos"
- **L3** (user): "y con unity, porque no lo recomiendas?"
- **L4** (user): "podemos hacerlo primero web. y luego pasar a unity o unreal si lo vemos necesario?"
- **L5** (user, D1b React Three Fiber): "si, vamos con la recomendacion"
- **L6** (user, D2): "si, vamos con D inicialmente, y luego con C"
- **L7** (user, D3): "si, asi esta bien"
- **L8** (user, D4): "si, dale"
- **L9** (user, D5): "si,  dale con D"
- **L10** (user, D6): "vamos con C"
- **L11** (user, desktop-only MVP and write the plan): "si"
