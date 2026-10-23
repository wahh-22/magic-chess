import type { BufferGeometry } from "three";
import { resources } from "../../loading/resource";
import { QUALITY_PRESETS, type GraphicsQuality } from "./battlefieldConfig";
import type { ScatterOptions } from "./environmentBuild";
import { ENVIRONMENT_PARTS, type EnvironmentPart } from "./environmentParts";
import { unpackGeometry, type PackedGeometry } from "./geometryTransfer";
import type { Placement } from "./scatterLayout";

export type EnvironmentRequest = { id: number; kind: "geometry" } | { id: number; kind: "placements"; options: ScatterOptions };
export type EnvironmentResponse = { id: number; geometry?: Record<string, PackedGeometry>; placements?: Placement[]; error?: string };
export type EnvironmentGeometry = Record<EnvironmentPart, BufferGeometry>;

let worker: Worker | null | undefined;
let nextId = 0;
const waiting = new Map<number, { resolve: (response: EnvironmentResponse) => void; reject: (error: Error) => void }>();

function environmentWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL("./environment.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }: MessageEvent<EnvironmentResponse>) => {
      const request = waiting.get(data.id);
      waiting.delete(data.id);
      if (data.error) request?.reject(new Error(data.error));
      else request?.resolve(data);
    };
    worker.onerror = (event) => {
      // A worker that fails to start (old browser, blocked script) falls back to the main thread.
      event.preventDefault();
      worker?.terminate();
      worker = null;
      waiting.forEach(({ reject }) => reject(new Error("Environment worker failed")));
      waiting.clear();
    };
  } catch {
    worker = null;
  }
  return worker;
}

type Request = { kind: "geometry" } | { kind: "placements"; options: ScatterOptions };

function ask(request: Request): Promise<EnvironmentResponse> {
  const target = environmentWorker();
  if (!target) return Promise.reject(new Error("No environment worker"));
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    target.postMessage({ ...request, id });
  });
}

const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Main-thread fallback: one part per task, so input still gets through between them. */
async function buildHere(): Promise<EnvironmentGeometry> {
  const { ENVIRONMENT_BUILDERS } = await import("./environmentBuild");
  const result = {} as EnvironmentGeometry;
  for (const part of ENVIRONMENT_PARTS) {
    await nextTask();
    result[part] = ENVIRONMENT_BUILDERS[part]();
  }
  return result;
}

async function loadGeometry(): Promise<EnvironmentGeometry> {
  try {
    const { geometry } = await ask({ kind: "geometry" });
    const result = {} as EnvironmentGeometry;
    for (const part of ENVIRONMENT_PARTS) result[part] = unpackGeometry(geometry![part]!);
    return result;
  } catch {
    return buildHere();
  }
}

async function loadPlacements(quality: GraphicsQuality): Promise<Placement[]> {
  const preset = QUALITY_PRESETS[quality];
  const options = { grassCount: preset.grassCount, pebbleCount: preset.pebbleCount, lodBias: preset.lodBias, propDensity: preset.propDensity };
  try {
    return (await ask({ kind: "placements", options })).placements!;
  } catch {
    await nextTask();
    const { buildPlacements } = await import("./environmentBuild");
    return buildPlacements(options);
  }
}

/** Starts both requests early (the worker builds while textures download). */
export function preloadEnvironment(quality: GraphicsQuality): Promise<unknown> {
  return Promise.all([resources.preload("environment:geometry", loadGeometry), resources.preload(`environment:placements:${quality}`, () => loadPlacements(quality))]);
}

/** Suspends until the worker has built the ruins, terrain and plaza. Geometry lives for the whole session. */
export function useEnvironmentGeometry(): EnvironmentGeometry {
  return resources.read("environment:geometry", loadGeometry);
}

export function usePlacements(quality: GraphicsQuality): Placement[] {
  return resources.read(`environment:placements:${quality}`, () => loadPlacements(quality));
}
