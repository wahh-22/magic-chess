import { CanvasTexture, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace } from "three";
import type { Color } from "../core/types";

/**
 * Grainy stone texture drawn on a canvas: speckles plus soft veins. Used as color
 * variation and roughness so surfaces read as carved stone, not plastic.
 */
function stoneTexture(seed: number, size = 256): CanvasTexture | null {
  // Pure geometry/provider tests run without a DOM; rendering still uses the canvas texture.
  if (typeof document === "undefined") return null;
  let state = seed;
  const random = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d")!;
  const image = context.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const value = 200 + random() * 55;
    image.data.set([value, value, value, 255], i * 4);
  }
  context.putImageData(image, 0, 0);
  context.globalAlpha = 0.12;
  context.strokeStyle = "#555";
  for (let vein = 0; vein < 6; vein++) {
    context.lineWidth = 1 + random() * 2;
    context.beginPath();
    context.moveTo(random() * size, 0);
    for (let y = 0; y <= size; y += 16) context.lineTo(random() * size * 0.2 + (vein / 6) * size, y);
    context.stroke();
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function stone(color: string, roughness: number, seed: number): MeshStandardMaterial {
  const texture = stoneTexture(seed);
  return new MeshStandardMaterial({ color, map: texture, roughnessMap: texture, roughness, metalness: 0 });
}

export const pieceMaterials: Record<Color, MeshStandardMaterial> = {
  w: stone("#e9e2d2", 0.55, 11),
  b: stone("#34343a", 0.45, 23),
};

export const fragmentMaterials: Record<Color, MeshStandardMaterial> = {
  w: new MeshStandardMaterial({ color: "#e9e2d2", roughness: 0.55 }),
  b: new MeshStandardMaterial({ color: "#34343a", roughness: 0.45 }),
};
