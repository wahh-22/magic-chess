import { MeshStandardMaterial, type MeshStandardMaterialParameters, type Texture } from "three";

export interface TriplanarMaps { map: Texture; normalMap: Texture; roughnessMap: Texture }

/**
 * Stone without UVs: the CC0 scan textures are projected along the three world axes and
 * blended by the surface normal, so chipped blocks and fluted drums never show stretched
 * or seamed texture. Albedo is multiplied by the baked weathering vertex colours.
 */
export function createTriplanarStone(maps: TriplanarMaps, scale: number, saturation = 1, parameters: MeshStandardMaterialParameters = {}) {
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, ...parameters });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.triMap = { value: maps.map };
    shader.uniforms.triNormalMap = { value: maps.normalMap };
    shader.uniforms.triRoughnessMap = { value: maps.roughnessMap };
    shader.uniforms.triScale = { value: scale };
    shader.uniforms.triSaturation = { value: saturation };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vTriPosition;\nvarying vec3 vTriNormal;")
      .replace("#include <worldpos_vertex>", `#include <worldpos_vertex>
  vTriPosition = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
  vTriNormal = normalize( mat3( modelMatrix ) * objectNormal );`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
uniform sampler2D triMap;
uniform sampler2D triNormalMap;
uniform sampler2D triRoughnessMap;
uniform float triScale;
uniform float triSaturation;
varying vec3 vTriPosition;
varying vec3 vTriNormal;
vec3 triWeights() {
  vec3 w = pow( abs( normalize( vTriNormal ) ), vec3( 4.0 ) );
  return w / ( w.x + w.y + w.z );
}
vec4 triSample( sampler2D tex ) {
  vec3 w = triWeights();
  vec3 p = vTriPosition * triScale;
  return texture2D( tex, p.zy ) * w.x + texture2D( tex, p.xz ) * w.y + texture2D( tex, p.xy ) * w.z;
}
// Whiteout-blended tangent normals swizzled into world space per projection axis.
vec3 triNormal() {
  vec3 n = normalize( vTriNormal );
  vec3 w = triWeights();
  vec3 p = vTriPosition * triScale;
  vec3 tx = texture2D( triNormalMap, p.zy ).xyz * 2.0 - 1.0;
  vec3 ty = texture2D( triNormalMap, p.xz ).xyz * 2.0 - 1.0;
  vec3 tz = texture2D( triNormalMap, p.xy ).xyz * 2.0 - 1.0;
  tx = vec3( tx.xy + n.zy, abs( tx.z ) * n.x );
  ty = vec3( ty.xy + n.xz, abs( ty.z ) * n.y );
  tz = vec3( tz.xy + n.xy, abs( tz.z ) * n.z );
  return normalize( tx.zyx * w.x + ty.xzy * w.y + tz.xyz * w.z );
}`)
      .replace("#include <map_fragment>", `
  vec3 stoneAlbedo = triSample( triMap ).rgb;
  // The scan is a sandy rock; limestone weathers paler and greyer.
  stoneAlbedo = mix( vec3( dot( stoneAlbedo, vec3( 0.3, 0.59, 0.11 ) ) ), stoneAlbedo, triSaturation );
  diffuseColor.rgb *= stoneAlbedo;`)
      .replace("#include <roughnessmap_fragment>", "float roughnessFactor = roughness * triSample( triRoughnessMap ).g;")
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
  normal = normalize( ( viewMatrix * vec4( mix( normalize( vTriNormal ), triNormal(), 0.85 ), 0.0 ) ).xyz );`);
  };
  material.customProgramCacheKey = () => "triplanar-stone";
  return material;
}
