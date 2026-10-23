import { MeshStandardMaterial, Vector2, type Texture } from "three";

export interface TerrainLayer { map: Texture; normalMap: Texture; roughnessMap: Texture; tile: number }

/**
 * Ground that blends three CC0 scanned surfaces — dry grass, dirt and gravel — by the
 * terrain's `blend` weights. Transitions are height-blended (the brighter, raised texels of
 * a layer win first), so pebbles poke through soil instead of cross-fading; the grass is
 * also sampled at a second, rotated scale to hide tiling. Vertex colours add macro variation.
 */
export function createTerrainMaterial(grass: TerrainLayer, dirt: TerrainLayer, gravel: TerrainLayer) {
  const material = new MeshStandardMaterial({
    map: grass.map, normalMap: grass.normalMap, roughnessMap: grass.roughnessMap,
    normalScale: new Vector2(0.9, 0.9), vertexColors: true, roughness: 1, metalness: 0, envMapIntensity: 0.45,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      dirtMap: { value: dirt.map }, dirtNormal: { value: dirt.normalMap }, dirtRough: { value: dirt.roughnessMap },
      gravelMap: { value: gravel.map }, gravelNormal: { value: gravel.normalMap }, gravelRough: { value: gravel.roughnessMap },
      tiles: { value: [grass.tile, dirt.tile, gravel.tile] },
    });
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec3 blend;\nvarying vec3 vBlend;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\n  vBlend = blend;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
uniform sampler2D dirtMap;
uniform sampler2D dirtNormal;
uniform sampler2D dirtRough;
uniform sampler2D gravelMap;
uniform sampler2D gravelNormal;
uniform sampler2D gravelRough;
uniform float tiles[ 3 ];
varying vec3 vBlend;
const mat2 TERRAIN_TURN = mat2( 0.83, -0.56, 0.56, 0.83 );`)
      .replace("#include <map_fragment>", `
  vec2 grassUv = vMapUv / tiles[ 0 ];
  vec2 grassUvFar = TERRAIN_TURN * vMapUv / ( tiles[ 0 ] * 3.7 );
  vec2 dirtUv = vMapUv / tiles[ 1 ];
  vec2 gravelUv = vMapUv / tiles[ 2 ];
  vec3 grassColor = mix( texture2D( map, grassUv ).rgb, texture2D( map, grassUvFar ).rgb, 0.45 );
  vec3 dirtColor = texture2D( dirtMap, dirtUv ).rgb;
  vec3 gravelColor = texture2D( gravelMap, gravelUv ).rgb;
  vec3 layerHeight = vec3( dot( grassColor, vec3( 0.33 ) ), dot( dirtColor, vec3( 0.33 ) ), dot( gravelColor, vec3( 0.33 ) ) );
  vec3 weighted = vBlend + layerHeight * 0.6;
  vec3 terrainWeight = max( weighted - ( max( max( weighted.x, weighted.y ), weighted.z ) - 0.18 ), 0.0 );
  terrainWeight /= max( terrainWeight.x + terrainWeight.y + terrainWeight.z, 1e-4 );
  diffuseColor.rgb *= grassColor * terrainWeight.x + dirtColor * terrainWeight.y + gravelColor * terrainWeight.z;`)
      .replace("texture2D( roughnessMap, vRoughnessMapUv )",
        "( texture2D( roughnessMap, grassUv ) * terrainWeight.x + texture2D( dirtRough, dirtUv ) * terrainWeight.y + texture2D( gravelRough, gravelUv ) * terrainWeight.z )")
      .replace("texture2D( normalMap, vNormalMapUv )",
        "( texture2D( normalMap, grassUv ) * terrainWeight.x + texture2D( dirtNormal, dirtUv ) * terrainWeight.y + texture2D( gravelNormal, gravelUv ) * terrainWeight.z )");
  };
  material.customProgramCacheKey = () => "blended-terrain";
  return material;
}
