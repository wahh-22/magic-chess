import { useThree } from "@react-three/fiber";
import { gpuIdle, gpuQueue, useTexture } from "../../loading/assets";
import { useEffect, useMemo } from "react";
import { BackSide, LinearFilter, Mesh, NoColorSpace, PMREMGenerator, RepeatWrapping, Scene, ShaderMaterial, SphereGeometry, type WebGLRenderTarget } from "three";
import { SKY } from "./battlefieldConfig";

const vertexShader = /* glsl */ `
varying vec3 vDirection;
void main() {
  vDirection = position;
  // Rotation only: the sky sits at infinity and is drawn on the far plane.
  vec4 clip = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(position, 1.0);
  gl_Position = clip.xyww;
}`;

const fragmentShader = /* glsl */ `
#include <common>
uniform sampler2D map;
uniform float intensity;
uniform float cropElevation;
uniform float ceiling;
uniform float rotation;
varying vec3 vDirection;
void main() {
  vec3 direction = normalize(vDirection);
  float u = atan(direction.z, direction.x) * RECIPROCAL_PI2 + 0.5 - rotation;
  float elevation = asin(clamp(direction.y, -1.0, 1.0));
  float row = clamp((PI * 0.5 - elevation) / (PI * 0.5 - cropElevation), 0.0, 1.0);
  vec3 encoded = texture2D(map, vec2(u, 1.0 - row)).rgb;
  // Inverse of the bake: v = (r / (1 + r))^(1/2.2), so radiance r = y / (1 - y).
  vec3 y = min(pow(encoded, vec3(2.2)), vec3(0.995));
  gl_FragColor = vec4(min(y / (1.0 - y), vec3(ceiling)) * intensity, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/**
 * CC0 HDRI sky decoded from an 8-bit range-compressed WebP (one ~0.2 MB file instead of a
 * multi-megabyte .hdr). It is both the visible sky and, through PMREM, the scene's
 * ambient light and reflections, so steel reflects the same sunset the player sees.
 */
export function Sky({ intensity = 1, environmentIntensity = 1 }: { intensity?: number; environmentIntensity?: number }) {
  const source = useTexture(SKY.url);
  const get = useThree((state) => state.get);
  const materials = useMemo(() => {
    const map = source.clone();
    // Raw encoded values; mipmaps would seam at the equirect wrap and are not needed.
    map.colorSpace = NoColorSpace;
    map.wrapS = RepeatWrapping;
    map.generateMipmaps = false;
    map.minFilter = LinearFilter;
    map.needsUpdate = true;
    const create = (ceiling: number) => new ShaderMaterial({
      vertexShader, fragmentShader, side: BackSide, depthWrite: false, fog: false,
      uniforms: {
        map: { value: map }, intensity: { value: intensity }, ceiling: { value: ceiling },
        cropElevation: { value: SKY.cropElevationDeg * Math.PI / 180 },
        // Turns the panorama about the vertical axis from the baked sun to the scene's sun.
        rotation: { value: SKY.sunU - SKY.bakedSunU },
      },
    });
    // The lighting copy caps the sun disc: the directional light already carries its
    // energy, and an uncapped sun in the PMREM blinds polished stone at grazing angles.
    return { visible: create(SKY.maxRadiance), lighting: create(SKY.lightingCeiling) };
  }, [source, intensity]);
  const geometry = useMemo(() => new SphereGeometry(10, 64, 32), []);
  useEffect(() => {
    const { gl, scene } = get();
    let target: WebGLRenderTarget | undefined;
    let disposed = false;
    // Sequenced on the GPU queue: the scene's programs are warmed after the environment exists.
    void gpuQueue.enqueue(async () => {
      if (disposed) return;
      const pmrem = new PMREMGenerator(gl);
      const skyScene = new Scene();
      skyScene.add(new Mesh(geometry, materials.lighting));
      target = pmrem.fromScene(skyScene, 0, 0.1, 100, { size: 512 });
      pmrem.dispose();
      scene.environment = target.texture;
      // The blur passes are heavy GPU work: wait for them without blocking the main thread.
      await gpuIdle(gl);
    });
    return () => {
      disposed = true;
      if (target && scene.environment === target.texture) scene.environment = null;
      target?.dispose();
    };
  }, [get, geometry, materials]);
  useEffect(() => { get().scene.environmentIntensity = environmentIntensity; }, [get, environmentIntensity]);
  useEffect(() => () => {
    materials.visible.uniforms.map!.value.dispose();
    materials.visible.dispose(); materials.lighting.dispose(); geometry.dispose();
  }, [materials, geometry]);

  return <mesh geometry={geometry} material={materials.visible} renderOrder={-1000} frustumCulled={false} raycast={() => null} />;
}
