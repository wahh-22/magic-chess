import type { Material, MeshStandardMaterial } from "three";
import { sunDirection } from "./battlefieldConfig";

/** Shared clock for every swaying material (one uniform object, updated once per frame). */
export const windTime = { value: 0 };

export interface FoliageOptions {
  /** Tip sway as a fraction of the plant's height; it grows with the square of the height above the root. */
  sway: number;
  /** 0 keeps the scanned colour; 1 bleaches it to late-summer straw. */
  dryness?: number;
  /** Strength of the backlit glow when looking toward the sun. */
  translucency?: number;
}

/**
 * Wind for instanced scanned foliage. Instances carry `windRoot` (world root x, y, z and
 * height), so the sway is computed in world space after the instance transform — independent
 * of mesh quantization — and phased by position, so a field ripples instead of pulsing in
 * unison. Optionally bleaches the albedo toward dry straw (late Mediterranean summer).
 */
export function applyFoliage(material: Material, { sway, dryness = 0, translucency = 0.9 }: FoliageOptions) {
  const standard = material as MeshStandardMaterial;
  const sun = sunDirection().map((value) => value.toFixed(4)).join(", ");
  if (standard.userData.foliage) return;
  standard.userData.foliage = true;
  // Only cut-out leaves and blades are thin enough to glow; bark and stems stay opaque.
  const glow = standard.alphaTest > 0 ? translucency : 0;
  standard.onBeforeCompile = (shader) => {
    shader.uniforms.windTime = windTime;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float windTime;\nattribute vec4 windRoot;\nvarying float vDryness;\nvarying vec3 vFoliageWorld;")
      .replace("#include <project_vertex>", `
  vec4 mvPosition = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    mvPosition = instanceMatrix * mvPosition;
    float windPhase = windTime * 1.3 + dot( windRoot.xz, vec2( 0.23, 0.17 ) );
    float windGust = 0.55 + 0.45 * sin( windTime * 0.37 + windRoot.x * 0.05 );
    float windHeight = clamp( ( mvPosition.y - windRoot.y ) / max( windRoot.w, 1e-3 ), 0.0, 1.5 );
    vec2 windBend = vec2( sin( windPhase ) + 0.35 * sin( windPhase * 2.7 + 1.3 ), 0.5 * cos( windPhase * 1.6 + windRoot.z ) );
    mvPosition.xz += windBend * windGust * ${sway.toFixed(4)} * windRoot.w * windHeight * windHeight;
    vFoliageWorld = mvPosition.xyz;
    vDryness = ${dryness.toFixed(3)} * ( 0.65 + 0.35 * sin( dot( windRoot.xz, vec2( 0.71, 0.53 ) ) ) );
  #else
    vDryness = ${dryness.toFixed(3)};
    vFoliageWorld = ( modelMatrix * mvPosition ).xyz;
  #endif
  mvPosition = modelViewMatrix * mvPosition;
  gl_Position = projectionMatrix * mvPosition;`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vDryness;\nvarying vec3 vFoliageWorld;")
      .replace("#include <map_fragment>", `#include <map_fragment>
  float straw = dot( diffuseColor.rgb, vec3( 0.3, 0.59, 0.11 ) );
  diffuseColor.rgb = mix( diffuseColor.rgb, ( 0.22 + straw * 1.1 ) * vec3( 1.0, 0.8, 0.5 ), vDryness );
  #ifdef USE_MAP
    // Keep cut-out coverage in the distance: mip averaging thins alpha below the cutoff,
    // so scale alpha up with the mip level (leaves and blades no longer vanish).
    vec2 foliageTexel = vMapUv * vec2( textureSize( map, 0 ) );
    float foliageMip = max( 0.0, 0.5 * log2( max( dot( dFdx( foliageTexel ), dFdx( foliageTexel ) ), dot( dFdy( foliageTexel ), dFdy( foliageTexel ) ) ) ) );
    diffuseColor.a *= 1.0 + foliageMip * 0.3;
  #endif`)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
  // Leaves and blades are not glossy at this scale; scanned ARM roughness reads as sparkle.
  roughnessFactor = max( roughnessFactor, 0.78 );`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
  // Thin leaves and blades glow when the low sun is behind them (translucency).
  float foliageBack = pow( max( dot( normalize( vFoliageWorld - cameraPosition ), vec3( ${sun} ) ), 0.0 ), 4.0 );
  totalEmissiveRadiance += diffuseColor.rgb * vec3( 1.0, 0.72, 0.42 ) * foliageBack * ${glow.toFixed(3)};`);
  };
  standard.customProgramCacheKey = () => `foliage-${sway}-${dryness}-${glow}`;
  standard.needsUpdate = true;
}

/**
 * Scanned desert boulders are redder than Mediterranean limestone: pull their albedo toward
 * its luminance (and slightly warm grey) without touching the scan's detail, and keep the
 * surface matte.
 */
export function applyStoneTone(material: Material, saturation: number) {
  const standard = material as MeshStandardMaterial;
  if (standard.userData.stoneTone) return;
  standard.userData.stoneTone = true;
  standard.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", `#include <map_fragment>
  float stoneLuma = dot( diffuseColor.rgb, vec3( 0.3, 0.59, 0.11 ) );
  diffuseColor.rgb = mix( stoneLuma * vec3( 1.06, 1.0, 0.9 ), diffuseColor.rgb, ${saturation.toFixed(3)} );`)
      // Dry weathered stone: the scans' glossy patches mirror the blue sky on backlit faces.
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
  roughnessFactor = max( roughnessFactor, 0.72 );`);
  };
  standard.customProgramCacheKey = () => `stone-tone-${saturation}`;
  standard.needsUpdate = true;
}
