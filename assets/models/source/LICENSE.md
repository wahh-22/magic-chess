# Piece model licenses

The twelve **ARCANA V6/V7/V8** piece models (V6 queen and rook, V7 bishop, pawn
and king, V8 knight), the **ARCANA — Movimiento V4** pedestals and their shared
PBR textures are authored by the repository owner, **Wilmer Henao**.
The current raw downloads stay outside git in
`assets/models/source/arcana-v678/` and (pedestals)
`assets/models/source/arcana-v4/ARCANA_V4/`; Realismo V3 remains under
`assets/models/source/arcana-realista/ARCANA_Realismo_V3/`; the earlier low-poly
set remains under `assets/models/source/arcana/ARCANA_Ajedrez_3D/`. Only their
GLB/JSON/PNG data is read by this project. Downloaded source scripts are not
executed. Distributed V6–V8 geometry is welded and simplified per rigid part and
per dominant joint of blended layers (kept vertices retain their four skin
weights), quantized and meshopt-compressed. Gameplay clips are
resampled/compressed, the V4 pedestals are included, and shared textures are
resized and converted to WebP.

**License:** the models are © 2026 Wilmer Henao and released under
[Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).
Credit: "ARCANA piece models by Wilmer Henao, CC BY 4.0".

| Piece | Source files (`arcana-v678/`) |
|-------|-------------------------------|
| Pawn | `V7_Peon_<side>/ARCANA_V7_peon_<side>.glb` |
| Knight | `V8_Caballo_<side>/ARCANA_V8_caballo_<side>.glb` (+ `V8_Fuentes/integracion/caballo.json`) |
| Bishop | `V7_Alfil_<side>/ARCANA_V7_alfil_<side>.glb` |
| Rook | `V6_Torre_dos_bandos/ARCANA_V6_torre_<side>.glb` |
| Queen | `V6_Reina_dos_bandos/ARCANA_V6_reina_<side>.glb` |
| King | `V7_Rey_<side>/ARCANA_V7_rey_<side>.glb` |

`<side>` is `marfil` (White) or `obsidiana` (Black). Pedestals:
`arcana-v4/ARCANA_V4/utileria/pedestal_<role>_<side>.glb`.

History: the previous six statue models were generated with Meshy (paid plan)
on 20 October 2026, owned by Wilmer Henao, and released under CC BY 4.0.
They are replaced by ARCANA in `public/models/`. Earlier free-plan knight and
rook variants remain local only and are not distributed.
