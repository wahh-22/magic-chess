import { ContactShadows, Environment, Lightformer, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import type { ReactNode } from "react";
import { Vector3 } from "three";
import { squareToWorld } from "./coords";

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

/** Dark hall lit by one warm key light, like a stage. No network assets. */
export function ChessScene({ children }: { children: ReactNode }) {
  return (
    <Canvas shadows camera={{ position: [0, 9, 9.5], fov: 42 }} dpr={[1, 2]}>
      <color attach="background" args={["#0b0b0f"]} />
      <fog attach="fog" args={["#0b0b0f", 16, 34]} />

      <hemisphereLight args={["#b9c4d6", "#1a1410", 0.35]} />
      <directionalLight
        position={[6, 12, 5]}
        intensity={2.4}
        color="#ffe8c8"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-7}
        shadow-camera-right={7}
        shadow-camera-top={7}
        shadow-camera-bottom={-7}
        shadow-bias={-0.0004}
      />
      <spotLight position={[-8, 7, -6]} angle={0.5} penumbra={0.8} intensity={30} color="#8fa7ff" />

      <Environment resolution={256}>
        <Lightformer intensity={1.5} position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[10, 10, 1]} />
        <Lightformer intensity={0.6} color="#ffd9a8" position={[8, 2, 0]} rotation-y={-Math.PI / 2} scale={[6, 3, 1]} />
        <Lightformer intensity={0.4} color="#9fb4ff" position={[-8, 2, 0]} rotation-y={Math.PI / 2} scale={[6, 3, 1]} />
      </Environment>

      {children}
      {import.meta.env.DEV && <DevFrameCounter />}

      <ContactShadows position={[0, -0.33, 0]} scale={14} blur={2.5} opacity={0.6} far={2} />
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
