import { createPrefetchCache } from "./prefetch";
import { createProgressTracker } from "./progress";
import { createStagedLoader } from "./stagedLoader";

/**
 * Loading state shared by the title menu (no three.js) and the match (the asset manager in
 * `assets.ts`): the progress the loading screen shows, the scene's loading stage, and the
 * bytes prefetched while the menu is shown.
 */
export const loadProgress = createProgressTracker();
export const sceneLoader = createStagedLoader();
export const prefetched = createPrefetchCache();

if (import.meta.env.DEV) Object.assign(globalThis, { __sceneLoader: sceneLoader, __loadProgress: loadProgress });
