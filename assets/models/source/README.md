# Raw model inputs

Drop `pawn.glb`, `knight.glb`, `bishop.glb`, `rook.glb`, `queen.glb`, and/or
`king.glb` here. Missing pieces are skipped and the game uses procedural fallback.
See [the generation guide](../../../docs/models/generation-guide.md) for prompts,
settings, and licensing. Record the tool, plan, license, and date in `LICENSE.md`.

Raw exports are ignored by default. Only commit them after explicit approval and
license review (an approved file can be force-added by the repository owner).
The README and license notes remain trackable. Processed `public/models/` outputs
are intentionally **not** ignored.

Edit orientation and budgets in [`../manifest.json`](../manifest.json), then run
`pnpm models`. Positive rotation is a right-handed rotation around +y; a source
turned +90° from +x needs `rotationYDegrees: -90`.

For a dry run without changing shipped assets:

```sh
pnpm models --source assets/models/fixtures --out .shots/models-check
```

See [`../README.md`](../README.md) for pipeline details and fixture regeneration.
