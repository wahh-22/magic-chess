import { NearestFilter, LinearFilter, type Texture } from "three";

/** Sizes of every level below the base, halving each axis (clamped to 1) down to 1×1. */
export function mipLevelSizes(width: number, height: number): [number, number][] {
  const sizes: [number, number][] = [];
  while (width > 1 || height > 1) {
    width = Math.max(1, width >> 1);
    height = Math.max(1, height >> 1);
    sizes.push([width, height]);
  }
  return sizes;
}

/** Software rasterisers (CI's SwiftShader, Mesa llvmpipe, Windows' basic driver). */
export function isSoftwareRenderer(name: string | null | undefined): boolean {
  return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name ?? "");
}

export function rendererName(gl: WebGLRenderingContext | WebGL2RenderingContext): string | null {
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  return info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : null;
}

/** Textures the GPU would mipmap (generateMipmap) that have a decoded image and no chain yet. */
export function needsMipChain(texture: Texture): boolean {
  const image = texture.image as { width?: number; height?: number } | null | undefined;
  return texture.generateMipmaps && texture.minFilter !== LinearFilter && texture.minFilter !== NearestFilter &&
    !texture.mipmaps?.length && Boolean(image?.width && image?.height);
}

let worker: Worker | null | undefined;
let nextId = 0;
const waiting = new Map<number, (levels: ImageBitmap[] | undefined) => void>();

function mipWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL("./mipmap.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }: MessageEvent<{ id: number; levels?: ImageBitmap[] }>) => {
      waiting.get(data.id)?.(data.levels);
      waiting.delete(data.id);
    };
    worker.onerror = (event) => {
      event.preventDefault();
      worker?.terminate();
      worker = null;
      waiting.forEach((resolve) => resolve(undefined));
      waiting.clear();
    };
  } catch {
    worker = null;
  }
  return worker;
}

const chains = new WeakMap<object, Promise<ImageBitmap[] | undefined>>();

/**
 * Builds the levels below an ImageBitmap in a worker (resized while decoding, off the main
 * thread). Undefined when unavailable: the GPU then generates the mipmaps as usual.
 */
export function mipChain(image: ImageBitmap): Promise<ImageBitmap[] | undefined> {
  let chain = chains.get(image);
  if (!chain) {
    const target = mipWorker();
    chain = target ? new Promise((resolve) => {
      const id = ++nextId;
      waiting.set(id, resolve);
      // A structured-clone copy: the texture keeps its own base level.
      target.postMessage({ id, image, sizes: mipLevelSizes(image.width, image.height) });
    }) : Promise.resolve(undefined);
    chains.set(image, chain);
  }
  return chain;
}

/**
 * Software GL generates mipmaps on the CPU inside the GPU process, seconds per 1024² texture;
 * an explicit chain uploads in milliseconds. Real GPUs keep generateMipmap (cheap there).
 */
export async function provideMipChain(texture: Texture): Promise<void> {
  if (!needsMipChain(texture) || typeof ImageBitmap === "undefined" || !(texture.image instanceof ImageBitmap)) return;
  const levels = await mipChain(texture.image);
  if (!levels || !needsMipChain(texture)) return;
  // SAFETY: WebGLTextures uploads each mipmap entry with texSubImage2D, which accepts ImageBitmaps; the typings list only canvases.
  texture.mipmaps = [texture.image, ...levels] as unknown as Texture["mipmaps"];
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
}
