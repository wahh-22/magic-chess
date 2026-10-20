# Generating the piece models

How to create the six realistic piece models with an AI 3D generator (decision D11).
You generate them on the web; `scripts/process-models.mjs` does everything else.

## Before you start

- Use **Meshy** (meshy.ai) or **Tripo** (tripo3d.ai), text-to-3D.
- Check the license of your plan. Some free plans publish your models under
  **CC BY** (attribution required) or make them public. Note the license; we record
  it in `assets/models/source/LICENSE.md`.
- Generate **one set only, in light grey stone**. Black pieces are a tinted copy
  made in code, so both sides always match.
- Designs must be *inspired by* wizard chess, not copies of the film's pieces.

## Settings

| Setting | Value |
|---------|-------|
| Mode | Text to 3D, with PBR textures |
| Art style | Realistic |
| Target polycount | Medium (about 30k triangles; the pipeline reduces it) |
| Symmetry | On (off for the knight) |
| Export format | GLB |

## Shared style (append to every prompt)

> carved from weathered light grey granite, medieval fantasy chess piece sculpture,
> single solid statue standing on a round stone plinth, full figure, centered,
> realistic stone texture with fine chips and cracks, no background

Negative prompt (if the tool has one):

> multiple objects, separate floating parts, text, logo, background, ground plane,
> thin fragile spikes, cartoon, toy, plastic, glossy

## Prompts

| File name | Piece | Prompt (then add the shared style) |
|-----------|-------|------------------------------------|
| `pawn.glb` | Pawn | a short stocky hooded foot soldier holding a round shield and a short sword |
| `rook.glb` | Rook | a fortified round watchtower with crenellated battlements, arrow slits, and thick walls |
| `knight.glb` | Knight | the head and neck of an armored warhorse rising from the plinth, flowing mane, bridle and chanfron armor |
| `bishop.glb` | Bishop | a tall robed bishop wearing a tall pointed mitre, holding a crozier staff, hands folded |
| `queen.glb` | Queen | a tall regal queen in a long flowing gown and cloak, wearing an ornate pointed crown, holding a scepter |
| `king.glb` | King | a tall bearded king in a long robe and cape, wearing a crown topped with a cross, resting both hands on a broadsword pointed down |

Tips:

- Generate 2–4 variants per piece and keep the one whose base is a clean, flat plinth.
- Keep the same tool and settings for all six so the stone looks the same.
- The pipeline fixes size, centering, and height, so you do not need to match scales.
  If a piece faces sideways, note it; the manifest can rotate it.

## Hand-off

1. Put the six files in `assets/models/source/` with the exact names above.
2. Add `assets/models/source/LICENSE.md` with: tool, plan, license, and date.
3. Run `pnpm models` (or ask the agent to). It writes the cleaned models to
   `public/models/` and the game uses them automatically. Missing files fall
   back to the procedural pieces.
