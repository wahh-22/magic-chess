import { describe, expect, it } from "vitest";
import { BoxGeometry } from "three";
import { packGeometry, unpackGeometry } from "./geometryTransfer";

describe("geometry transfer", () => {
  it("round-trips attributes, index, groups and bounds without copying the buffers", () => {
    const source = new BoxGeometry(1, 2, 3);
    source.computeBoundingSphere();
    const { packed, transfer } = packGeometry(source);
    const position = source.getAttribute("position").array;
    expect(transfer).toContain(position.buffer);
    const copy = unpackGeometry(structuredClone(packed));
    expect(Object.keys(copy.attributes).sort()).toEqual(["normal", "position", "uv"]);
    expect([...copy.getAttribute("position").array]).toEqual([...position]);
    expect(copy.getAttribute("uv").itemSize).toBe(2);
    expect([...copy.index!.array]).toEqual([...source.index!.array]);
    expect(copy.groups).toEqual(source.groups);
    expect(copy.boundingSphere!.radius).toBeCloseTo(source.boundingSphere!.radius);
  });

  it("lists each buffer once even when attributes share it", () => {
    const source = new BoxGeometry();
    source.setAttribute("alias", source.getAttribute("position"));
    const { transfer } = packGeometry(source);
    expect(new Set(transfer).size).toBe(transfer.length);
  });
});
