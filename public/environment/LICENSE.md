# Environment assets — CC0

All images are derived from Poly Haven or ambientCG assets, licensed **CC0 1.0**:
https://creativecommons.org/publicdomain/zero/1.0/ . Poly Haven's source license
page (https://polyhaven.com/license) explicitly states that all assets are CC0;
this was verified before downloading. The source API supplied the authors below.
No downloaded content was executed; only explicitly named JPEG maps were decoded.

## Polished board marble

Poly Haven's CC0 license page above was verified again before download. The board
uses Rob Tuytel's **Marble 01** (https://polyhaven.com/a/marble_01;
metadata https://api.polyhaven.com/info/marble_01) for the light tiles and
ambientCG's **Marble 016** (https://ambientcg.com/a/Marble016) for dark tiles.
The ambientCG license (https://docs.ambientcg.com/license/) was verified as
CC0 1.0 Universal before downloading. Per-square cuts and rotations avoid
identical tiles. Only diffuse is sRGB.

| Local file | Original 1K JPEG | WebP size (bytes) |
|---|---|---:|
| marble_01_diff.webp | marble_01_diff_1k.jpg | 77228 |
| marble_01_nor_gl.webp | marble_01_nor_gl_1k.jpg | 6566 |
| marble_01_rough.webp | marble_01_rough_1k.jpg | 17012 |
| marble_016_diff.webp | Marble016_1K-JPG_Color.jpg | 293804 |
| marble_016_nor_gl.webp | Marble016_1K-JPG_NormalGL.jpg | 1962 |
| marble_016_rough.webp | Marble016_1K-JPG_Roughness.jpg | 24086 |

All six board outputs are 1024×1024, encoded with Sharp at quality 85 (420658
bytes total). Each Poly Haven JPEG was downloaded into its own new empty
temporary directory. The ambientCG archive was downloaded into a separate new
empty directory from https://ambientcg.com/get?file=Marble016_1K-JPG.zip;
only the three named JPEG entries above were read, directly into the image
converter (no archive paths were extracted to disk). All maps were decoded with
a 16,777,216-pixel limit. No downloaded content was executed.

Each board image was resized to 1024×1024 and encoded to WebP quality 85 with
Sharp. OpenGL normal maps and roughness remain linear; only diffuse maps are
marked sRGB in the renderer.

## Battlefield among ruins at sunset (H8 T14)

Poly Haven's CC0 license (https://polyhaven.com/license) was verified again before
download. Every file was downloaded into its own new, empty `mktemp -d` directory;
nothing downloaded was executed. JPEG maps were decoded with a 16,777,216-pixel
limit; the HDRI was parsed by a local Radiance RGBE reader (no third-party code).

| Local file | Size | Source file | Asset / source page | Author | License |
|---|---:|---|---|---|---|
| rolling_hills_sky.webp | 185456 | rolling_hills_4k.hdr (MD5 2c2dd50495a3bc7de97d9cccba1999d3) | https://polyhaven.com/a/rolling_hills | Dimitrios Savva (photography), Jarod Guest (processing) | CC0 1.0 |
| floor_tiles_04_diff.webp | 55994 | floor_tiles_04_diff_1k.jpg | https://polyhaven.com/a/floor_tiles_04 | Rob Tuytel | CC0 1.0 |
| floor_tiles_04_nor_gl.webp | 11660 | floor_tiles_04_nor_gl_1k.jpg | https://polyhaven.com/a/floor_tiles_04 | Rob Tuytel | CC0 1.0 |
| floor_tiles_04_rough.webp | 11620 | floor_tiles_04_rough_1k.jpg | https://polyhaven.com/a/floor_tiles_04 | Rob Tuytel | CC0 1.0 |
| sandstone_blocks_04_diff.webp | 194212 | sandstone_blocks_04_diff_1k.jpg | https://polyhaven.com/a/sandstone_blocks_04 | Rob Tuytel | CC0 1.0 |
| sandstone_blocks_04_nor_gl.webp | 150978 | sandstone_blocks_04_nor_gl_1k.jpg | https://polyhaven.com/a/sandstone_blocks_04 | Rob Tuytel | CC0 1.0 |
| sandstone_blocks_04_rough.webp | 182944 | sandstone_blocks_04_rough_1k.jpg | https://polyhaven.com/a/sandstone_blocks_04 | Rob Tuytel | CC0 1.0 |

Total: 1,103,694 bytes. Source URLs:
`https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/4k/rolling_hills_4k.hdr` and
`https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/{asset}/{original-file}`;
metadata at `https://api.polyhaven.com/info/{asset}`.

Textures were resized to 1024×1024 (the grass normal map to 512×512) and encoded to
WebP with Sharp (quality 85; grass normal quality 80).

**Sky encoding.** Instead of shipping a multi-megabyte `.hdr`, the 4K HDRI is
range-compressed into one 8-bit WebP (quality 90): each channel is clamped to 200,
encoded as `v = (r / (1 + r))^(1/2.2)`, and decoded in the sky shader as
`y = v^2.2, r = y / (1 - y)`. Columns are rotated so the sun sits at equirect
`u = 0.1532` (behind Black's ranks; elevation ≈ 9.1°), and only rows from the zenith
to 12° below the horizon are kept (the terrain covers the rest). The same decoded
sky is rendered once into a PMREM (512 px faces) for ambient light and reflections.

## Photoscanned ruins environment (H8 T16)

Poly Haven's CC0 license (https://polyhaven.com/license) was verified again before
download. Files were fetched by `scripts/environment/fetch.mjs`: every file lands in its
own new `mktemp -d` directory, is checked against the size and MD5 published by
`https://api.polyhaven.com/files/{asset}`, and only then is copied into the git-ignored
cache `assets/models/source/environment/{asset}/`. glTF JSON was parsed as data; only the
buffer/image URIs that the API lists for that model were accepted. Nothing downloaded
was executed. Images were decoded with a 16,777,216-pixel limit.

`scripts/environment/build.mjs` reduces each model (meshopt simplification, leaf cards,
LOD levels, ground-centred variants), merges the published leaf/blade alpha mask into the
base colour, converts textures to WebP (`EXT_texture_webp`), quantizes and
meshopt-compresses (`EXT_meshopt_compression`) the GLBs. Tiling textures are resized and
encoded to WebP with Sharp (quality 82–85).

| Local file (public/environment/) | Bytes | Source files used (1k) | Asset / source page | Authors | License |
|---|---:|---|---|---|---|
| models/island_tree_01.glb | 2299216 | island_tree_01_1k.gltf, island_tree_01.bin, island_tree_01_{diff,nor_gl,arm}_1k.jpg, island_tree_01_leaves_{diff,nor_gl,arm,alpha}_1k.jpg, island_tree_01_branches_{diff,nor_gl,arm}_1k.jpg | Island Tree 01 — https://polyhaven.com/a/island_tree_01 | Rob Tuytel, Rico Cilliers | CC0 1.0 |
| models/island_tree_02.glb | 1923560 | island_tree_02_1k.gltf, island_tree_02.bin, island_tree_02_{diff,nor_gl,arm}_1k.jpg, island_tree_02_leaves_{diff,nor_gl,arm,alpha}_1k.jpg, island_tree_02_branches_{diff,nor_gl,arm}_1k.jpg | Island Tree 02 — https://polyhaven.com/a/island_tree_02 | Rob Tuytel, Rico Cilliers | CC0 1.0 |
| models/searsia_lucida.glb | 481904 | searsia_lucida_1k.gltf, searsia_lucida.bin, searsia_lucida_{diff,nor_gl,arm,alpha}_1k.jpg | Searsia Lucida — https://polyhaven.com/a/searsia_lucida | James Ray Cock, Jenelle van Heerden | CC0 1.0 |
| models/wild_rooibos_bush.glb | 197816 | wild_rooibos_bush_1k.gltf, wild_rooibos_bush.bin, wild_rooibos_bush_{diff,nor_gl,arm,alpha}_1k.jpg | Wild Rooibos Bush — https://polyhaven.com/a/wild_rooibos_bush | James Ray Cock, Jenelle van Heerden | CC0 1.0 |
| models/grass_medium_01.glb | 291476 | grass_medium_01_1k.gltf, grass_medium_01.bin, grass_medium_01_{diff,nor_gl,arm,alpha}_1k.jpg | Grass Medium 01 — https://polyhaven.com/a/grass_medium_01 | Rob Tuytel, Rico Cilliers | CC0 1.0 |
| models/grass_medium_02.glb | 92800 | grass_medium_02_1k.gltf, grass_medium_02.bin, grass_medium_02_{diff,nor_gl,arm,alpha}_1k.jpg | Grass Medium 02 — https://polyhaven.com/a/grass_medium_02 | Rico Cilliers | CC0 1.0 |
| models/namaqualand_boulder_02.glb | 697828 | namaqualand_boulder_02_1k.gltf, namaqualand_boulder_02.bin, namaqualand_boulder_02_{diff,nor_gl,arm}_1k.jpg | Namaqualand Boulder 02 — https://polyhaven.com/a/namaqualand_boulder_02 | Greg Zaal, Rico Cilliers | CC0 1.0 |
| models/namaqualand_boulder_04.glb | 546096 | namaqualand_boulder_04_1k.gltf, namaqualand_boulder_04.bin, namaqualand_boulder_04_{diff,nor_gl,arm}_1k.jpg | Namaqualand Boulder 04 — https://polyhaven.com/a/namaqualand_boulder_04 | Jenelle van Heerden | CC0 1.0 |
| models/namaqualand_boulder_05.glb | 661896 | namaqualand_boulder_05_1k.gltf, namaqualand_boulder_05.bin, namaqualand_boulder_05_{diff,nor_gl,arm}_1k.jpg | Namaqualand Boulder 05 — https://polyhaven.com/a/namaqualand_boulder_05 | Jenelle van Heerden, Dario Barresi | CC0 1.0 |
| models/rock_07.glb | 107568 | rock_07_1k.gltf, rock_07.bin, rock_07_{diff,nor_gl,arm}_1k.jpg | Rock 07 — https://polyhaven.com/a/rock_07 | Jenelle van Heerden | CC0 1.0 |
| models/stone_01.glb | 171148 | stone_01_1k.gltf, stone_01.bin, stone_01_{diff,nor_gl,arm}_1k.jpg | Stone 01 — https://polyhaven.com/a/stone_01 | Dario Barresi, Rico Cilliers | CC0 1.0 |
| models/namaqualand_stones_01.glb | 174548 | namaqualand_stones_01_1k.gltf, namaqualand_stones_01.bin, namaqualand_stones_01_{diff,nor_gl,arm}_1k.jpg | Namaqualand Stones 01 — https://polyhaven.com/a/namaqualand_stones_01 | Greg Zaal, Jenelle van Heerden | CC0 1.0 |
| aerial_grass_rock_{diff,nor_gl,rough}.webp | 221230 / 76158 / 29600 | aerial_grass_rock_{diff,nor_gl,rough}_1k.jpg | Aerial Grass Rock — https://polyhaven.com/a/aerial_grass_rock | Rob Tuytel | CC0 1.0 |
| dry_ground_rocks_{diff,nor_gl,rough}.webp | 353888 / 101936 / 54814 | dry_ground_rocks_{diff,nor_gl,rough}_1k.jpg | Dry Ground Rocks — https://polyhaven.com/a/dry_ground_rocks | Rob Tuytel | CC0 1.0 |
| rocks_ground_02_{diff,nor_gl,rough}.webp | 387548 / 122276 / 69512 | rocks_ground_02_{col,nor_gl,rough}_1k.jpg | Rocks Ground 02 — https://polyhaven.com/a/rocks_ground_02 | Rob Tuytel | CC0 1.0 |
| worn_rock_natural_01_{diff,nor_gl,rough}.webp | 185784 / 202342 / 18620 | worn_rock_natural_01_{diff,nor_gl,rough}_1k.jpg | Worn Rock Natural 01 — https://polyhaven.com/a/worn_rock_natural_01 | Rob Tuytel, Dimitrios Savva | CC0 1.0 |

Total added: 9,469,564 bytes. Source URLs follow
`https://dl.polyhaven.org/file/ph-assets/Models/{gltf|jpg}/1k/{asset}/{file}` and
`https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/{asset}/{file}`.

The ruins themselves (columns, capitals, entablature, walls, stylobate, loose pavers) are
procedural geometry from this repository, weathered by vertex colour and textured
triplanarly with Worn Rock Natural 01; no third-party ruin model is shipped.

## Credits

Shown in the game's credits. CC0 needs no attribution; we credit the scan authors anyway.

- **CC BY assets (attribution required):** none shipped yet. CC BY ruin scans the owner may
  add are listed in `docs/environment.md` ("Assets for the owner to download"); when one is
  added, list it here as "Title" by Author (URL), licensed CC BY 4.0, with changes noted.
- **CC0 (Poly Haven):** Rob Tuytel, Rico Cilliers, Jenelle van Heerden, Greg Zaal,
  James Ray Cock, Dario Barresi, Dimitrios Savva, Charlotte Baglioni, Jarod Guest.
- **CC0 (ambientCG):** Marble 016.
