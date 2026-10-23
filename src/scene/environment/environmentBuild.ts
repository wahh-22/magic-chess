import type { BufferGeometry } from "three";
import { buildPlaza, buildPlazaEdge, buildTerrain } from "./landscape";
import { buildRuins, ruinFootprints } from "./ruins";
import { placementFootprints, scatterLayout, type Placement } from "./scatterLayout";

import type { EnvironmentPart } from "./environmentParts";

/** Procedural battlefield geometry, built off the main thread (environment.worker.ts). */
export type ScatterOptions = Parameters<typeof scatterLayout>[0];

/** Terrain with worn soil around every ruin and scattered solid (the layout is quality-independent for solids). */
const buildGround = () => buildTerrain([...ruinFootprints(), ...placementFootprints(scatterLayout({ grassCount: 0, pebbleCount: 0, lodBias: 1, propDensity: 1 }))]);

export const ENVIRONMENT_BUILDERS: Record<EnvironmentPart, () => BufferGeometry> = {
  ruins: () => buildRuins(),
  terrain: buildGround,
  plaza: () => buildPlaza(),
  plazaEdge: () => buildPlazaEdge(),
};

export function buildPlacements(options: ScatterOptions): Placement[] {
  return scatterLayout(options);
}
