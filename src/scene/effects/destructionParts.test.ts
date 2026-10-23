import { describe, expect, it, vi } from "vitest";
import { BoxGeometry, MeshStandardMaterial } from "three";
import { createProceduralPieceProvider } from "../pieces/proceduralPieces";
import { prewarmDestructionParts } from "./destructionParts";
import type { RigidPart } from "./pieceParts";

const part = (): RigidPart => ({ geometry: new BoxGeometry(), center: [0, 0, 0], volume: 1, materials: [new MeshStandardMaterial()] });

describe("prewarmDestructionParts", () => {
  it("splits and budgets one piece/colour per idle task, so no task holds the main thread long", () => {
    const tasks: (() => void)[] = [];
    const parts = vi.fn(() => [part(), part()]);
    prewarmDestructionParts({ ...createProceduralPieceProvider(), parts }, 1, (task) => { tasks.push(task); return () => {}; });
    expect(parts).not.toHaveBeenCalled();
    tasks.shift()!();
    expect(parts).toHaveBeenCalledTimes(1);
    while (tasks.length) tasks.shift()!();
    expect(parts).toHaveBeenCalledTimes(12);
  });

  it("stops scheduling once cancelled", () => {
    const tasks: (() => void)[] = [];
    const parts = vi.fn(() => undefined);
    const cancel = prewarmDestructionParts({ ...createProceduralPieceProvider(), parts }, 12, (task) => { tasks.push(task); return () => {}; });
    tasks.shift()!();
    cancel();
    while (tasks.length) tasks.shift()!();
    expect(parts).toHaveBeenCalledTimes(1);
  });
});
