import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { lazy, Suspense, type ReactNode } from "react";
import { Vector3 } from "three";
import { squareToWorld } from "./coords";
import { Chamber } from "./environment/Chamber";
import { QUALITY_PRESETS, type GraphicsQuality } from "./environment/chamberConfig";

const ChamberPost = lazy(() => import("./environment/ChamberPost").then((module) => ({ default: module.ChamberPost })));

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

/** The chamber is decorative; board coordinates and gameplay remain unchanged. */
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
    <Canvas frameloop={paused ? "demand" : "always"} shadows gl={{ toneMappingExposure: 0.85 }} camera={{ position: [0, 9, 9.5], fov: 50 }} dpr={quality === "low" ? QUALITY_PRESETS.low.dpr : [1, QUALITY_PRESETS.high.dpr]}>
      <Chamber quality={quality} />

      {children}
      {import.meta.env.DEV && <DevFrameCounter />}

      {QUALITY_PRESETS[quality].postprocessing && <Suspense fallback={null}><ChamberPost /></Suspense>}
      <OrbitControls
        makeDefault
        enablePan={false}
        minDistance={7}
        maxDistance={18}
        maxPolarAngle={Math.PI / 2.3}
        target={[0, 0, 0]}
      />
    </Canvas>
  );
}
