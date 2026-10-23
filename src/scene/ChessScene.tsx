import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { lazy, Suspense, type ReactNode } from "react";
import { ACESFilmicToneMapping, Vector3 } from "three";
import { squareToWorld } from "./coords";
import { Battlefield } from "./environment/Battlefield";
import { CAMERA_FOV, CAMERA_MAX_DISTANCE, CAMERA_MAX_POLAR, CAMERA_MIN_DISTANCE, CAMERA_TARGET, DEFAULT_CAMERA, QUALITY_PRESETS, type GraphicsQuality } from "./environment/battlefieldConfig";

const BattlefieldPost = lazy(() => import("./environment/BattlefieldPost").then((module) => ({ default: module.BattlefieldPost })));

/**
 * Development-only hooks for browser tests: a frame count (wait for a rendered scene) and
 * a projection of a point above a square to screen pixels (click squares, not fixed pixels).
 */
function DevFrameCounter() {
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

/** The battlefield is decorative; board coordinates and gameplay remain unchanged. */
/**
 * `paused` (e.g. behind the setup menu) renders only when something changes instead of
 * every frame, so the menu stays responsive and the GPU idles on slow hardware.
 */
export function ChessScene({ children, quality = "high", paused = false }: {
  children: ReactNode;
  quality?: GraphicsQuality;
  paused?: boolean;
}) {
  return (
    <Canvas frameloop={paused ? "demand" : "always"} shadows gl={{ toneMapping: ACESFilmicToneMapping, toneMappingExposure: 0.9 }} camera={{ position: DEFAULT_CAMERA, fov: CAMERA_FOV, near: 0.05, far: 1200 }} dpr={quality === "low" ? QUALITY_PRESETS.low.dpr : [1, QUALITY_PRESETS.high.dpr]}>
      <Battlefield quality={quality} />

      {children}
      {import.meta.env.DEV && <DevFrameCounter />}

      {QUALITY_PRESETS[quality].postprocessing && <Suspense fallback={null}><BattlefieldPost godRays={QUALITY_PRESETS[quality].godRays} /></Suspense>}
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
