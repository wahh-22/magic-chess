import {
  AdditiveBlending, BufferAttribute, Color, DataTexture, DoubleSide, Fog, Group, HalfFloatType, InstancedBufferAttribute, InstancedBufferGeometry,
  Mesh, MeshBasicMaterial, MeshStandardMaterial, NoToneMapping, PCFShadowMap, PerspectiveCamera, PlaneGeometry, PMREMGenerator,
  Scene, ShaderMaterial, SpotLight, SRGBColorSpace, Uniform, Vector2, Vector3, WebGLRenderer, type Texture,
} from "three";
import { BloomEffect, DepthOfFieldEffect, Effect, EffectComposer, EffectPass, RenderPass, ToneMappingEffect, ToneMappingMode, VignetteEffect } from "postprocessing";
import { GradeEffect } from "../../scene/environment/gradeEffect";
import { loadPieceModels } from "../../scene/pieces/gltfPieces";
import { createRigPlayback } from "../../scene/pieces/rigPlayback";
import type { PieceModelProvider } from "../../scene/pieces/PieceModelProvider";
import type { BackdropGlow, EmberCloud, Shot, ShotPiece } from "./shots";

/** Deterministic PRNG (mulberry32): the same seed always renders the same embers. */
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Reflections for the metallic ARCANA materials: a black room with a warm softbox on +x, a
 * cool one on -x and a faint top strip. Without it the armour renders black in the dark.
 */
function studioEnvironment(renderer: WebGLRenderer, warm: number, cool: number): Texture {
  const room = new Scene();
  room.background = new Color(0);
  const panel = (color: string, intensity: number, position: [number, number, number], width: number, height: number) => {
    const mesh = new Mesh(new PlaneGeometry(width, height), new MeshBasicMaterial({ color: new Color(color).multiplyScalar(intensity), side: DoubleSide }));
    mesh.position.set(...position);
    mesh.lookAt(0, position[1] * 0.3, 0);
    room.add(mesh);
  };
  panel("#ffb066", 3 * warm, [7, 3, -3], 4, 7);
  panel("#ffd2a0", 0.8 * warm, [3, 2, 7], 3, 3);
  panel("#86a8ff", 2.4 * cool, [-7, 3, -3], 4, 7);
  panel("#c8d4ff", 0.35, [0, 9, 0], 10, 2);
  const generator = new PMREMGenerator(renderer);
  const texture = generator.fromScene(room, 0.03).texture;
  generator.dispose();
  return texture;
}

const backdropVertex = /* glsl */ `
  void main() { gl_Position = vec4(position.xy, 1.0, 1.0); }
`;
const backdropFragment = /* glsl */ `
  uniform vec2 uResolution;
  uniform vec3 uColor[4];
  uniform vec3 uGlow[4];
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float smoke(vec2 p) {
    float value = 0.0, amplitude = 0.5;
    for (int i = 0; i < 5; i++) { value += amplitude * noise(p); p = p * 2.03 + vec2(1.7, -0.6); amplitude *= 0.5; }
    return value;
  }
  void main() {
    vec2 uv = gl_FragCoord.xy / uResolution;
    vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
    // Smoke drifts upward: stretch the noise vertically.
    float density = smoothstep(0.25, 0.85, smoke(uv * aspect * vec2(2.2, 1.3) + vec2(0.0, 3.0)));
    vec3 color = vec3(0.0);
    for (int i = 0; i < 4; i++) {
      float d = length((uv - uGlow[i].xy) * aspect) / max(uGlow[i].z, 1e-4);
      color += uColor[i] * exp(-d * d * 2.2) * (0.45 + 0.9 * density);
    }
    gl_FragColor = vec4(color, 1.0);
  }
`;

/** Lit smoke far behind the subject: screen-space glows modulated by fbm noise. */
function backdrop(glows: BackdropGlow[], resolution: Vector2) {
  const colors = Array.from({ length: 4 }, (_, i) => glows[i] ? new Color(glows[i].color).multiplyScalar(glows[i].intensity) : new Color(0));
  const shape = Array.from({ length: 4 }, (_, i) => glows[i] ? new Vector3(...glows[i].uv, glows[i].radius) : new Vector3(0, 0, 1));
  const mesh = new Mesh(new PlaneGeometry(2, 2), new ShaderMaterial({
    uniforms: { uResolution: { value: resolution }, uColor: { value: colors }, uGlow: { value: shape } },
    vertexShader: backdropVertex, fragmentShader: backdropFragment, depthWrite: false, depthTest: false,
  }));
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}

// Camera-facing quads stretched along the drift, like the capture sparks (EmberParticles),
// but they write depth (with a hard cut-out) so depth of field turns far and near ones into bokeh.
const emberVertex = /* glsl */ `
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
    float size = max(iSize, -head.z * 0.0011);
    vec4 center = mix(tail, head, 0.5);
    center.xy += dir * position.x * (0.5 * len + size) + across * position.y * size;
    vUv = position.xy;
    vColor = iColor * (iSize / size);
    gl_Position = projectionMatrix * center;
  }
`;
const emberFragment = /* glsl */ `
  varying vec3 vColor;
  varying vec2 vUv;
  void main() {
    float glow = 1.0 - smoothstep(0.0, 1.0, length(vUv));
    if (glow < 0.04) discard;
    float head = mix(0.4, 1.0, 0.5 + 0.5 * vUv.x);
    gl_FragColor = vec4(vColor * head * glow * glow, 1.0);
  }
`;

/** Floating embers and a few fast sparks, all rising with the heat. */
function embers({ seed, count, center, extent, drift, scale = 1 }: EmberCloud) {
  const next = random(seed);
  const offset = new Float32Array(count * 3), tail = new Float32Array(count * 3), color = new Float32Array(count * 3), size = new Float32Array(count);
  const hot = new Color("#ffd27a"), warm = new Color("#ff7a1e"), cool = new Color("#c2300a");
  const tint = new Color();
  for (let i = 0; i < count; i++) {
    for (let axis = 0; axis < 3; axis++) offset[i * 3 + axis] = center[axis]! + (next() - 0.5) * extent[axis]!;
    // Embers are denser low and thin out as they rise.
    offset[i * 3 + 1] = center[1] - extent[1] / 2 + extent[1] * Math.pow(next(), 1.4);
    // Foreground bokeh stays round: a streak would read as a scratch on the lens.
    const spark = next() < 0.12 && scale === 1;
    const heat = spark ? 0.7 + next() * 0.3 : next();
    tint.copy(cool).lerp(warm, Math.min(1, heat * 1.6)).lerp(hot, Math.max(0, heat - 0.6) * 2.5).multiplyScalar((spark ? 9 : 3) + heat * 9);
    color.set([tint.r, tint.g, tint.b], i * 3);
    size[i] = (spark ? 0.0016 + next() * 0.0012 : 0.0016 + next() * 0.0034) * scale;
    const streak = spark ? 0.05 + next() * 0.09 : 0.004 + next() * 0.012;
    const sway = (next() - 0.5) * 0.8;
    tail.set([(drift[0] + sway) * streak, drift[1] * streak, (drift[2] + sway * 0.5) * streak], i * 3);
  }
  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.setAttribute("iOffset", new InstancedBufferAttribute(offset, 3));
  geometry.setAttribute("iTail", new InstancedBufferAttribute(tail, 3));
  geometry.setAttribute("iColor", new InstancedBufferAttribute(color, 3));
  geometry.setAttribute("iSize", new InstancedBufferAttribute(size, 1));
  geometry.instanceCount = count;
  const mesh = new Mesh(geometry, new ShaderMaterial({ vertexShader: emberVertex, fragmentShader: emberFragment, blending: AdditiveBlending, transparent: true, depthWrite: true }));
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  return mesh;
}

const shadeFragment = /* glsl */ `
  uniform vec2 uSide;
  uniform float uReach;
  uniform float uStrength;
  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    // 0 at the darkened edge, 1 beyond the reach.
    float t = dot(uv, uSide);
    float shade = mix(1.0 - uStrength, 1.0, smoothstep(0.0, uReach, t));
    outputColor = vec4(inputColor.rgb * shade * shade, inputColor.a);
  }
`;

/** Darkens one screen edge so UI (menu panel, loading text) reads on black. */
class ShadeEffect extends Effect {
  constructor({ side, reach, strength }: NonNullable<Shot["shade"]>) {
    super("ShadeEffect", shadeFragment, {
      uniforms: new Map<string, Uniform>([
        ["uSide", new Uniform(side === "left" ? new Vector2(1, 0) : new Vector2(0, 1))],
        ["uReach", new Uniform(reach)],
        ["uStrength", new Uniform(strength)],
      ]),
    });
  }
}

/** White centre fading to black at the rim (smoothstep): the floor alpha, so light pools and highlights fade too. */
function radialFade(size = 256): Texture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.min(1, Math.hypot(x / (size - 1) - 0.5, y / (size - 1) - 0.5) * 2);
      const t = 1 - r * r * (3 - 2 * r);
      data.set([255 * t, 255 * t, 255 * t, 255], (y * size + x) * 4);
    }
  }
  const texture = new DataTexture(data, size, size);
  texture.needsUpdate = true;
  return texture;
}

function placePiece(models: PieceModelProvider, piece: ShotPiece): Group {
  const group = new Group();
  group.position.set(piece.at[0], 0, piece.at[1]);
  // Models face +x: yaw turns +x toward the target point.
  group.rotation.y = Math.atan2(-(piece.face[1] - piece.at[1]), piece.face[0] - piece.at[0]);
  const rig = models.rig?.(piece.type, piece.color);
  if (rig) {
    const playback = createRigPlayback(rig, models.material(piece.type, piece.color));
    const pose = piece.pose ?? { role: "idle" as const, timeMs: 0 };
    // A one-second step completes the cross-fade, then the clip is sampled at `timeMs`.
    playback.update(1, { ...pose, hitMs: Number.POSITIVE_INFINITY });
    group.add(playback.scene);
    if (piece.pedestal && rig.pedestal) group.add(rig.pedestal.object.clone(true));
  } else {
    group.add(new Mesh(models.geometry(piece.type, piece.color), models.material(piece.type, piece.color)));
  }
  group.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    // The shared material library's swatches have no normals, so GLTFLoader hands out
    // flat-shading clones; the key art uses the models' authored vertex normals instead.
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material instanceof MeshStandardMaterial && material.flatShading) { material.flatShading = false; material.needsUpdate = true; }
    }
    object.castShadow = object.receiveShadow = true;
    object.frustumCulled = false;
  });
  return group;
}

/**
 * Builds and renders one composition; resolves after the frame has reached the canvas.
 * `supersampling` scales pixel-sized parameters (bokeh) so a larger frame, downsized
 * afterwards, keeps the look of a 1:1 render.
 */
export async function renderShot(shot: Shot, canvas: HTMLCanvasElement, width: number, height: number, supersampling = 1) {
  const renderer = new WebGLRenderer({ canvas, antialias: false, stencil: false, depth: false, preserveDrawingBuffer: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NoToneMapping; // ACES runs in the post stack, after bloom.
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;

  const scene = new Scene();
  scene.background = new Color(0);
  scene.fog = new Fog(0x000000, shot.fog[0], shot.fog[1]);
  scene.environment = studioEnvironment(renderer, shot.environment.warm, shot.environment.cool);
  scene.environmentIntensity = shot.environment.intensity;

  const camera = new PerspectiveCamera(shot.camera.fov, width / height, 0.05, 60);
  camera.position.set(...shot.camera.position);
  camera.lookAt(...shot.camera.target);
  scene.add(camera);
  scene.add(backdrop(shot.backdrop, new Vector2(width, height)));

  const floor = new Mesh(new PlaneGeometry(2, 2), new MeshStandardMaterial({ color: "#0a0908", alphaMap: radialFade(), transparent: true, roughness: 0.7, metalness: 0, envMapIntensity: 0.1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(shot.floor.center[0], 0, shot.floor.center[1]);
  floor.scale.setScalar(shot.floor.radius);
  floor.receiveShadow = true;
  floor.renderOrder = -0.5;
  scene.add(floor);

  for (const light of shot.lights) {
    const spot = new SpotLight(light.color, light.intensity, 0, (light.angle * Math.PI) / 180, light.penumbra ?? 0.6, 2);
    spot.position.set(...light.position);
    spot.target.position.set(...light.target);
    if (light.shadow) {
      spot.castShadow = true;
      spot.shadow.mapSize.set(2048, 2048);
      spot.shadow.bias = -0.0002;
      spot.shadow.normalBias = 0.012;
      spot.shadow.radius = 3;
      spot.shadow.camera.near = 0.5;
      spot.shadow.camera.far = 12;
    }
    scene.add(spot, spot.target);
  }

  // Key art must show the ARCANA models: any procedural fallback fails the render.
  const failures: string[] = [];
  const models = await loadPieceModels({ warn: (message, error) => failures.push(`${message}: ${String(error)}`) });
  if (failures.length || !models.rig) throw new Error(`ARCANA models unavailable: ${failures.join("; ") || "procedural fallback"}`);
  for (const piece of shot.pieces) scene.add(placePiece(models, piece));
  for (const cloud of shot.embers) scene.add(embers(cloud));

  const composer = new EffectComposer(renderer, { frameBufferType: HalfFloatType, multisampling: 4 });
  composer.setSize(width, height);
  composer.addPass(new RenderPass(scene, camera));
  const depthOfField = new DepthOfFieldEffect(camera, { focusRange: shot.focus.range, bokehScale: shot.focus.bokeh * supersampling, resolutionScale: 1 });
  depthOfField.target = new Vector3(...shot.focus.target);
  composer.addPass(new EffectPass(camera, depthOfField));
  const finish = new EffectPass(camera,
    new BloomEffect({ luminanceThreshold: 1.1, luminanceSmoothing: 0.4, intensity: 0.9, mipmapBlur: true, radius: 0.75 }),
    new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }),
    new GradeEffect({ shadowTint: [0.86, 0.96, 1.1], highlightTint: [1.08, 0.99, 0.86], saturation: 1.05, contrast: 1.08 }),
    ...(shot.shade ? [new ShadeEffect(shot.shade)] : []),
    new VignetteEffect({ offset: 0.28, darkness: shot.vignette }),
  );
  finish.dithering = true;
  composer.addPass(finish);

  await renderer.compileAsync(scene, camera);
  // Two frames: the first one also builds shadow maps and the depth-of-field targets.
  composer.render();
  composer.render();
  const gl = renderer.getContext();
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
}
