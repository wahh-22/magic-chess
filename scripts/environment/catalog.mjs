// Scanned CC0 sources for the ruins-at-sunset battlefield and how each is reduced for the web.
// Sizes stay in metres; the scene scales instances to board units.
//
// `lods[n]`: `solid` = triangle budget per opaque primitive (meshopt), `prune` drops small
// disconnected bits (twigs) at that level; `alpha` handles alpha-cut foliage:
// `cards` turns each modelled leaf into one textured quad, then `keep` thins the leaves
// deterministically and `grow` enlarges survivors so the canopy keeps its coverage;
// `simplify` is a meshopt budget for alpha geometry that is not card-like (grass blades).

const TREE_LODS = [
  { solid: 6000, prune: true, alpha: { cards: true, keep: 0.4, grow: 1.45 } },
  { solid: 1400, prune: true, alpha: { cards: true, keep: 0.12, grow: 2.6 } },
  // Far tree line: a sparse cloud of large leaf cards on a bare trunk, a few thousand triangles.
  { solid: 350, prune: true, alpha: { cards: true, keep: 0.035, grow: 4.6 } },
];

export const MODELS = [
  // Olive-like Mediterranean trees with gnarled trunks.
  { id: 'island_tree_01', role: 'tree', texture: 1024, lods: TREE_LODS },
  { id: 'island_tree_02', role: 'tree', texture: 1024, lods: TREE_LODS },
  // Evergreen maquis bushes.
  {
    id: 'searsia_lucida', role: 'shrub', texture: 512,
    variants: ['searsia_lucida_a_LOD0', 'searsia_lucida_b_LOD0', 'searsia_lucida_c_LOD0', 'searsia_lucida_d_LOD0'],
    lods: [{ solid: 1200, prune: true, alpha: { cards: true, keep: 0.35, grow: 1.5 } }],
  },
  // Dry, sun-bleached shrubs.
  {
    id: 'wild_rooibos_bush', role: 'shrub', texture: 512,
    variants: ['wild_rooibos_bush_a', 'wild_rooibos_bush_b', 'wild_rooibos_bush_c', 'wild_rooibos_bush_d'],
    lods: [{ solid: 500, prune: true, alpha: { keep: 0.25, grow: 1.6 } }],
  },
  // Grass tufts (alpha-cut blades, swayed by wind in the vertex shader).
  {
    id: 'grass_medium_01', role: 'grass', texture: 512,
    variants: ['grass_medium_01_mid_a_LOD0', 'grass_medium_01_tall_a_LOD0', 'grass_medium_01_tall_b_LOD0', 'grass_medium_01_large_a_LOD0'],
    lods: [{ alpha: { simplify: 180 } }],
  },
  {
    id: 'grass_medium_02', role: 'grass', texture: 512,
    variants: ['grass_medium_02_b', 'grass_medium_02_c', 'grass_medium_02_d', 'grass_medium_02_e'],
    lods: [{ alpha: { simplify: 180 } }],
  },
  // Weathered boulders and rocks.
  { id: 'namaqualand_boulder_02', role: 'rock', texture: 1024, lods: [{ solid: 5000 }, { solid: 900 }] },
  { id: 'namaqualand_boulder_04', role: 'rock', texture: 1024, lods: [{ solid: 5000 }, { solid: 900 }] },
  { id: 'namaqualand_boulder_05', role: 'rock', texture: 1024, lods: [{ solid: 4000 }, { solid: 800 }] },
  { id: 'rock_07', role: 'rock', texture: 512, lods: [{ solid: 700 }, { solid: 250 }] },
  { id: 'stone_01', role: 'rock', texture: 512, lods: [{ solid: 500 }, { solid: 160 }] },
  // Pebbles scattered at the plaza edges.
  { id: 'namaqualand_stones_01', role: 'pebble', texture: 512, lods: [{ solid: 120 }] },
];

/** Tiling ground and stone textures (diffuse / OpenGL normal / roughness), CC0 Poly Haven. */
export const TEXTURES = [
  { id: 'aerial_grass_rock', size: 1024, normalSize: 512 },
  { id: 'dry_ground_rocks', size: 1024, normalSize: 512 },
  { id: 'rocks_ground_02', size: 1024, normalSize: 512 },
  { id: 'worn_rock_natural_01', size: 1024, normalSize: 1024 },
];
