import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { BufferAttribute, BufferGeometry, CanvasTexture, Color, NormalBlending, ShaderMaterial } from "three";
import { DEFAULT_EFFECTS_CONFIG } from "../../config/effects";
import { createDustParticles, sampleDust } from "./dust";
import type { Burst } from "./effectsStore";

const config = DEFAULT_EFFECTS_CONFIG.dust;

/** Soft round puff drawn once on a canvas; no image assets. */
function puffTexture(): CanvasTexture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.4, "rgba(255,255,255,0.45)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  return new CanvasTexture(canvas);
}

let sharedTexture: CanvasTexture | undefined;

const vertexShader = /* glsl */ `
  attribute float aSize;
  attribute float aOpacity;
  varying float vOpacity;
  uniform float uScale;
  void main() {
    vOpacity = aOpacity;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uColor;
  varying float vOpacity;
  void main() {
    float alpha = texture2D(uMap, gl_PointCoord).a * vOpacity;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(uColor, alpha);
    // uColor is linear (three converts CSS colors); convert back to the output color space.
    #include <colorspace_fragment>
  }
`;

/** One material per burst; also mounted hidden by EffectsWarmup so its program is linked while loading. */
export function createDustMaterial(): ShaderMaterial {
  sharedTexture ??= puffTexture();
  return new ShaderMaterial({
    uniforms: { uMap: { value: sharedTexture }, uColor: { value: new Color(config.color) }, uScale: { value: 600 } },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
  });
}

interface DustBurstProps {
  burst: Burst;
  onDone: () => void;
}

export function DustBurst({ burst, onDone }: DustBurstProps) {
  const particles = useMemo(
    () => createDustParticles(burst.impact.position, burst.impact.direction, burst.seed, config),
    [burst],
  );
  const geometry = useMemo(() => {
    const result = new BufferGeometry();
    result.setAttribute("position", new BufferAttribute(new Float32Array(particles.length * 3), 3));
    result.setAttribute("aSize", new BufferAttribute(new Float32Array(particles.length), 1));
    result.setAttribute("aOpacity", new BufferAttribute(new Float32Array(particles.length), 1));
    return result;
  }, [particles]);
  const material = useMemo(() => createDustMaterial(), []);
  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  const startedAt = useRef<number | undefined>(undefined);
  const finished = useRef(false);

  useFrame(({ clock }) => {
    if (finished.current) return;
    const now = clock.getElapsedTime() * 1000;
    startedAt.current ??= now;
    const elapsed = now - startedAt.current;
    const positions = geometry.getAttribute("position") as BufferAttribute;
    const sizes = geometry.getAttribute("aSize") as BufferAttribute;
    const opacities = geometry.getAttribute("aOpacity") as BufferAttribute;
    particles.forEach((particle, index) => {
      const sample = sampleDust(particle, elapsed, config);
      positions.setXYZ(index, ...sample.position);
      sizes.setX(index, sample.size);
      opacities.setX(index, sample.opacity);
    });
    positions.needsUpdate = sizes.needsUpdate = opacities.needsUpdate = true;
    if (elapsed > config.lifetimeMs + config.maxDelayMs) {
      finished.current = true;
      onDone();
    }
  });

  return <points geometry={geometry} material={material} frustumCulled={false} />;
}
