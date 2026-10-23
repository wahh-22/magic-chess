/** The procedural battlefield meshes built off the main thread (environment.worker.ts). */
export const ENVIRONMENT_PARTS = ["ruins", "terrain", "plaza", "plazaEdge"] as const;
export type EnvironmentPart = typeof ENVIRONMENT_PARTS[number];
