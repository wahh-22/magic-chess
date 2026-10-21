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
