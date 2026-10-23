import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending, BufferAttribute, DynamicDrawUsage, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, ShaderMaterial,
} from "three";
import type { VfxConfig } from "../../config/vfx";
import { writeEmberInstances, type EmberInstances, type EmberPool } from "./embers";

// One camera-facing quad per particle, stretched along its screen-space velocity:
// fast sparks become short streaks, slow embers stay round. One draw call per pool.
const vertexShader = /* glsl */ `
  attribute vec3 iOffset;
  attribute vec3 iTail;
  attribute vec3 iColor;
  attribute float iSize;
  varying vec3 vColor;
  varying vec2 vUv;
  void main() {
    vec4 head = modelViewMatrix * vec4(iOffset, 1.0);
    vec4 tail = modelViewMatrix * vec4(iOffset - iTail, 1.0);
    vec2 axis = head.xy - tail.xy;
    float len = length(axis);
    vec2 dir = len > 1e-5 ? axis / len : vec2(1.0, 0.0);
    vec2 across = vec2(-dir.y, dir.x);
    // Keep distant sparks about a pixel wide (no shimmer) and conserve their energy.
    float size = max(iSize, -head.z * 0.0024);
    vec4 center = mix(tail, head, 0.5);
    // Streaks narrow as they lengthen, like real sparks.
    center.xy += dir * position.x * (0.5 * len + size) + across * position.y * size * mix(1.0, 0.6, min(1.0, len / (8.0 * size)));
    vUv = position.xy;
    vColor = iColor * (iSize / size);
    gl_Position = projectionMatrix * center;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uBrightness;
  varying vec3 vColor;
  varying vec2 vUv;
  void main() {
    // Tight hot core with a soft rim; brightest at the head of a streak.
    float glow = 1.0 - smoothstep(0.0, 1.0, length(vUv));
    float head = mix(0.35, 1.0, 0.5 + 0.5 * vUv.x);
    gl_FragColor = vec4(vColor * head * uBrightness, glow * glow * glow);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

interface EmberParticlesProps {
  pool: EmberPool;
  config: VfxConfig;
  /** Colour scale for the active quality preset. */
  brightness: number;
  /** Advances the simulation before the frame's instances are written. */
  onFrame: (deltaSeconds: number, timeSeconds: number) => void;
}

/** Additive HDR particles for a fixed-capacity pool; buffers are allocated once. */
export function EmberParticles({ pool, config, brightness, onFrame }: EmberParticlesProps) {
  const { geometry, instances } = useMemo(() => {
    const result = new InstancedBufferGeometry();
    result.setAttribute("position", new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    result.setIndex([0, 1, 2, 0, 2, 3]);
    const arrays: EmberInstances = {
      offset: new Float32Array(pool.capacity * 3), tail: new Float32Array(pool.capacity * 3),
      color: new Float32Array(pool.capacity * 3), size: new Float32Array(pool.capacity),
    };
    const attach = (name: string, array: Float32Array, itemSize: number) =>
      result.setAttribute(name, new InstancedBufferAttribute(array, itemSize).setUsage(DynamicDrawUsage));
    attach("iOffset", arrays.offset, 3);
    attach("iTail", arrays.tail, 3);
    attach("iColor", arrays.color, 3);
    attach("iSize", arrays.size, 1);
    result.instanceCount = 0;
    return { geometry: result, instances: arrays };
  }, [pool]);
  const material = useMemo(() => new ShaderMaterial({
    uniforms: { uBrightness: { value: brightness } },
    vertexShader, fragmentShader, transparent: true, depthWrite: false, blending: AdditiveBlending,
  }), [brightness]);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  const mesh = useRef<Mesh<InstancedBufferGeometry>>(null);

  const lastTime = useRef<number | undefined>(undefined);
  useFrame(({ clock }) => {
    // Step on the scene clock that drives the move plan (a paused clock freezes the
    // sparks too); clamp long frames so particles never tunnel or vanish at once.
    const time = clock.getElapsedTime();
    const delta = Math.min(Math.max(0, time - (lastTime.current ?? time)), 1 / 20);
    lastTime.current = time;
    onFrame(delta, time);
    const count = writeEmberInstances(pool, instances, config);
    const target = mesh.current?.geometry;
    if (!target || (count === 0 && target.instanceCount === 0)) return;
    target.instanceCount = count;
    for (const name of ["iOffset", "iTail", "iColor", "iSize"]) {
      const attribute = target.getAttribute(name) as InstancedBufferAttribute;
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, count * attribute.itemSize);
      attribute.needsUpdate = true;
    }
  });

  return <mesh ref={mesh} geometry={geometry} material={material} frustumCulled={false} renderOrder={3} />;
}
