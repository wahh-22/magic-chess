import { useEffect, useMemo } from "react";
import { useTextures } from "../../loading/assets";
import { MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, Vector2, type MeshStandardMaterialParameters } from "three";

/** Diffuse (sRGB), OpenGL normal and roughness maps of a CC0 surface in public/environment. */
export function stoneMapUrls(asset: string): [string, string, string] {
  return [`/environment/${asset}_diff.webp`, `/environment/${asset}_nor_gl.webp`, `/environment/${asset}_rough.webp`];
}

/**
 * Clone sampler state, not image data: cached CC0 sources remain untouched.
 * `overrides` must be a stable (module-level) object; it is applied last.
 */
export function useStone(asset: string, repeatX = 1, repeatY = 1, color = "#ffffff", polished = false, overrides?: MeshStandardMaterialParameters) {
  const maps = useTextures(stoneMapUrls(asset));
  const material = useMemo(() => {
    const [map, normalMap, roughnessMap] = maps.map((source, index) => {
      const texture = source.clone();
      texture.wrapS = texture.wrapT = RepeatWrapping;
      texture.repeat.set(repeatX, repeatY);
      texture.anisotropy = 8;
      if (index === 0) texture.colorSpace = SRGBColorSpace;
      texture.needsUpdate = true;
      return texture;
    });
    return new MeshStandardMaterial({ map, normalMap, roughnessMap, color,
      normalScale: new Vector2(polished ? 0.12 : 0.65, polished ? 0.12 : 0.65),
      roughness: polished ? 0.6 : 1, metalness: 0, envMapIntensity: polished ? 0.55 : 0.25, ...overrides });
  }, [maps, repeatX, repeatY, color, polished, overrides]);
  useEffect(() => () => {
    material.map?.dispose(); material.normalMap?.dispose(); material.roughnessMap?.dispose(); material.dispose();
  }, [material]);
  return material;
}
