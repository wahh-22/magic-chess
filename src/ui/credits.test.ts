import { describe, expect, it } from "vitest";
import { environmentCredits } from "./credits";

const license = `# Environment assets

Prose that mentions Rob Tuytel is not a table and is ignored.

| Local file | Size | Source file | Asset / source page | Author | License |
|---|---:|---|---|---|---|
| sky.webp | 185456 | rolling_hills_4k.hdr | https://polyhaven.com/a/rolling_hills | Dimitrios Savva (photography), Jarod Guest (processing) | CC0 1.0 |
| tiles_diff.webp | 55994 | floor_tiles_04_diff_1k.jpg | https://polyhaven.com/a/floor_tiles_04 | Rob Tuytel | CC0 1.0 |
| tiles_nor.webp | 11660 | floor_tiles_04_nor_gl_1k.jpg | https://polyhaven.com/a/floor_tiles_04 | Rob Tuytel | CC0 1.0 |

| Local file | Original 1K JPEG | WebP size (bytes) |
|---|---|---:|
| marble_01_diff.webp | marble_01_diff_1k.jpg | 77228 |

| Model | Author | Licence | Source |
|---|---|---|---|
| Temple column | Jane Scanner | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | [Sketchfab](https://example.com/models/column) |
`;

describe("environmentCredits", () => {
  it("collects one credit per asset and author from every table with author and licence columns", () => {
    expect(environmentCredits(license)).toEqual([
      { asset: "rolling_hills", author: "Dimitrios Savva (photography), Jarod Guest (processing)", license: "CC0 1.0",
        url: "https://polyhaven.com/a/rolling_hills" },
      { asset: "floor_tiles_04", author: "Rob Tuytel", license: "CC0 1.0", url: "https://polyhaven.com/a/floor_tiles_04" },
      { asset: "Temple column", author: "Jane Scanner", license: "CC BY 4.0", url: "https://example.com/models/column" },
    ]);
  });

  it("returns nothing for a file without credit tables", () => {
    expect(environmentCredits("# Nothing here\n\nJust prose.")).toEqual([]);
  });
});
