import type { Camera, Material, Object3D, Scene, WebGLRenderTarget } from "three";

/** The slice of WebGLRenderer the warm-up needs (injectable for tests). */
export interface WarmupRenderer {
  compile(object: Object3D, camera: Camera, targetScene?: Scene | null): Set<Material>;
  properties: { get(material: Material): { currentProgram?: { isReady(): boolean; getUniforms(): object } } };
  extensions: { has(name: string): boolean };
  getRenderTarget(): WebGLRenderTarget | null;
  setRenderTarget(target: WebGLRenderTarget | null): void;
}

interface Renderable extends Object3D {
  material?: Material | Material[];
  geometry?: { attributes: Record<string, unknown>; morphAttributes?: Record<string, unknown[]> };
  isMesh?: boolean; isPoints?: boolean; isLine?: boolean; isSprite?: boolean;
  isSkinnedMesh?: boolean; isInstancedMesh?: boolean; isBatchedMesh?: boolean;
}

/**
 * One object per distinct program candidate: the material plus what three folds into the
 * program key from the object (kind, skinning, instancing, shadows, vertex attributes).
 * Duplicates would only hit the program cache, but each costs a scene traversal.
 */
export function compileUnits(root: Object3D): Object3D[] {
  const seen = new Set<string>();
  const units: Object3D[] = [];
  root.traverse((object) => {
    const item = object as Renderable;
    if (!(item.isMesh || item.isPoints || item.isLine || item.isSprite) || !item.material) return;
    const materials = Array.isArray(item.material) ? item.material : [item.material];
    const attributes = Object.keys(item.geometry?.attributes ?? {}).sort().join(",");
    const morphs = Object.keys(item.geometry?.morphAttributes ?? {}).join(",");
    const key = [item.type, materials.map((material) => material.uuid).join("+"), item.receiveShadow, attributes, morphs,
      item.isSkinnedMesh, item.isInstancedMesh, item.isBatchedMesh].join("|");
    if (seen.has(key)) return;
    seen.add(key);
    units.push(object);
  });
  return units;
}

export interface WarmupOptions {
  /** Main-thread time per slice before yielding to input and paint. */
  budgetMs?: number;
  now?: () => number;
  yieldFrame?: () => Promise<void>;
  onProgress?: (done: number, total: number) => void;
  /**
   * Render target bound while compiling: a scene drawn through post-processing renders into
   * a target (linear output, tone mapping in the post stack), which changes every program.
   */
  target?: WebGLRenderTarget | null;
  /**
   * Without parallel compile: resolves once the GPU has executed the issued compile/link
   * (a fence), so querying the program right after no longer stalls the main thread.
   */
  settle?: () => Promise<void>;
}

const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Compiles and links every program the units need before they are first drawn, a slice at a
 * time. With KHR_parallel_shader_compile the driver links in the background and programs are
 * only touched once ready; without it (e.g. software GL) each link is awaited through a GPU
 * fence (`settle`) or, failing that, right after its compile, so one long freeze becomes many
 * short ones with input handled in between.
 */
export async function warmPrograms(renderer: WarmupRenderer, units: Object3D[], camera: Camera, scene: Scene, {
  budgetMs = 8, now = () => performance.now(), yieldFrame = nextTask, onProgress, target = null, settle,
}: WarmupOptions = {}): Promise<void> {
  const parallel = renderer.extensions.has("KHR_parallel_shader_compile");
  const total = units.length;
  let done = 0;
  let sliceStart = now();
  const breathe = async () => {
    if (now() - sliceStart < budgetMs) return;
    await yieldFrame();
    sliceStart = now();
  };
  const compile = (unit: Object3D) => {
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(target);
    try { return renderer.compile(unit, camera, scene); }
    finally { renderer.setRenderTarget(previous); }
  };
  const link = (material: Material) => { renderer.properties.get(material).currentProgram?.getUniforms(); };

  if (!parallel) {
    for (const unit of units) {
      await breathe();
      const materials = compile(unit);
      if (settle) {
        await settle();
        sliceStart = now();
      }
      materials.forEach(link);
      onProgress?.(++done, total);
    }
    return;
  }

  const waiting = new Map<Object3D, Set<Material>>();
  for (const unit of units) {
    await breathe();
    waiting.set(unit, compile(unit));
  }
  while (waiting.size) {
    for (const [unit, materials] of waiting) {
      for (const material of materials) {
        const program = renderer.properties.get(material).currentProgram;
        if (program && !program.isReady()) continue;
        link(material);
        materials.delete(material);
      }
      if (!materials.size) {
        waiting.delete(unit);
        onProgress?.(++done, total);
      }
    }
    if (waiting.size) {
      await yieldFrame();
      sliceStart = now();
    }
  }
}
