# Chamber textures — CC0

All six images are derived from Poly Haven assets, licensed **CC0 1.0**:
https://creativecommons.org/publicdomain/zero/1.0/ . Poly Haven's source license
page (https://polyhaven.com/license) explicitly states that all assets are CC0;
this was verified before downloading. The source API supplied the authors below.
No third-party executable content was downloaded or run.

| Local file | Original file (1K JPEG) | Asset / source page | Author |
|---|---|---|---|
| stone_floor_diff.webp | stone_floor_diff_1k.jpg | https://polyhaven.com/a/stone_floor | Dimitrios Savva |
| stone_floor_nor_gl.webp | stone_floor_nor_gl_1k.jpg | https://polyhaven.com/a/stone_floor | Dimitrios Savva |
| stone_floor_rough.webp | stone_floor_rough_1k.jpg | https://polyhaven.com/a/stone_floor | Dimitrios Savva |
| stone_wall_02_diff.webp | stone_wall_02_diff_1k.jpg | https://polyhaven.com/a/stone_wall_02 | Charlotte Baglioni (photography), Dario Barresi (processing) |
| stone_wall_02_nor_gl.webp | stone_wall_02_nor_gl_1k.jpg | https://polyhaven.com/a/stone_wall_02 | Charlotte Baglioni (photography), Dario Barresi (processing) |
| stone_wall_02_rough.webp | stone_wall_02_rough_1k.jpg | https://polyhaven.com/a/stone_wall_02 | Charlotte Baglioni (photography), Dario Barresi (processing) |

Direct source URLs use:
`https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/{asset}/{original-file}`.
Metadata: https://api.polyhaven.com/info/stone_floor and
https://api.polyhaven.com/info/stone_wall_02 .

Each image was downloaded into its own fresh `mktemp -d` directory, decoded as an
image with an input-pixel limit, resized to 1024×1024, and encoded to WebP quality
85 with Sharp. OpenGL normal maps and roughness remain linear; only diffuse maps
are marked sRGB in the renderer. No HDRI download: interior reflections are the
local procedural Lightformer rig. Flame sprite textures are generated in code.
