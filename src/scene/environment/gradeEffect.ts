import { Effect } from "postprocessing";
import { Uniform, Vector3 } from "three";

const fragmentShader = /* glsl */ `
uniform vec3 shadowTint;
uniform vec3 highlightTint;
uniform float saturation;
uniform float contrast;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 color = inputColor.rgb;
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = mix(vec3(luma), color, saturation);
  // Split toning: teal shadows, warm sunset highlights.
  float highlight = smoothstep(0.08, 0.75, luma);
  color *= mix(shadowTint, highlightTint, highlight);
  color = (color - 0.18) * contrast + 0.18;
  outputColor = vec4(max(color, 0.0), inputColor.a);
}`;

export interface GradeOptions { shadowTint?: [number, number, number]; highlightTint?: [number, number, number]; saturation?: number; contrast?: number }

/** Warm/teal cinematic grade applied after tone mapping. */
export class GradeEffect extends Effect {
  constructor({ shadowTint = [0.9, 1.0, 1.06], highlightTint = [1.07, 1.0, 0.88], saturation = 1.08, contrast = 1.06 }: GradeOptions = {}) {
    super("GradeEffect", fragmentShader, {
      uniforms: new Map<string, Uniform>([
        ["shadowTint", new Uniform(new Vector3(...shadowTint))],
        ["highlightTint", new Uniform(new Vector3(...highlightTint))],
        ["saturation", new Uniform(saturation)],
        ["contrast", new Uniform(contrast)],
      ]),
    });
  }
}
