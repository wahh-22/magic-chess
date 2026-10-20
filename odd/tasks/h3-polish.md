# H3 — Polish

Third milestone of the Magic Chess MVP: stone sounds, cinematic capture camera,
last-move highlight, undo, chess clock, and save/load. Architecture and decisions:
`docs/architecture.md` (D6–D10).

## Specs

- **S1** Goal (L1): "quiero hacer un juego de ajedres, como el ajedres magico de harry potter. quiero que sea bastante realista."
- **S2** Scope (D6, L2): "vamos con C" — H3 = sounds, cinematic capture camera, move history, undo, clock, save game.
- **S3** Sounds (D7, L4): "Grabaciones libres CC0 (Recomendado)" — CC0 recordings behind a `SoundProvider`.
- **S4** Undo (D8, L4): "Deshace tu jugada y la de la IA (Recomendado)" — vs engine: your move + its reply; local: one move.
- **S5** Clock (D9, L4): "Opcional con presets (Recomendado)" — none / 5+0 / 10+5 / 15+10; flag fall loses unless the opponent cannot mate (draw).
- **S6** Save (D10, L4): "Autoguardado + exportar/importar PGN (Recomendado)".
- **S7** Continue (L3): "si, dale".
- **S8** Invariants: game state stays authoritative; every H1 scenario and the H2 captures keep working; the scene matches `game.pieces()` after every move, undo, and load.

## Tasks

| ID | Specs | Task | Route | Status | Commit |
|----|-------|------|-------|--------|--------|
| T1 | S4, S8 | Undo in `GameState` (piece ids restored) and store (`undo` per D8, blocked while animating/thinking, clears effects); HUD button. | worker A | done | c231c75 |
| T2 | S5, S8 | Chess clock: pure clock model in core (presets, increment, flag fall, insufficient-material draw), new timeout outcomes, store + setup option + HUD display. | worker A | done | c231c75 |
| T3 | S6, S8 | Autosave to localStorage + "Continue game" on setup; PGN export (download) and import (file) with piece ids rebuilt by replay. | worker A | done | c231c75 |
| T4 | S3 | `SoundProvider` + Web Audio sampler, CC0 stone samples (license recorded), sounds for move, impact/shatter, debris landing, check, game end; mute toggle; autoplay unlock. | worker B | done | 6f9f907 |
| T5 | S2 | Cinematic camera on captures of non-pawn pieces and on checkmate (approach, hold, return; respects user orbit; toggle) + last-move highlight on the board. | worker C | done | 69a5907 (integration in T6) |
| T6 | S1–S8 | Integration in App, attacker-overlaps-debris polish, scenarios extended (undo, clock timeout, save/resume, PGN round trip), screenshots, close H3. | inline | done | 7708d0f, ed84635 |

## Log

- **L1** (user, original request): "quiero hacer un juego de ajedres, como el ajedres magico de harry potter. quiero que sea bastante realista. como lo puedo conseguir?"
- **L2** (user, D6): "vamos con C"
- **L3** (user, after H2 close): "si, dale"
- **L4** (user, H3 decisions): Sonidos "Grabaciones libres CC0 (Recomendado)"; Deshacer vs IA "Deshace tu jugada y la de la IA (Recomendado)"; Reloj "Opcional con presets (Recomendado)"; Guardar "Autoguardado + exportar/importar PGN (Recomendado)".
- **L5** (verification): 226 unit tests, smoke, 13 browser scenarios (H1 rules, undo local/vs engine, clock timeout and timeout draw, autosave resume, PGN round trip + invalid import), and build pass; cinematic shot verified by screenshot (Qxe6). Not verified by tests: how the CC0 sounds actually sound (needs the user's ears). T1–T3 share one commit because they edit the same store/HUD files. Still open: the moving attacker has no collider while it moves, so it can briefly overlap fresh debris.
