# Rigging and animating a piece (pawn pilot)

How to give a humanoid piece a skeleton and animations in Meshy so it can attack
(decision D13). Start with the **pawn**; the result decides how we do the bishop,
queen, and king.

## Steps in Meshy (web app)

1. Open your paid-plan **pawn** model in Meshy (the one we use:
   `Meshy_AI_pawn_1020144413_image-to-3d-texture`).
2. Choose **Animate** (Auto Rigging) and the **Humanoid** character type.
3. If Meshy asks you to place markers (chin, wrists, elbows, knees, groin), place
   them on the figure, not on the plinth.
4. After rigging, apply two animations from the Animation Library:
   - an **idle** (search "idle"; a calm standing idle),
   - a **sword attack** (Fighting → Attacking with weapon, e.g. "Attack" or
     "Sword Judgment"; pick one where the strike lands clearly forward).
5. Export as **GLB**. If Meshy exports one file per animation, export both.

## Hand-off

Save the files in `assets/models/source/rigged/` (any names are fine, e.g. the
downloaded names) and tell the agent. Note which animation names you chose.

## What to look at before exporting

- Does the **plinth** stay still while the legs move? If the base bends or follows
  the legs, note it: we would then regenerate the humanoids in **A-pose without a
  plinth** (Meshy Image to 3D → Pose Control) and add the plinth in code.
- Do the **sword and shield** follow the hands?
- Does anything tear or stretch badly at the shoulders or the robe?

A short note or screenshot of anything odd helps decide the next step (task T5).

## Process the exported pawn

Once the exports arrive, change **only the pawn entry** in
`assets/models/manifest.json` (keep the other piece entries and global settings):

```json
"p": {
  "rotationYDegrees": 0,
  "rigged": {
    "files": ["rigged/pawn-*.glb"],
    "clips": { "idle": "Idle", "attack": "Sword Attack" },
    "hitTimeMs": null
  }
}
```

Use the actual exported filenames/glob and animation names. Clip selectors can
also be zero-based indices in the merged animation list (files sorted by name,
then clips in export order). `idle` and `attack` are optional; a missing attack
role deliberately keeps procedural attack choreography. A declared clip that
cannot be found is an error, not a silent fallback. Both exports must use the
same named nodes, bind transforms, joint order, and inverse bind matrices;
channels are matched by node name rather than file-local node index. Export both
clips from the **same rig**, not two independent auto-rigging jobs.

```sh
pnpm models
pnpm dev --port 5173 --strictPort
```

The pipeline retains the skin and all animations, joins material primitives,
atlases textures to WebP, simplifies complete vertices (including joint indices
and weights), and applies meshopt. A shared normalization parent keeps animated
local transforms and inverse bind matrices intact. The **bind pose** is centered
in x/z, grounded at y=0, rotated toward +x, and uniformly scaled to the target
height or footprint cap. Mesh parts must share one skin and bind transform;
morph targets and more than four influences per vertex need cleanup before
export. Static entries continue through the unchanged static path.

With `hitTimeMs: null`, the processor samples the attack at **60 Hz**, evaluates
glTF STEP/LINEAR/CUBICSPLINE transforms, and chooses the first maximum normalized
world +x extent of bones named like `RightHand` (including fingers), a right-hand
weapon, or a sword. A missing matching bone emits a warning and uses the clip
midpoint. Check the strike visually: the heuristic is not a substitute for a
human choosing the intended contact when an animation has several swings. Set
`hitTimeMs` to a millisecond number to override it; it must lie within the clip.
Adjust `rotationYDegrees` before detection if the exported attack faces another
direction.

`public/models/manifest.json` keeps version 1 and the existing bounds/color fields,
and adds these fields to rigged entries:

```json
{
  "skinned": true,
  "clips": { "idle": "idle", "attack": "attack" },
  "hitTimeMs": 400,
  "clipDurationMs": 1000
}
```

Roles reference canonical output clip names; `clipDurationMs` is the attack
clip's duration (zero without an attack). Each rendered piece owns a cloned
skeleton/mixer, but shares its color's material. Idle loops have per-piece
phases. Captures hold at first contact, play the clip, and resume movement after
it; `plan.impact` is arrival-at-contact + hit time for all destruction effects.
The cached, CPU-skinned bind geometry supplies fracture and collider bounds.

## Check without the real exports

```sh
pnpm models:fixtures --rigged
node scripts/process-models.mjs --source assets/models/fixtures/rigged --out .shots/rigged-models
node scripts/models/check-rigged-browser.mjs
```

The deterministic two-file fixture has a 2-second idle and a 1-second attack
whose hand reaches maximum +x at 400 ms. The browser check uses the live Vite
server, intercepts model requests (so **real `public/models/` is never changed**),
verifies animated pawns and `e2e4,d7d5,e4d5`, and writes
`.shots/rigged-idle.png` and `.shots/rigged-attack.png`. It uses low graphics quality
for reliable software-rendered checks. Run the normal smoke test separately
without interception to validate the real models:

```sh
TIMEOUT_SCALE=1 node scripts/smoke.mjs
```

