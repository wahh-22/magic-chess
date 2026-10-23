# ARCANA V6–V8 pieces

`pnpm models` imports the owner's **ARCANA V6** (queen, rook), **V7** (bishop,
pawn, king) and **V8** (knight) collections from the ignored
`assets/models/source/arcana-v678/` directory. Downloaded scripts, HTML and
viewers are never executed: only GLB and JSON data are read. No Meshy service is
used. The V4 download in `assets/models/source/arcana-v4/` is still required for
its pedestals. Attribution is in `assets/models/source/LICENSE.md` and
`public/models/LICENSE.md`.

## Rebuild and validate

```sh
pnpm models
pnpm test
pnpm typecheck
pnpm lint
# With the existing development server on localhost:5173:
node scripts/models/check-arcana-v678.mjs
node scripts/models/capture-arcana-strike.mjs k e4 '7k/8/8/3p4/4K3/8/8/8 w - - 0 1'
```

The browser check uses actual assets, validates all twelve rigs/bounds/debris,
and writes `.shots/h8-v678-board.png` plus `h8-v678-<w|b>-<king|knight|rook>.png`.
`capture-arcana-strike.mjs <type> <from> '<fen>'` captures `<from>`×d5 from the
side at trail start and at weapon contact (`.shots/h8-v678-strike-<type>-*.png`),
in time order so no earlier frame has already broken the victim. Neither script
starts or stops the server. Software-rendered Chrome loads about 9 MB of model
resources; this is not a hardware-GPU benchmark.

## Source processing

Each source entry declares `rigged.arcana: "rey"` (or `reina`, `alfil`,
`caballo`, `torre`, `peon`), per-color `rigged.files` (the full-resolution GLBs:
131–222k triangles per humanoid, 636k for the knight; there are no LODs) and
`materials: "shared"` in `assets/models/manifest.json`.

Exported tangents and baked vertex colors are dropped (the shared library
materials read neither) and identical vertices are welded: that alone shrinks
the king from 393k to 139k vertices. Triangles are then partitioned per rigid
joint and, for blended layers (capes, tabards, mail, finger roots), per dominant
joint. All parts are simplified with meshopt under **one absolute geometric
error**, bisected so the whole piece meets its budget: smooth broad plates lose
the most, small detail (closed fingers, crowns, weapon heads) keeps its shape.
Positions shared by two parts are locked, so articulations, cloth seams and
material borders never open. Collapses only remove vertices: every survivor
keeps its exact four-weight skin. UV, normal and dominant-weight attributes steer
collapses away from seams and skin gradients. Budgets: 28,000 body triangles
(`maxTriangles`), 36,500 for the knight (`rigged.maxTriangles`), plus the
pedestal. Positions/normals/weights are quantized (14/10/8 bits); tiled UVs
(−3.8…14.7) stay float in every primitive; meshopt filter compression follows.

V6–V8 rest poses hold every weapon straight forward, a pose never displayed. The
pipeline rests each rig in its idle clip's first key (inverse bind matrices are
untouched), so normalization, colliders and debris match the looping guard.

## Clips and events

Events come from each GLB animation's `extras` (`duration`, `events`,
`attack_window`, `root_motion_distance`); the knight falls back to
`V8_Fuentes/integracion/caballo.json` only if a clip lacked an attack window
(it does not today). Source names have a `<role>_<side>__` prefix; the
pipeline matches their suffix and renames them to runtime roles:

| Type | idle | walk | hit | attack0 / attack1 |
|------|------|------|-----|-------------------|
| King | Guardia | Caminar_en_sitio | Impacto | Corte_espada / Estocada_espada |
| Queen | Guardia | Caminar_en_sitio | Impacto | Golpe_baculo / Canalizar_hechizo |
| Bishop | Guardia | Caminar_en_sitio | Impacto | Estocada_lanza / Corte_lanza |
| Knight | Reposo_montado | — | Impacto_montado | Estocada_montada / Barrido_lanza |
| Rook | Guardia | Caminar_en_sitio | Impacto | Tajo_espada / Estocada_espada |
| Pawn | Guardia | Caminar_en_sitio | Impacto | Estocada_lanza / Barrido_lanza |

The V8 knight's mount is a rigid sculpture: its only travel clip,
`Desplazamiento_magico`, is a root-motion slide, not a gait. It therefore ships
no `walk`/`walkCycle`; the runtime glides it like every piece. Reposo,
Giro_90, Bloqueo, Derrota_*, Levantarse, Preparar_lanza, Guardia_escudo and the
`*_avance` root-motion clips are dropped.

Tracks keep every 60 Hz source key that resampling (tolerance 0.00001) cannot
remove; fixed 30 Hz decimation is skipped because the lance thrusts are too fast
for it. Regression tests compare every shipped ivory track against the 60 Hz
source, bounding error to 1.8 degrees / 2 mm in board space.

## Processed manifest and provider contract

Manifest version 1 has `pieces.<type>.colors.w` and `.b`. Every variant contains
`file`, `height`, `footprint`, `triangles` (including pedestal), `fragmentColor`,
`skinned: true`, legacy `clips`, `hitTimeMs`, `clipDurationMs`, and:

```ts
rig: {
  clips: {
    idle: 'idle', hit: 'hit',
    walk?: 'walk', // absent for the knight
    attack0: 'attack0', attack1: 'attack1',
    attack: 'attack0' // compatibility alias; no duplicate GLB clip
  },
  attacks: [{
    clip: 'attack0', // then attack1
    durationMs: number,
    hitMs: number,
    activeEndMs: number,
    trailStartMs: number,
    trailEndMs: number
  }],
  walkCycle?: { durationMs: number; strideBoardUnits: number }, // with walk only
  weaponTip: string
}
```

All times are milliseconds at playback rate 1. `hitMs` is the `attack_active`
event (knight: `attack`), `activeEndMs` and `trailEndMs` its `active_end`, and
`trailStartMs` the `weapon_trail_start` event. The knight has no trail-start
event: its anticipation event is the fallback (480 / 600 ms), not an invented
proportional timing; contacts are 760 / 920 ms. `weaponTip` is the rig's
`weapons.primary.tip_bone`: `weapon_tip.R` (king, bishop, pawn), `weapon_tip.L`
(the queen's staff is left-handed), `weapon_tip_R` (the V6 rook names bones with
underscores) and `rider_weapon_tip_R` (knight).

`walkCycle.durationMs` is the in-place clip duration; its stride is
`length(Caminar_avance.root_motion_distance) * normalizedScale * inPlaceDuration /
avanceDuration` (the advance exports hold two in-place cycles).

`parseManifest` accepts a rig without `walkCycle` only when it declares no `walk`
clip; a declared walk still needs a valid stride. `PieceModelProvider.rig(type,
color)` returns loaded clips, attacks with timing, `walkCycle` when present and
the sanitized `weaponTip` (`weapon_tip.R` becomes `weapon_tipR`). Malformed
timings or missing declared clips fall back to procedural pieces.

## Geometry, materials and destruction

V6–V8 GLBs ship no pedestal. Each role/side reuses its V4
`utileria/pedestal_<role>_<side>.glb` as a **static** `piece-pedestal` subtree
(skinning removed, primitives over 400 triangles reduced to about a quarter),
top placed at the sole plane before common normalization, so gliding pieces
carry it. Source +Z rotates +90 degrees around Y into canonical +X, then runtime
`FACING` points both armies toward the opponent. Total heights including
pedestal are unchanged:

| Pawn | Knight | Rook | Bishop | Queen | King |
|------|--------|------|--------|-------|------|
| 0.80 | 0.94 | 1.00 | 1.08 | 1.16 | 1.24 |

Guard-pose footprints are 0.49–0.81 (king widest, sword and shield out), below
the 0.98-square limit.

The shared `arcana-materials.glb` is loaded/cached once and assigned by material
name, never tinted. V6–V8 textures are byte-identical to the V4 set, so the
library only gains the knight's horse hide (textured) and the untextured horse
eye/nostril materials: 22 materials, 24 deduplicated WebP textures (1024px
basecolor/ORM, 512px normals). Pieces keep their `TEXCOORD_0`; earlier V4 builds
pruned it because the pieces themselves hold no textures, so library textures
were sampled at a single texel. Missing materials still trigger procedural
fallback.

Destruction CPU-bakes all four influences in the guard rest pose, assigns each
vertex its highest-weight bone and merges tiny parts to at most 40 bodies.

## Output budget (bytes)

| Piece | Triangles with pedestal | White | Black | Bind-only compatibility URL |
|-------|------------------------:|------:|------:|----------------------------:|
| Pawn | 29,904 | 555,484 | 555,556 | 266,208 |
| Knight | 39,951 | 789,520 | 789,604 | 433,112 |
| Bishop | 29,900 | 558,400 | 558,472 | 267,968 |
| Rook | 29,897 | 693,168 | 693,244 | 322,732 |
| Queen | 29,895 | 631,748 | 631,824 | 301,984 |
| King | 29,902 | 622,424 | 622,500 | 301,496 |

Pedestals are 1,904 of those triangles. White/Black filenames are
`<type>-w.glb` and `<type>-b.glb`; compatibility URLs are `<type>.glb`,
bind-only models without clips or UVs that the application never loads.
Shared library: **1,185,836** bytes; manifest: **17,810** bytes. Total
`public/models` with both licenses: about **10.80 MB (10.30 MiB)**.

The historical [generation guide](generation-guide.md) and
[rigging guide](rigging-guide.md) describe the older Meshy path, not ARCANA inputs.
