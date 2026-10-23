import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { AdditiveBlending, BufferAttribute, BufferGeometry, ShaderMaterial, Vector3 } from "three";
import { seededRandom } from "./ruins";
import { sunDirection } from "./battlefieldConfig";

const vertexShader = /* glsl */ `
uniform float time;
uniform float pixelScale;
attribute float seed;
varying float vAlpha;
varying vec3 vView;
void main() {
  vec3 p = position;
  // Slow drift and a gentle rise that wraps, so the volume never empties.
  p.x += sin(time * 0.11 + seed * 37.0) * 0.6;
  p.z += cos(time * 0.09 + seed * 53.0) * 0.6;
  p.y = 0.15 + mod(p.y + time * (0.04 + seed * 0.05), 4.6);
  vec4 world = modelMatrix * vec4(p, 1.0);
  vec4 view = viewMatrix * world;
  vView = normalize(world.xyz - cameraPosition);
  vAlpha = (0.35 + 0.65 * fract(seed * 13.7)) * smoothstep(0.15, 0.7, p.y) * smoothstep(4.75, 3.8, p.y);
  gl_PointSize = pixelScale * (0.02 + 0.03 * fract(seed * 7.1)) / -view.z;
  gl_Position = projectionMatrix * view;
}`;

const fragmentShader = /* glsl */ `
uniform vec3 color;
uniform vec3 sun;
varying float vAlpha;
varying vec3 vView;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float disc = smoothstep(0.5, 0.1, d);
  // Forward scattering: motes glow when the viewer looks toward the low sun.
  float scatter = 0.25 + 3.0 * pow(max(dot(vView, sun), 0.0), 6.0);
  gl_FragColor = vec4(color * disc * vAlpha * scatter, 1.0);
}`;

/** Sunlit dust drifting over the plaza; additive, so it reads as light, never as dirt. */
export function DustMotes({ count }: { count: number }) {
  const geometry = useMemo(() => {
    const random = seededRandom(3);
    const positions = new Float32Array(count * 3), seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions.set([(random() - 0.5) * 22, random() * 4.6, (random() - 0.5) * 22], i * 3);
      seeds[i] = random();
    }
    const result = new BufferGeometry();
    result.setAttribute("position", new BufferAttribute(positions, 3));
    result.setAttribute("seed", new BufferAttribute(seeds, 1));
    return result;
  }, [count]);
  const material = useMemo(() => new ShaderMaterial({
    vertexShader, fragmentShader, transparent: true, depthWrite: false, blending: AdditiveBlending,
    uniforms: {
      time: { value: 0 }, pixelScale: { value: 800 },
      color: { value: new Vector3(1.4, 1.05, 0.7) }, sun: { value: new Vector3(...sunDirection()) },
    },
  }), []);
  const live = useRef<ShaderMaterial>(null);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  useFrame(({ clock, size, viewport }) => {
    const uniforms = live.current?.uniforms;
    if (!uniforms) return;
    uniforms.time!.value = clock.elapsedTime;
    uniforms.pixelScale!.value = size.height * viewport.dpr;
  });
  return <points geometry={geometry} frustumCulled={false} raycast={() => null}>
    <primitive object={material} ref={live} attach="material" />
  </points>;
}
