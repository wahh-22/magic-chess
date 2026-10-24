# Magic Chess — Key art (H10)

Cinematic stills of the ARCANA pieces for the title menu and the match loading screen. They
are rendered with the game's own engine (three.js, the ARCANA GLBs, the shared material
library and the rig playback) on a dark stage, so the menu shows the game's pieces without
creating a WebGL context: it only loads a WebP.

## Files

All in `public/art/`, written by the render script (do not edit by hand).

| File | Size | Use |
|------|------|-----|
| `title.webp` | 2560×1440 | Title menu background (desktop, landscape) |
| `title-portrait.webp` | 1080×1920 | Title menu background (phones, portrait) |
| `loading-1.webp` | 2560×1440 | Match loading screen |
| `loading-2.webp` | 2560×1440 | Match loading screen (alternate) |
| `<name>-lqip.webp` | 32 px wide | Blurred placeholder for the first paint (≤ 2 KB) |
| `key-art.json` | — | Per image: `src`, `width`, `height` and the placeholder as a `data:` URI |

Budget: each image ≤ 350 KB, all four ≤ 1.2 MB. The script picks the highest WebP quality
(from 96 down) that fits; at the time of writing all four fit at quality 96 (≈ 830 KB in total).

## Compositions

Every shot is pure darkness: no battlefield, sky or environment, only the pieces on their
pedestals, a floor pool that fades to black, lit smoke far behind, embers and sparks. The
lighting is the same in all of them: warm gold from the ivory side, cool moonlight from the
obsidian side, with depth of field, bloom, ACES tone mapping, the game's colour grade and a
black vignette.

| Shot | Subject | Space for UI |
|------|---------|--------------|
| `title` | Ivory knight on horseback (right third, lance level at the hit frame of attack 1) facing the obsidian knight (centre, lance raised at the wind-up of attack 0). | Left 40 % is black for the menu panel. |
| `title-portrait` | The same duel, re-framed for 9:16. | Bottom 40 % is black for the menu. |
| `loading-1` | The two queens face off: obsidian queen thrusting her staff (attack 0), ivory queen raising her orb (attack 1). | Bottom 20 % dark for the progress bar and tips. |
| `loading-2` | A line of six ivory pawns, low and close; the first is sharp, the rest fall into bokeh and darkness. | Bottom 20 % dark for the progress bar and tips. |

The menu may add subtle motion on top (CSS parallax, drifting embers); the images are stills.

## How to re-render

The stage is a separate Vite page, `tools/key-art.html` with code in `src/dev/keyArt/`. The
app does not import it and `vite build` does not include it (its only input is `index.html`).

```sh
pnpm exec vite --port 5174 --strictPort      # any free port; pass it with --url
node scripts/art/render-key-art.mjs          # all four images → public/art/
node scripts/art/render-key-art.mjs --only title,loading-1
node scripts/art/render-key-art.mjs --preview 0.4   # quick look → .shots/key-art/*.png only
```

The script opens each shot in headless Chrome with software GL (SwiftShader), renders it at
1.5× the output size (`--ss`, then a Lanczos downsize, so thin lances and staffs stay
clean), and encodes the WebP and the placeholder with sharp. A full run takes about a
minute. The script fails if a model falls back to the procedural pieces, if the page logs
an error or a request fails, or if the budget is exceeded.

To work on a composition, open `http://localhost:5174/tools/key-art.html?shot=title` in a
browser with the window at the target aspect ratio. Shots are data in
`src/dev/keyArt/shots.ts`: camera, posed pieces, spot lights, environment, backdrop glows,
ember clouds, focus, floor, fog, UI shade and vignette. To pick a clip frame, render a
contact sheet: `?poses=n-w-attack-1&duration=2500` shows eight evenly spaced frames of that
clip (type, colour, role, attack variant).

## Notes

- **Smooth shading.** The material library's swatch meshes have no normals, so three.js's
  GLTFLoader returns flat-shading copies of the shared materials. The stage turns
  `flatShading` off, so the armour uses the models' own vertex normals (the game's loader
  does the same since H10).
- **Embers write depth** (with a hard cut-out), so depth of field blurs near and far ones
  into bokeh like the pieces around them.
- **Determinism.** Embers come from a seeded generator and poses are fixed clip frames, so
  the same code renders the same images.

## Licence and credit

The renders show the ARCANA piece models and materials, © 2026 Wilmer Henao, released under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) (see `public/models/LICENSE.md`).
The key-art images are derived from them and released under the same licence.

Credit line for the credits dialog:

> Key art rendered in-engine from the ARCANA piece models by Wilmer Henao, CC BY 4.0.
