# Model cleanup pipeline

Run `pnpm models` to process the files listed in `assets/models/manifest.json`.
Only available pieces appear in `public/models/manifest.json`; missing source
files emit warnings. Invalid sources fail with their filename before any outputs
are written. Old GLBs are not deleted; the manifest is authoritative.

## Dry runs and fixtures

```sh
pnpm models:fixtures
pnpm models --source assets/models/fixtures --out .shots/models-check
```

`--source` selects the input folder. If that folder contains `manifest.json`, it
replaces the default settings (fixtures need -90° to undo their messy rotation).
`--out` changes the output folder; tests only write into `.shots/`, never
`public/models/`. The CLI accepts paths relative to the repository root.

Fixture generation imports the project's actual procedural provider. It runs on
Node 24 with built-in type stripping and a small synchronous resolver hook for
the app's extensionless relative TypeScript imports; no TS runner is required.
Fixtures contain two mesh nodes, nested offsets, a 90° rotation, 37× scale, and a
deterministic generated stone texture. Their planar UV charts are fitted to
[0,1]. Welding makes the six committed GLBs small (about 36–100 KB each).

## Output contract

Each GLB contains one static mesh primitive and one metallic-roughness PBR
material, with positions, normals, and UVs. The pipeline bakes world transforms
(including mirrored winding), rotates around +y, centers x/z, moves the foot to
y=0, and scales uniformly to the requested height or footprint cap, whichever is
smaller. Reported height/footprint are the actual post-simplification bounds.

Meshoptimizer performs UV-weighted simplification; welding only merges identical
complete vertices, retaining UV/normal seams. If a budget cannot be reached
without invalid/empty geometry, processing fails rather than silently exceeding
it. Normalization is repeated after simplification and unused vertices removed.

Sharp works on this Mac. All material inputs are combined into bounded atlases
with two-pixel copied-edge gutters and lossless WebP via **EXT_texture_webp**
(required). Base-color factors, roughness/metallic factors, normal scale, and
occlusion strength are baked into their maps. `textureSize` caps each atlas
extent; it must provide at least five pixels per material tile. Distinct input
materials share a single atlas/material, rather than losing all but the first
material. `fragmentColor` is the surface-area-weighted mean of each material's
resized base-color texture × factor (solid factors work without textures).

## Input limits

Use static triangle GLBs with ordinary PBR materials and UVs in [0,1]. Missing
normals are generated; missing UVs sample the texture center. Skins, morph
targets, non-triangle primitives, tiled/out-of-range UVs, nonzero texture UV sets,
and KHR_texture_transform require baking upstream and fail explicitly. Advanced
material extensions, vertex colors, emissive maps, transparency, and animations
are not reproduced: these assets are intended to be opaque stone statues.
Draco-compressed input needs decompression before this pipeline; meshopt-compressed
input is supported. Keep uncompressed source copies until cleanup is verified.

Raw generator exports are opt-in; see [`source/README.md`](source/README.md).
Processed assets under `public/models/` are commit-ready and not ignored.
