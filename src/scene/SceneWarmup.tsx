import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import type { Object3D } from "three";
import { gpuIdle, gpuQueue, sceneLoader, track } from "../loading/assets";
import { prepareForDisplay } from "./StreamIn";

const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Runs `render` with frustum culling off: every mesh is drawn once, not only what the play
 * camera sees. The arrival shot and the free camera bring the rest into view, and a first
 * draw uploads its buffers (and in software GL builds its pipeline) inside that frame.
 */
function drawingEverything(root: Object3D, render: () => void) {
  const culled: Object3D[] = [];
  root.traverse((object) => { if (object.frustumCulled) { object.frustumCulled = false; culled.push(object); } });
  try { render(); }
  finally { for (const object of culled) object.frustumCulled = true; }
}

/** Times a warm-up step in the browser's performance timeline (DevTools, scripts/perf). */
async function measured<T>(name: string, step: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try { return await step(); }
  finally { performance.measure(`magic-chess:${name}`, { start, end: performance.now() }); }
}

/**
 * Last child of the critical Suspense boundary: it mounts once board, pieces, sky, ground,
 * lights and effects are all in the scene (the canvas does not render yet). It then uploads
 * every texture and links every program in time slices, renders one frame behind the
 * loading screen for what only a render compiles (shadow-map depth, post passes), and
 * reports the scene ready. `pass` names a new round of loading-bar items (quality change).
 */
export function SceneWarmup({ postprocessing, pass }: { postprocessing: boolean; pass: string }) {
  const get = useThree((state) => state.get);
  useEffect(() => {
    let active = true;
    sceneLoader.getState().criticalMounted();
    const { gl, scene, camera } = get();
    void (async () => {
      // The sky's environment map (queued at mount) must exist: it is part of every lit program.
      await measured("environment", () => gpuQueue.idle());
      if (!active) return;
      await measured("prepare", () => prepareForDisplay(gl, scene, "critical", `scene-${pass}`, postprocessing, camera, scene));
      if (!active) return;
      await track(`compile:first-frame-${pass}`, "critical", "compile", async () => {
        await nextTask();
        if (!active) return;
        await measured("first-frame", async () => drawingEverything(scene, () => get().advance(performance.now())));
        await measured("first-frame-gpu", () => gpuIdle(gl));
      });
      await nextTask();
    })()
      .catch((error: unknown) => console.warn("Scene warm-up failed; compiling on first use", error))
      .finally(() => { if (active) sceneLoader.getState().warmed(); });
    return () => { active = false; };
  }, [get, postprocessing, pass]);
  return null;
}
