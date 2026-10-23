import { describe, expect, it } from "vitest";
import { LinearFilter, LinearMipmapLinearFilter, Texture } from "three";
import { isSoftwareRenderer, mipLevelSizes, needsMipChain } from "./mipmaps";

describe("mip chains", () => {
  it("halves each axis down to 1×1, clamping the shorter side", () => {
    expect(mipLevelSizes(8, 2)).toEqual([[4, 1], [2, 1], [1, 1]]);
    expect(mipLevelSizes(1024, 1024)).toHaveLength(10);
    expect(mipLevelSizes(1, 1)).toEqual([]);
  });

  it("recognises software rasterisers by their WebGL renderer string", () => {
    expect(isSoftwareRenderer("ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)")).toBe(true);
    expect(isSoftwareRenderer("llvmpipe (LLVM 15.0.7, 256 bits)")).toBe(true);
    expect(isSoftwareRenderer("ANGLE (Microsoft Basic Render Driver Direct3D11)")).toBe(true);
    expect(isSoftwareRenderer("ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)")).toBe(false);
    expect(isSoftwareRenderer(undefined)).toBe(false);
  });

  it("only mipmapped textures with a decoded image and no chain of their own get one", () => {
    const image = { width: 4, height: 4 };
    const texture = new Texture(image);
    expect(needsMipChain(texture)).toBe(true);
    texture.minFilter = LinearFilter;
    expect(needsMipChain(texture)).toBe(false);
    texture.minFilter = LinearMipmapLinearFilter;
    texture.generateMipmaps = false;
    expect(needsMipChain(texture)).toBe(false);
    expect(needsMipChain(new Texture())).toBe(false);
    const chained = new Texture(image);
    chained.mipmaps = [image as never];
    expect(needsMipChain(chained)).toBe(false);
  });
});
