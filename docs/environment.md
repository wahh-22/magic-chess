# Battlefield environment

The board stands on a stone plaza among ancient ruins at sunset. This page explains how the
environment is built, what it costs, and how to change it.

## At a glance

| Layer | What it is | Where |
|---|---|---|
| Sky and light | CC0 HDRI (range-compressed WebP) rotated so the sun sits behind the temple entablature; warm sun, warm ground bounce, cool fill | `Sky.tsx`, `Battlefield.tsx` |
| Atmosphere | Exponential distance fog plus ground-hugging height fog that glows toward the sun (patched into three's fog chunks) | `heightFog.ts` |
| Ruins | Procedural, weathered: fluted drums with entasis, chipped arrises and joints, broken tops, block masonry with open joints; vertex-colour grime, streaks and lichen; triplanar scanned stone | `ruins.ts`, `weathering.ts`, `triplanar.ts` |
| Ground | Terrain blending dry grass, dirt and stony gravel (height-blended), worn soil around ruins, loose chipped pavers at the plaza edge | `landscape.ts`, `terrainMaterial.ts` |
| Nature | Photoscanned CC0 olive trees (3 LODs), maquis and dry bushes, grass tufts with wind, boulders, rocks, pebbles; contact shade blobs | `scatterLayout.ts`, `ScannedNature.tsx`, `wind.ts` |
| Post (high only) | N8AO, depth of field, god rays, bloom, ACES, warm/teal grade, vignette | `BattlefieldPost.tsx` |

All files live in `src/scene/environment/` unless noted.

## Loading

`ScannedNature` is a lazy chunk: its code and GLBs start loading when the scene mounts
behind the setup menu. The plaza, ruins and sky render first; the scanned props appear when
their GLBs arrive. Nothing blocks the menu.

## Quality presets

| Preset | Grass tufts | Pebbles | Bushes and far trees | LOD rings (detailed / middle) | God rays | Post stack |
|---|---:|---:|---|---|---|---|
| high | 7000 | 700 | all | 32 / 62 units | yes | yes |
| low | 1200 | 220 | 35 % | 16 / 31 units | no | no |

Measured in the default view (one frame, SwiftShader, includes the pieces and the shadow pass):

| Preset | Draw calls | Triangles drawn | Scanned-prop triangles visible |
|---|---:|---:|---:|
| high | ≈1070 | ≈6.8 M | ≈4.0 M |
| low | ≈760 | ≈3.6 M | ≈0.8 M |

The pieces dominate draw calls (216 skinned meshes, drawn twice with shadows). Only detailed
(LOD0) trees and rocks cast shadows.

## Download size

The scanned models and the new tiling textures add about 9.5 MB (see the byte table in
`public/environment/LICENSE.md`). With the earlier sky, board and paving textures the
environment stays near 11 MB, under the 25 MB budget.

## Rebuilding the assets

```sh
node scripts/environment/build.mjs              # every model and texture
node scripts/environment/build.mjs rock_07      # selected Poly Haven ids
```

- Sources download once into the git-ignored `assets/models/source/environment/`. Each file
  is size- and MD5-checked against the Poly Haven API before it is cached.
- `scripts/environment/catalog.mjs` lists every asset and its reduction: triangle budgets
  per LOD, leaf cards, thinning, texture size.
- Textures ship as WebP (`EXT_texture_webp`): no Basis/KTX2 encoder is installed in this
  repository. Geometry is quantized and meshopt-compressed.
- Add or change an asset: edit the catalog, rebuild, add the model to `SCANNED_MODELS` in
  `scatterLayout.ts`, and record it in `public/environment/LICENSE.md`.

## Assets for the owner to download

No CC0 photoscanned classical ruins were found. Poly Haven has none, and Smithsonian Open
Access 3D needs an API key. Good CC BY scans exist on Sketchfab, but downloads need a
logged-in account, so they were not fetched. The ruins stay procedural for now.

To use one: download the glTF while logged in, place it under
`assets/models/source/environment/`, add a catalog entry, and credit it in
`public/environment/LICENSE.md` ("Credits").

| Title | Author | Licence | URL | Why |
|---|---|---|---|---|
| Entablature Piece - Roman Forum, Rome | Jerrad Lancaster | CC BY 4.0 | https://sketchfab.com/models/8db70e6a087d4834afb8b70a7928674f | Real photogrammetry of a cornice/frieze block (47k faces): a fallen entablature piece at the temple foot |
| Broken ancient greek column - debris | Samuel F. Angrick-Johanns (Oneironauticus) | CC BY 4.0 | https://sketchfab.com/models/1ad492ad20164a108d6d37c83adba223 | Broken fluted drums and debris (85k faces): replaces the fallen procedural drums |
| Doric Order Columns - Asset Pack | Samuel F. Angrick-Johanns (Oneironauticus) | CC BY 4.0 | https://sketchfab.com/models/e27b5b5c101c480dbf1a9781ae289155 | Game-ready Doric shafts and capitals (22k faces) matching the colonnade |
| Paestum old stairs | chabychab | CC BY 4.0 | https://sketchfab.com/models/0c2cf3f7048343368d14e2c798721abd | Scan of worn Greek temple steps at Paestum: a real stylobate |
| Paestum ruins rocks | chabychab | CC BY 4.0 | https://sketchfab.com/models/3b628b8847cd467d844522fb234c413b | Scanned masonry rubble from the same site |
| Half temple of Apollon (Portara) | Georgios Tsampounaris | CC BY 4.0 | https://sketchfab.com/models/0d54b70cf8c842aaa7f7d6ac41d56cff | Scanned Naxos ruin (335k faces before reduction): a hero landmark on a hill |
| Desolated Greek Temple1 | ARTEL_3D | CC BY 4.0 | https://sketchfab.com/models/eaefebaeec2a48d193d65a1ed6d29eac | A complete ruined temple for the far background |
| Broken Stone Pillar | Aupuma | CC BY 4.0 | https://sketchfab.com/models/fa6b7acf284041428b8a0fbe9fd5e762 | Light (13k faces) broken pillar for scattered stumps |

Check each page's licence before downloading. Sketchfab shows the licence next to the
download button, and the author can change it.
