# Chamber textures — CC0

All images are derived from Poly Haven or ambientCG assets, licensed **CC0 1.0**:
https://creativecommons.org/publicdomain/zero/1.0/ . Poly Haven's source license
page (https://polyhaven.com/license) explicitly states that all assets are CC0;
this was verified before downloading. The source API supplied the authors below.
No downloaded content was executed; only explicitly named JPEG maps were decoded.

| Local file | Original file (1K JPEG) | Asset / source page | Author |
|---|---|---|---|
| stone_floor_diff.webp | stone_floor_diff_1k.jpg | https://polyhaven.com/a/stone_floor | Dimitrios Savva |
| stone_floor_nor_gl.webp | stone_floor_nor_gl_1k.jpg | https://polyhaven.com/a/stone_floor | Dimitrios Savva |
| stone_floor_rough.webp | stone_floor_rough_1k.jpg | https://polyhaven.com/a/stone_floor | Dimitrios Savva |
| stone_wall_02_diff.webp | stone_wall_02_diff_1k.jpg | https://polyhaven.com/a/stone_wall_02 | Charlotte Baglioni (photography), Dario Barresi (processing) |
| stone_wall_02_nor_gl.webp | stone_wall_02_nor_gl_1k.jpg | https://polyhaven.com/a/stone_wall_02 | Charlotte Baglioni (photography), Dario Barresi (processing) |
| stone_wall_02_rough.webp | stone_wall_02_rough_1k.jpg | https://polyhaven.com/a/stone_wall_02 | Charlotte Baglioni (photography), Dario Barresi (processing) |

## Polished board marble

Poly Haven's CC0 license page above was verified again before download. The board
uses Rob Tuytel's **Marble 01** (https://polyhaven.com/a/marble_01;
metadata https://api.polyhaven.com/info/marble_01) for the light tiles and
ambientCG's **Marble 016** (https://ambientcg.com/a/Marble016) for dark tiles.
The ambientCG license (https://docs.ambientcg.com/license/) was verified as
CC0 1.0 Universal before downloading. Per-square cuts and rotations avoid
identical tiles. Only diffuse is sRGB. The frame reuses the
chamber's `stone_floor` maps.

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

Direct source URLs use:
`https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/{asset}/{original-file}`.
Metadata: https://api.polyhaven.com/info/stone_floor and
https://api.polyhaven.com/info/stone_wall_02 .

Each original chamber image was downloaded into its own fresh `mktemp -d` directory, decoded as an
image with an input-pixel limit, resized to 1024×1024, and encoded to WebP quality
85 with Sharp. OpenGL normal maps and roughness remain linear; only diffuse maps
are marked sRGB in the renderer. No HDRI download: interior reflections are the
local procedural Lightformer rig. Flame sprite textures are generated in code.
