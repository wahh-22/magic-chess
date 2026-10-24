import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { ACESFilmicToneMapping, Vector3, type WebGLRenderer } from "three";
import { squareToWorld } from "./coords";
import { Battlefield } from "./environment/Battlefield";
import { SceneWarmup } from "./SceneWarmup";
import { CAMERA_FOV, CAMERA_MAX_DISTANCE, CAMERA_MAX_POLAR, CAMERA_MIN_DISTANCE, CAMERA_TARGET, DEFAULT_CAMERA, QUALITY_PRESETS, type GraphicsQuality } from "./environment/battlefieldConfig";

const BattlefieldPost = lazy(() => import("./environment/BattlefieldPost").then((module) => ({ default: module.BattlefieldPost })));

/**
 * Development-only hooks for browser tests: a frame count (wait for a rendered scene) and
 * a projection of a point above a square to screen pixels (click squares, not fixed pixels).
 */
function DevFrameCounter() {
  const gl = useThree((state) => state.gl);
  // Program count and GPU memory for scripts/perf/longtasks.mjs.
  useEffect(() => { Object.assign(globalThis, { __renderer: gl }); }, [gl]);
  useFrame(({ camera, size }) => {
    const scope = globalThis as {
      __frames?: number;
      __projectSquare?: (square: string, height?: number) => [number, number];
    };
    scope.__frames = (scope.__frames ?? 0) + 1;
    // height 0 = the square itself; ~0.75 = the upper body of a piece standing on it.
    scope.__projectSquare = (square, height = 0) => {
      const [x, z] = squareToWorld(square);
      const point = new Vector3(x, height, z).project(camera);
      return [((point.x + 1) / 2) * size.width, ((1 - point.y) / 2) * size.height];
    };
  });
  return null;
}

/** Extensions three.js and the post stack query lazily; each first query is a blocking round trip to the GPU process. */
const LAZY_EXTENSIONS = [
  "EXT_color_buffer_float", "EXT_color_buffer_half_float", "EXT_float_blend", "OES_texture_float_linear",
  "EXT_texture_filter_anisotropic", "EXT_clip_control", "EXT_texture_norm16", "WEBGL_multi_draw",
  "WEBGL_multisampled_render_to_texture", "WEBGL_clip_cull_distance", "WEBGL_debug_renderer_info",
];

/** Enables them while the context is created (already one long task) instead of during loading. */
function warmExtensions(gl: WebGLRenderingContext | WebGL2RenderingContext) {
  for (const name of LAZY_EXTENSIONS) gl.getExtension(name);
}

/**
 * The battlefield is decorative; board coordinates and gameplay remain unchanged.
 *
 * Everything in the critical set (battlefield, `children`, post-processing) sits in one
 * Suspense boundary ending in SceneWarmup, so the warm-up starts once all of it is mounted.
 * `frameloop` is "never" until the warm-up finishes (no frame may compile shaders or upload
 * textures in one go), "demand" behind the setup menu, "always" in play.
 */
export function ChessScene({ children, quality = "high", frameloop = "always", secondary = true, warmPass = quality, onCreated }: {
  children: ReactNode;
  /** The WebGL renderer exists (creating its context is one long, unsplittable task in software GL). */
  onCreated?: (gl: WebGLRenderer) => void;
  quality?: GraphicsQuality;
  frameloop?: "never" | "demand" | "always";
  /** Stream the secondary set (scanned nature) in. */
  secondary?: boolean;
  /** Names the warm-up round (a new value prepares the scene again). */
  warmPass?: string;
}) {
  const postprocessing = QUALITY_PRESETS[quality].postprocessing;
  return (
    // PCF explicitly: three r186 replaces PCFSoft (R3F's default) by PCF at the first shadow render,
    // which would recompile every program warmed before it.
    <Canvas onCreated={({ gl }) => { warmExtensions(gl.getContext()); onCreated?.(gl); }} frameloop={frameloop} shadows="percentage" gl={{ toneMapping: ACESFilmicToneMapping, toneMappingExposure: 0.9 }} camera={{ position: DEFAULT_CAMERA, fov: CAMERA_FOV, near: 0.05, far: 1200 }} dpr={quality === "low" ? QUALITY_PRESETS.low.dpr : [1, QUALITY_PRESETS.high.dpr]}>
      <Suspense fallback={null}>
        <Battlefield quality={quality} secondary={secondary} />
        {children}
        {postprocessing && <BattlefieldPost godRays={QUALITY_PRESETS[quality].godRays} />}
        <SceneWarmup postprocessing={postprocessing} pass={warmPass} />
      </Suspense>
      {import.meta.env.DEV && <DevFrameCounter />}
      <OrbitControls
        makeDefault
        enablePan={false}
        minDistance={CAMERA_MIN_DISTANCE}
        maxDistance={CAMERA_MAX_DISTANCE}
        maxPolarAngle={CAMERA_MAX_POLAR}
        target={CAMERA_TARGET}
      />
    </Canvas>
  );
}
