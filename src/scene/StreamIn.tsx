import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { HalfFloatType, WebGLRenderTarget, type Group, type Object3D, type WebGLRenderer } from "three";
import { gpuIdle, loadProgress, uploadTextures } from "../loading/assets";
import { compileUnits, warmPrograms } from "../loading/programWarmup";
import type { LoadStage } from "../loading/progress";

const targets = new WeakMap<WebGLRenderer, WebGLRenderTarget>();

/**
 * Where programs are compiled: through post-processing the scene renders into a target
 * (linear output, tone mapping applied later), which changes every program, so the warm-up
 * must compile into a target too. Any small target gives the same program keys.
 */
export function compileTarget(gl: WebGLRenderer, postprocessing: boolean): WebGLRenderTarget | null {
  if (!postprocessing) return null;
  let target = targets.get(gl);
  if (!target) targets.set(gl, target = new WebGLRenderTarget(1, 1, { type: HalfFloatType }));
  return target;
}

const preparing = new WeakMap<Object3D, Map<string, Promise<void>>>();

/**
 * Uploads textures and links programs for `root` in time slices, against the live scene's
 * lights and fog. One run per root and id (StrictMode re-runs effects in development).
 */
export function prepareForDisplay(gl: WebGLRenderer, root: Object3D, stage: LoadStage, id: string, postprocessing: boolean,
  camera: Parameters<typeof warmPrograms>[2], scene: Parameters<typeof warmPrograms>[3]): Promise<void> {
  let runs = preparing.get(root);
  if (!runs) preparing.set(root, runs = new Map());
  let run = runs.get(id);
  if (!run) runs.set(id, run = prepare(gl, root, stage, id, postprocessing, camera, scene));
  return run;
}

async function prepare(gl: WebGLRenderer, root: Object3D, stage: LoadStage, id: string, postprocessing: boolean,
  camera: Parameters<typeof warmPrograms>[2], scene: Parameters<typeof warmPrograms>[3]) {
  let start = performance.now();
  await uploadTextures(gl, root, stage, `upload:${id}`);
  performance.measure(`magic-chess:uploads:${id}`, { start, end: performance.now() });
  start = performance.now();
  const units = compileUnits(root);
  const compileId = `compile:${id}`;
  loadProgress.add(compileId, { stage, phase: "compile", total: Math.max(units.length, 1) });
  // SAFETY: WebGLRenderer exposes `properties` and `extensions` at runtime; the typings omit them.
  await warmPrograms(gl as unknown as Parameters<typeof warmPrograms>[0], units, camera, scene, {
    target: compileTarget(gl, postprocessing),
    settle: () => gpuIdle(gl),
    onProgress: (done, total) => loadProgress.update(compileId, done, total),
  });
  loadProgress.done(compileId);
  performance.measure(`magic-chess:programs:${id}`, { start, end: performance.now() });
}

/**
 * Secondary content: mounted hidden, prepared off the critical path (textures uploaded and
 * programs linked a slice at a time), then revealed with a short dither fade. Mount it
 * inside the Suspense boundary of its assets, so it starts once they have all loaded.
 */
export function StreamIn({ id, onFade, onShown, postprocessing, fadeMs = 900, children }: {
  id: string;
  /** Receives the fade amount 0 → 1 (drive a reveal uniform with it). */
  onFade: (amount: number) => void;
  /** Called once the content is prepared and starts fading in. */
  onShown?: () => void;
  postprocessing: boolean; fadeMs?: number; children: ReactNode;
}) {
  const group = useRef<Group>(null);
  const fade = useRef(0);
  const get = useThree((state) => state.get);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let active = true;
    fade.current = 0;
    onFade(0);
    const { gl, camera, scene } = get();
    void prepareForDisplay(gl, group.current!, "secondary", id, postprocessing, camera, scene)
      .catch((error: unknown) => console.warn(`Could not prepare ${id}`, error))
      .then(() => {
        if (!active) return;
        setVisible(true);
        onShown?.();
      });
    return () => { active = false; };
  }, [get, id, onFade, onShown, postprocessing]);
  useFrame(({ invalidate }, delta) => {
    if (!visible || fade.current >= 1) return;
    fade.current = Math.min(1, fade.current + Math.min(delta, 0.1) * 1000 / fadeMs);
    onFade(fade.current);
    // Behind the setup menu the scene renders on demand: keep frames coming until the fade ends.
    invalidate();
  });
  return <group ref={group} visible={visible}>{children}</group>;
}
