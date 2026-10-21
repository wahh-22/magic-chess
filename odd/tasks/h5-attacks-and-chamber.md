# H5 — Attack animations and a realistic stone chamber

The capturing piece visibly attacks its victim (skeletal animation for humanoid
pieces, procedural choreography for the knight and the rook), and the board sits in
a realistic stone chamber like the film. Architecture: `docs/architecture.md` (D13–D15).

## Specs

- **S1** Request (L1): "la animacion de destruccion debe ir acompañado de movimientos de la pieza que esta destruyendo la otra. asi como pasa en la pelicula de harry potter."
- **S2** Request (L1): "el ambiente del juego tambien tiene que dejar de ser tan sencillo. y armar una ambiente realista"
- **S3** Attack approach (D13, L2): "Animación con esqueleto desde el inicio" — humanoid pieces (pawn, bishop, queen, king) rigged and animated with Meshy (Auto Rigging + Animation Library, GLB export). The knight (head-and-neck bust) and the rook (tower) cannot be rigged, so they get procedural attack choreography.
- **S4** Setting (D14, L2): "Cámara de piedra como la película (Recomendado)" — the board on a stone dais in a dark vaulted stone hall, torches, fog, dust in the air.
- **S5** Assets (D15, L2): "CC0 + iluminación procedural (Recomendado)" — CC0 PBR textures/HDRI/props (Poly Haven, ambientCG), lighting, fog, particles and post-processing in code.
- **S6** Invariants: game state stays authoritative; the impact (shatter, dust, sound, camera) is synchronized with the attack's hit; every existing test, smoke step and browser scenario keeps passing; the game stays playable on modest hardware (graphics quality setting).

## Tasks

| ID | Specs | Task | Route | Status | Commit |
|----|-------|------|-------|--------|--------|
| T1 | S2, S4, S5, S6 | Stone chamber: CC0 PBR stone floor/walls, vaulted hall with pillars and arches, stone dais under the board, torches with flickering lights and flames, fog, floating dust, interior HDRI for reflections, post-processing (tone mapping, bloom, ambient occlusion, vignette), graphics-quality setting (high/low). | worker A | done | 897543a, 154f946 |
| T2 | S1, S3, S6 | Procedural attack choreography for the knight (rear up, strike down) and the rook (lift, slam), timed so the strike is the impact; camera shake on impact. Also the fallback for any piece without a rigged attack clip. | worker B | done | 90b2237 |
| T3 | S1, S3 | Pawn rigging pilot (user, in Meshy): auto-rig the pawn, apply an idle and a sword attack animation, export GLB (guide: `docs/models/rigging-guide.md`). | user | blocked | — |
| T4 | S1, S3, S6 | Skeletal pipeline: process skinned GLBs keeping skeleton, weights and clips; loader with per-piece animation mixers; the attack clip's hit time drives the impact; idle loop. Built and tested against a synthetic skinned fixture, then the pawn pilot. | worker | done | 458a390 |
| T5 | S3 | Decide with the user after the pilot: rig bishop, queen, king as-is or regenerate them in A-pose without plinth (plinth added in code). | user | pending | — |
| T6 | S1–S6 | Integration, performance check, regression (tests, smoke, scenarios), screenshots, deploy. | inline | pending | — |

## Log

- **L1** (user): "ok. pero falta algo al juego. y es que la animacion de destruccion debe ir acompañado de movimientos de la pieza que esta destruyendo la otra. asi como pasa en la pelicula de harry potter. y el ambiente del juego tambien tiene que dejar de ser tan sencillo. y armar una ambiente realista"
- **L2** (user, H5 decisions): Ataque "Animación con esqueleto desde el inicio"; Ambiente "Cámara de piedra como la película (Recomendado)"; Assets "CC0 + iluminación procedural (Recomendado)".
- **L3** (research, Meshy docs checked 2026-10-20): auto-rigging supports humanoid and quadruped characters and works best in T-pose/A-pose; 600+ animation presets incl. 35 "attacking with weapon" clips; GLB export. Programmatic rigging "only works well with standard humanoid (bipedal) assets with clearly defined limbs". Our humanoids hold staffs/shields, wear robes and stand on plinths, so rig quality is uncertain → pawn pilot first (T3).
- **L4** (evidence): chamber, procedural knight/rook attacks + shake, skeletal pipeline (synthetic rig verified in browser), marble board; 276 unit tests ×3 runs, smoke, 13 scenarios pass. Found and fixed: the scene rendered continuously behind the setup menu, saturating the main thread on slow GPUs (now frameloop "demand" in setup). Pending: user's rigged pawn (T3), A-pose decision (T5), real-GPU performance check, clear-coat glare tuning on the marble.
