import { ShaderChunk } from "three";
import { PLAZA_Y, sunDirection } from "./battlefieldConfig";

/** Ground haze: optical depth per unit at the plaza, decaying with height. */
export const HEIGHT_FOG = { density: 0.0065, falloff: 0.28, baseY: PLAZA_Y, startDistance: 14, sunColor: [1, 0.7, 0.42] as const } as const;

/**
 * Optical depth of exponential height fog along a ray (closed-form integral of
 * density · e^(-falloff · (y - base)) from the eye to the point).
 */
export function heightFogDepth(eyeY: number, deltaY: number, distance: number, fog = HEIGHT_FOG): number {
  const start = fog.density * Math.exp(-fog.falloff * (eyeY - fog.baseY));
  const climb = fog.falloff * deltaY;
  const integral = Math.abs(climb) > 1e-4 ? (1 - Math.exp(-climb)) / climb : 1;
  return start * distance * integral;
}

const glslFloat = (value: number) => (Number.isInteger(value) ? value.toFixed(1) : String(value));

let installed = false;

/**
 * Upgrades three's scene fog for every lit material: the existing exponential distance fog
 * plus a ground-hugging height fog, tinted toward the sun when looking into the sunset. The
 * vertex stage recovers the world position from the view-space position every fog-enabled
 * shader already computes, so instanced, skinned and custom shaders all keep working.
 */
export function installHeightFog() {
  if (installed) return;
  installed = true;
  const [sx, sy, sz] = sunDirection();
  const { density, falloff, baseY, startDistance, sunColor } = HEIGHT_FOG;
  ShaderChunk.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogWorld;
#endif`;
  ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  // The view matrix is rigid: world = R^T (view - t).
  vFogWorld = transpose( mat3( viewMatrix ) ) * ( mvPosition.xyz - viewMatrix[ 3 ].xyz );
#endif`;
  ShaderChunk.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogWorld;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif`;
  ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogDepth = fogDensity * fogDensity * vFogDepth * vFogDepth;
  #else
    float fogDepth = - log( 1.0 - smoothstep( fogNear, fogFar, vFogDepth ) * 0.999 );
  #endif
  vec3 fogRay = vFogWorld - cameraPosition;
  float fogDistance = length( fogRay );
  vec3 fogDirection = fogRay / max( fogDistance, 1e-4 );
  float fogClimb = ${glslFloat(falloff)} * fogRay.y;
  float fogIntegral = abs( fogClimb ) > 1e-4 ? ( 1.0 - exp( - fogClimb ) ) / fogClimb : 1.0;
  fogDepth += ${glslFloat(density)} * exp( - ${glslFloat(falloff)} * ( cameraPosition.y - ${glslFloat(baseY)} ) ) * fogDistance * fogIntegral
    * smoothstep( ${glslFloat(startDistance)}, ${glslFloat(startDistance * 2.5)}, fogDistance );
  float fogFactor = 1.0 - exp( - fogDepth );
  float fogSun = pow( max( dot( fogDirection, vec3( ${glslFloat(sx)}, ${glslFloat(sy)}, ${glslFloat(sz)} ) ), 0.0 ), 6.0 );
  vec3 fogTint = mix( fogColor, fogColor * vec3( ${sunColor.map(glslFloat).join(", ")} ) * 1.9, fogSun );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogTint, fogFactor );
#endif`;
}
