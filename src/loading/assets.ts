import { ImageLoader, Texture, type Material, type Object3D, type WebGLRenderer } from "three";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { fetchWithProgress } from "./fetchProgress";
import { waitForGpu } from "./gpuFence";
import { isSoftwareRenderer, provideMipChain, rendererName } from "./mipmaps";
import { createProgressTracker, type LoadPhase, type LoadStage } from "./progress";
import { resources } from "./resource";
import { createStagedLoader } from "./stagedLoader";
import { createTimeSlicedQueue } from "./timeSlicedQueue";

/**
 * Central asset manager: every scene download, build step, GPU upload and program link goes
 * through here, so the loading screen shows real progress and heavy GPU work is time-sliced.
 */
export const loadProgress = createProgressTracker();
export const sceneLoader = createStagedLoader();
/** Texture uploads and other GPU work, a few milliseconds per frame. */
export const gpuQueue = createTimeSlicedQueue({ budgetMs: 6 });
/** Main-thread side of worker mip chains (copying each image to the worker), spread over frames. */
const mipQueue = createTimeSlicedQueue({ budgetMs: 6 });

// Meshopt decoding runs in workers instead of on the main thread.
// eslint-disable-next-line react-hooks/rules-of-hooks -- a meshopt API named like a hook, not a React hook.
if (typeof Worker !== "undefined") MeshoptDecoder.useWorkers(2);

/** Registers a step of work and settles its bar item with the promise. */
export function track<T>(id: string, stage: LoadStage, phase: LoadPhase, work: () => Promise<T>): Promise<T> {
  loadProgress.add(id, { stage, phase, total: 1 });
  return work().then(
    (value) => { loadProgress.done(id); return value; },
    (error: unknown) => { loadProgress.fail(id); throw error; },
  );
}

export function fetchAsset(url: string, stage: LoadStage): Promise<ArrayBuffer> {
  const id = `download:${url}`;
  loadProgress.add(id, { stage, phase: "download" });
  return fetchWithProgress(url, { onProgress: (loaded, total) => loadProgress.update(id, loaded, total) }).then(
    (buffer) => { loadProgress.done(id); return buffer; },
    (error: unknown) => { loadProgress.fail(id); throw error; },
  );
}

const MIME: Record<string, string> = { webp: "image/webp", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg" };

/**
 * Decodes off the main thread (createImageBitmap) and flips while decoding, so the texture
 * matches TextureLoader's orientation without a flip at upload time.
 */
async function decodeTexture(url: string, buffer: ArrayBuffer): Promise<Texture> {
  const blob = new Blob([buffer], { type: MIME[url.split(".").pop() ?? ""] ?? "application/octet-stream" });
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob, { imageOrientation: "flipY", premultiplyAlpha: "none", colorSpaceConversion: "none" });
    const texture = new Texture(bitmap);
    texture.flipY = false;
    texture.needsUpdate = true;
    return texture;
  }
  const objectUrl = URL.createObjectURL(blob);
  try {
    return new Texture(await new ImageLoader().loadAsync(objectUrl));
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function loadTexture(url: string, stage: LoadStage = "critical"): Promise<Texture> {
  return resources.preload(`texture:${url}`, async () => {
    const texture = await decodeTexture(url, await fetchAsset(url, stage));
    texture.name = url;
    return texture;
  });
}

/** Suspends until every texture is downloaded and decoded; sources are shared, clone before changing sampler state. */
export function useTextures(urls: string[], stage: LoadStage = "critical"): Texture[] {
  return resources.read(`textures:${urls.join("|")}`, () => Promise.all(urls.map((url) => loadTexture(url, stage))));
}

export function useTexture(url: string, stage: LoadStage = "critical"): Texture {
  return useTextures([url], stage)[0]!;
}

let gltfLoader: GLTFLoader | undefined;

/** Downloads with byte progress, then parses (meshopt in workers, images via ImageBitmap). */
export function loadGLB(url: string, stage: LoadStage = "critical"): Promise<GLTF> {
  return resources.preload(`gltf:${url}`, async () => {
    const buffer = await fetchAsset(url, stage);
    gltfLoader ??= new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    return gltfLoader.parseAsync(buffer, url.slice(0, url.lastIndexOf("/") + 1));
  });
}

export function useGLB(url: string, stage: LoadStage = "critical"): GLTF {
  return resources.read(`gltf:${url}`, () => loadGLB(url, stage));
}

/** Map slots of built-in materials plus texture uniforms of shader materials. */
function texturesOf(material: Material): Texture[] {
  const uniforms = (material as { uniforms?: Record<string, { value: unknown }> }).uniforms ?? {};
  return [...Object.values(material), ...Object.values(uniforms).map((uniform) => uniform?.value)]
    .filter((value): value is Texture => value instanceof Texture);
}

const uploaded = new WeakSet<Texture>();
const software = new WeakMap<WebGLRenderer, boolean>();

/** Software GL (e.g. CI's SwiftShader): mipmaps are built in a worker, not by the GPU process. */
export function isSoftwareGL(renderer: WebGLRenderer): boolean {
  let value = software.get(renderer);
  if (value === undefined) software.set(renderer, value = isSoftwareRenderer(rendererName(renderer.getContext())));
  return value;
}

/** Resolves once the GPU has executed everything issued so far, without blocking the main thread. */
export const gpuIdle = (renderer: WebGLRenderer) => waitForGpu(renderer.getContext());

/**
 * Uploads every texture under `root` through the time-sliced GPU queue, one at a time and
 * each awaited through a GPU fence (the main thread stays free while the GPU works), and
 * reports them as `id` on the loading bar; resolves when all are on the GPU.
 */
export function uploadTextures(renderer: WebGLRenderer, root: Object3D, stage: LoadStage, id: string): Promise<void> {
  const textures = new Set<Texture>();
  root.traverse((object) => {
    const material = (object as { material?: Material | Material[] }).material;
    for (const item of Array.isArray(material) ? material : material ? [material] : []) {
      for (const texture of texturesOf(item)) if (!uploaded.has(texture) && texture.image) textures.add(texture);
    }
  });
  loadProgress.add(id, { stage, phase: "upload" });
  let done = 0;
  loadProgress.update(id, 0, Math.max(textures.size, 1));
  if (!textures.size) loadProgress.done(id);
  const cpuMips = isSoftwareGL(renderer);
  return Promise.all([...textures].map((texture) => {
    // Chains build in parallel in the worker; uploads stay in order on the queue.
    const chain = cpuMips ? new Promise<void>((resolve) => {
      void mipQueue.enqueue(() => { void provideMipChain(texture).finally(resolve); });
    }) : Promise.resolve();
    return gpuQueue.enqueue(async () => {
      await chain;
      uploaded.add(texture);
      renderer.initTexture(texture);
      await gpuIdle(renderer);
      loadProgress.update(id, ++done, textures.size);
    });
  })).then(() => loadProgress.done(id));
}

if (import.meta.env.DEV) Object.assign(globalThis, { __sceneLoader: sceneLoader, __loadProgress: loadProgress });
