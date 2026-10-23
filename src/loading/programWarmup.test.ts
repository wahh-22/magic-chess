import { describe, expect, it } from "vitest";
import { BoxGeometry, Group, InstancedMesh, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, PerspectiveCamera, Scene, type Material } from "three";
import { compileUnits, warmPrograms, type WarmupRenderer } from "./programWarmup";

function fakeRenderer({ parallel, readyAfterPolls = 0, linkMs = 0, clock }: { parallel: boolean; readyAfterPolls?: number; linkMs?: number; clock: { t: number } }) {
  const log: string[] = [];
  const polls = new Map<Material, number>();
  const programs = new Map<Material, { isReady(): boolean; getUniforms(): object }>();
  const renderer: WarmupRenderer = {
    compile(object) {
      const materials = new Set<Material>();
      object.traverse((child) => { if (child instanceof Mesh) materials.add(child.material as Material); });
      for (const material of materials) {
        log.push(`compile ${material.name}`);
        programs.set(material, {
          isReady: () => {
            const count = (polls.get(material) ?? 0) + 1;
            polls.set(material, count);
            return count > readyAfterPolls;
          },
          getUniforms: () => { log.push(`link ${material.name}`); clock.t += linkMs; return {}; },
        });
      }
      return materials;
    },
    properties: { get: (material) => ({ currentProgram: programs.get(material) }) },
    extensions: { has: (name) => parallel && name === "KHR_parallel_shader_compile" },
    getRenderTarget: () => null,
    setRenderTarget: () => {},
  };
  return { renderer, log };
}

const named = (name: string) => Object.assign(new MeshStandardMaterial(), { name });

describe("compileUnits", () => {
  it("keeps one object per distinct material and object kind", () => {
    const root = new Group();
    const stone = named("stone"), glow = new MeshBasicMaterial();
    const box = new BoxGeometry();
    root.add(new Mesh(box, stone), new Mesh(box, stone), new Mesh(box, glow), new InstancedMesh(box, stone, 4), new Object3D());
    const shadowed = new Mesh(box, stone);
    shadowed.receiveShadow = true;
    root.add(shadowed);
    expect(compileUnits(root)).toHaveLength(4);
  });
});

describe("warmPrograms", () => {
  const camera = new PerspectiveCamera();
  const scene = new Scene();
  const meshes = (count: number) => {
    const root = new Group();
    for (let index = 0; index < count; index++) root.add(new Mesh(new BoxGeometry(), named(`m${index}`)));
    return compileUnits(root);
  };

  it("without parallel compile, links each program right away and yields once the slice budget is used", async () => {
    const clock = { t: 0 };
    const { renderer, log } = fakeRenderer({ parallel: false, linkMs: 30, clock });
    let yields = 0;
    const progress: number[] = [];
    await warmPrograms(renderer, meshes(3), camera, scene, {
      budgetMs: 8, now: () => clock.t, yieldFrame: async () => { yields++; }, onProgress: (done) => progress.push(done),
    });
    expect(log).toEqual(["compile m0", "link m0", "compile m1", "link m1", "compile m2", "link m2"]);
    expect(yields).toBeGreaterThanOrEqual(2);
    expect(progress.at(-1)).toBe(3);
  });

  it("without parallel compile, waits for the GPU (settle) between issuing a link and querying it", async () => {
    const clock = { t: 0 };
    const { renderer, log } = fakeRenderer({ parallel: false, clock });
    await warmPrograms(renderer, meshes(2), camera, scene, {
      yieldFrame: async () => {}, settle: async () => { log.push("gpu idle"); },
    });
    expect(log).toEqual(["compile m0", "gpu idle", "link m0", "compile m1", "gpu idle", "link m1"]);
  });

  it("with parallel compile, never blocks on a program before the driver reports it ready", async () => {
    const clock = { t: 0 };
    const { renderer, log } = fakeRenderer({ parallel: true, readyAfterPolls: 2, clock });
    let yields = 0;
    await warmPrograms(renderer, meshes(2), camera, scene, { budgetMs: 8, now: () => clock.t, yieldFrame: async () => { yields++; } });
    expect(log.slice(0, 2)).toEqual(["compile m0", "compile m1"]);
    expect(log.slice(2).sort()).toEqual(["link m0", "link m1"]);
    expect(yields).toBeGreaterThanOrEqual(2);
  });

  it("compiles into the given render target and restores the previous one", async () => {
    const clock = { t: 0 };
    const { renderer } = fakeRenderer({ parallel: false, clock });
    const targets: unknown[] = [];
    renderer.setRenderTarget = (target) => { targets.push(target); };
    const offscreen = { isRenderTarget: true };
    await warmPrograms(renderer, meshes(1), camera, scene, { target: offscreen as never, yieldFrame: async () => {} });
    expect(targets).toEqual([offscreen, null]);
  });
});
