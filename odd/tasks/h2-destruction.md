# H2 — Destruction

Second milestone of the Magic Chess MVP: captured pieces shatter into stone fragments
with decorative physics and dust. Architecture and decisions: `docs/architecture.md` (D3).

## Specs

- **S1** Goal (L1): "quiero hacer un juego de ajedres, como el ajedres magico de harry potter. quiero que sea bastante realista."
- **S2** Destruction approach (D3, L2): "si, asi esta bien" — MVP phase: runtime Voronoi fracture + dust; Rapier physics, decorative only, behind `FractureProvider`.
- **S3** Scope (D6, L3): "vamos con C" — H2 = Voronoi fracture, Rapier debris, dust.
- **S4** Continue (L4): "si, y luego conitnua" — after investigating the intermittent vs-engine timeout, continue with H2.
- **S5** Invariants carried from H1: game state stays authoritative (debris never touches live pieces or game state); every H1 scenario keeps passing; the scene still matches `game.pieces()` after each move.

## Tasks

| ID | Specs | Task | Route | Status | Commit |
|----|-------|------|-------|--------|--------|
| T0 | S4 | Investigate the intermittent vs-engine timeout from H1 T10. | inline | done | ce3298c |
| T1 | S2 | `FractureProvider` + Voronoi fracture with convex-hull fragments, cached per piece type, deterministic seed. Tested. | worker | done | 9be06a0 |
| T2 | S2, S5 | Animation: replace the capture "sink" with a "shatter" moment (piece hides at impact) and an impact callback with position and attack direction. Tested. | inline | done | 5e5d11c |
| T3 | S2, S5 | Rapier debris layer: board/frame ground colliders, fragments as convex-hull bodies, impulse away from the attacker, lifetime + fade + cleanup. Pure impulse helper tested. | worker | done | 190a711 |
| T4 | S2 | Dust burst particles at impact (soft canvas sprite, expand + fade). | inline | done | e109a0a |
| T5 | S1–S5 | Tuning in `animation.json`, H1 smoke + scenarios still pass, screenshots of a capture mid-shatter. | inline | done | c174a46 |

Design note (T1): an exact Voronoi split needs mesh clipping/CSG, which is fragile on
the merged procedural pieces. Fragments are instead the convex hulls of the points
(surface vertices + interior samples) nearest to each Voronoi seed: robust, rock-like,
and convex, which is what Rapier needs for fast colliders.

## Log

- **L1** (user, original request): "quiero hacer un juego de ajedres, como el ajedres magico de harry potter. quiero que sea bastante realista. como lo puedo conseguir?"
- **L2** (user, D3): "si, asi esta bien"
- **L3** (user, D6): "vamos con C"
- **L4** (user, after H1 close): "si, y luego conitnua"
- **L5** (T0 evidence): vs-engine flake not reproduced: 8/8 under parallel load, 13 passes vs 1 failure overall; the failure's store state was printed but truncated by the parent's output filter. Code review found a latent desync (a timed-out search's late bestmove could answer the next request); fixed with stop + resync (ce3298c). Full failures now persist in .shots/scenario-*.fail.txt.
- **L6** (T5 evidence): debris tuned (impulse 1.8→0.8, upward 1.6→1.15), live pieces get fixed collider proxies, frame containment; 163 tests, smoke, 7 scenarios, build pass. Known limitation: the moving attacker has no collider during its animation, so it can overlap fresh debris until it settles.
- **L7** (fix, branch fix/attacker-debris-overlap): the attacker-overlap limitation from L6 is resolved — impact at first contact + kinematic proxies; Rapier regression test: 0 penetrations, induced speed 3.74 u/s vs 5.37 before (attacker peak 3.30).
