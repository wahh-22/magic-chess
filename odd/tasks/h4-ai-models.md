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
| T2 | S4 | `scripts/process-models.mjs` (`pnpm models`): read `assets/models/source/*.glb` + manifest, join meshes, center x/z, base at y = 0, face +x, scale to per-type height, simplify, resize/compress textures, write `public/models/<type>.glb` + `public/models/manifest.json`. Tested on a synthetic messy fixture. | worker A | done | fbdb378 |
| T3 | S2, S6 | `GltfPieceProvider` behind `PieceModelProvider` (geometry + material per type and color; black = tinted copy), loaded from the manifest with procedural fallback; fragment/collider sizing from the loaded geometry; materials for fragments without UV issues. | worker B | done | c75b9ac |
| T4 | S6 | Fixture set: procedural pieces exported to messy GLBs, run through the pipeline, played in the browser; regression (smoke, scenarios) and screenshots. | inline | done | (verification only) |
| T5 | S1, S3 | Real models from the user: process, tune heights/orientation in the manifest, record license, screenshots. | inline | done (license pending) | d12c10a, 19481e6, f2297e2 |

## Log

- **L1** (user, original request): "quiero hacer un juego de ajedres, como el ajedres magico de harry potter. quiero que sea bastante realista. como lo puedo conseguir?"
- **L2** (user, D2): "si, vamos con D inicialmente, y luego con C"
- **L3** (user, after H3 close): "continua"
- **L4** (user, H4 decisions): Modelos 3D "Tú los generas en la web, yo preparo todo (Recomendado)"; Limpieza "Proceso automático en código (Recomendado)".
- **L5** (T4 evidence): fixture GLBs (offset, rotated 90°, ×37, split nodes) processed by `pnpm models` render on the right squares with correct height/orientation; captures shatter with the loaded models; smoke + 13 scenarios pass with models present; 247 unit tests pass. Fixture outputs removed from public/models. Lockfile keeps optional Vite peer `tsx` (dev only; regenerating the lockfile judged riskier). T5 blocked on the user's six GLB files.
- **L6** (user): "ya hice 1, lo deje ahi, pero con los nombres como se descargaron, renombralos"
- **L7** (T5 evidence): Meshy delivered two variants per piece with identical geometry (`generate` = untextured, `image-to-3d-texture` = PBR 4K maps); the textured ones were renamed to `<piece>.glb`, the others to `<piece>.untextured.glb`, concepts to `<piece>-concept.png` (raw sources stay git-ignored). Pipeline found lossless WebP (23 MB) → fixed to lossy (7.2 MB). Close-up confirms correct facing for both sides; captures shatter with dark fragments for black. Pending: license line for `assets/models/source/LICENSE.md` (user's Meshy plan).
- **L8** (verification): with the real models loaded, smoke + 13 scenarios, 248 unit tests, and build pass (scenarios took 9 min under software rendering).
