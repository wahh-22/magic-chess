# H4 — Realistic AI-generated piece models

Replace the procedural placeholder pieces with realistic models generated with AI
(D2 phase C), cleaned by an automated pipeline. Architecture: `docs/architecture.md` (D2, D3, D11, D12).

## Specs

- **S1** Goal (L1): "quiero hacer un juego de ajedres, como el ajedres magico de harry potter. quiero que sea bastante realista."
- **S2** Phasing (D2, L2): "si, vamos con D inicialmente, y luego con C" — procedural first, then AI-generated models.
- **S3** Source (D11, L4): "Tú los generas en la web, yo preparo todo (Recomendado)".
- **S4** Cleanup (D12, L4): "Proceso automático en código (Recomendado)".
- **S5** Continue (L3): "continua".
- **S6** Invariants: missing models fall back to procedural pieces; every H1–H3 scenario keeps passing; fragments, colliders, and selection still line up with the visible piece.

## Tasks

| ID | Specs | Task | Route | Status | Commit |
|----|-------|------|-------|--------|--------|
| T1 | S3 | Generation guide with six prompts and settings (`docs/models/generation-guide.md`). | inline | done | — |
| T2 | S4 | `scripts/process-models.mjs` (`pnpm models`): read `assets/models/source/*.glb` + manifest, join meshes, center x/z, base at y = 0, face +x, scale to per-type height, simplify, resize/compress textures, write `public/models/<type>.glb` + `public/models/manifest.json`. Tested on a synthetic messy fixture. | worker A | pending | — |
| T3 | S2, S6 | `GltfPieceProvider` behind `PieceModelProvider` (geometry + material per type and color; black = tinted copy), loaded from the manifest with procedural fallback; fragment/collider sizing from the loaded geometry; materials for fragments without UV issues. | worker B | pending | — |
| T4 | S6 | Fixture set: procedural pieces exported to messy GLBs, run through the pipeline, played in the browser; regression (smoke, scenarios) and screenshots. | inline | pending | — |
| T5 | S1, S3 | Real models from the user: process, tune heights/orientation in the manifest, record license, screenshots. | inline | blocked | — |

## Log

- **L1** (user, original request): "quiero hacer un juego de ajedres, como el ajedres magico de harry potter. quiero que sea bastante realista. como lo puedo conseguir?"
- **L2** (user, D2): "si, vamos con D inicialmente, y luego con C"
- **L3** (user, after H3 close): "continua"
- **L4** (user, H4 decisions): Modelos 3D "Tú los generas en la web, yo preparo todo (Recomendado)"; Limpieza "Proceso automático en código (Recomendado)".
