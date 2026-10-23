import type { Material } from "three";

export interface RevealUniform { value: number }

/**
 * Screen-door dissolve for content that streams in after the scene is shown: fragments
 * appear in a stable dither pattern as `reveal.value` goes 0 → 1. A uniform (not opacity or
 * transparency) drives it, so the fade never recompiles a program.
 */
export function applyReveal(material: Material, reveal: RevealUniform) {
  if (material.userData.reveal) return;
  material.userData.reveal = true;
  const previous = material.onBeforeCompile.bind(material);
  const previousKey = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer);
    shader.uniforms.revealAmount = reveal;
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float revealAmount;")
      .replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>
  if ( revealAmount < 1.0 && fract( sin( dot( floor( gl_FragCoord.xy ), vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ) >= revealAmount ) discard;`);
  };
  material.customProgramCacheKey = () => `${previousKey()}|reveal`;
  material.needsUpdate = true;
}
