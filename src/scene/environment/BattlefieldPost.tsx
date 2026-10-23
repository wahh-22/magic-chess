import { useFrame } from "@react-three/fiber";
import { Bloom, DepthOfField, EffectComposer, GodRays, N8AO, ToneMapping, Vignette, wrapEffect } from "@react-three/postprocessing";
import { type DepthOfFieldEffect, ToneMappingMode } from "postprocessing";
import { useEffect, useMemo, useRef } from "react";
import { Mesh, MeshBasicMaterial, SphereGeometry, Vector3 } from "three";
import { SKY, sunDirection } from "./battlefieldConfig";
import { cinematicFocus } from "../camera/cinematicFocus";
import { GradeEffect } from "./gradeEffect";

const Grade = wrapEffect(GradeEffect);
// Play view: everything from the near rank to the colonnade stays sharp; only the hills soften.
const PLAY_FOCUS_RANGE = 26;
const PLAY_BOKEH = 1.2;
// Cinematic close shots: a shallow band around the impact.
const SHOT_FOCUS_RANGE = 3.2;
const SHOT_BOKEH = 4;

const SUN_DISTANCE = 600;
const SUN_RADIUS = 26;

/**
 * Occlusion source for the light shafts: a disc where the sky's sun is. It is never added
 * to the scene (the HDRI already draws the sun); the god-rays pass renders it on its own
 * against the scene depth, so columns, the entablature and the trees cut it into shafts.
 */
function useSunSource() {
  const sun = useMemo(() => {
    const mesh = new Mesh(new SphereGeometry(SUN_RADIUS, 24, 12), new MeshBasicMaterial({ color: "#ffd2a0", transparent: true, depthWrite: false, fog: false }));
    mesh.position.fromArray(sunDirection(SKY.sunElevationDeg)).multiplyScalar(SUN_DISTANCE);
    mesh.frustumCulled = false;
    return mesh;
  }, []);
  useEffect(() => () => { sun.geometry.dispose(); (sun.material as MeshBasicMaterial).dispose(); }, [sun]);
  return sun;
}

/** High-preset post stack: AO, depth of field, god rays, bloom, filmic tone mapping, grade, vignette. */
export function BattlefieldPost({ godRays = true }: { godRays?: boolean }) {
  const sun = useSunSource();
  const depthOfField = useRef<DepthOfFieldEffect>(null);
  const focus = useRef(new Vector3());
  const shotFocus = useRef(new Vector3());
  useFrame(({ controls }) => {
    const effect = depthOfField.current;
    if (!effect) return;
    const amount = cinematicFocus.amount;
    // SAFETY: ChessScene installs OrbitControls with makeDefault; its target is the play focus.
    const orbitTarget = (controls as unknown as { target?: Vector3 } | null)?.target;
    if (orbitTarget) focus.current.copy(orbitTarget);
    if (amount > 0) focus.current.lerp(shotFocus.current.fromArray(cinematicFocus.target), amount);
    effect.target = focus.current;
    effect.cocMaterial.focusRange = PLAY_FOCUS_RANGE + (SHOT_FOCUS_RANGE - PLAY_FOCUS_RANGE) * amount;
    effect.bokehScale = PLAY_BOKEH + (SHOT_BOKEH - PLAY_BOKEH) * amount;
  });
  return (
    <EffectComposer multisampling={0} autoClear={false}>
      <N8AO halfRes quality="performance" aoRadius={0.9} intensity={2.2} distanceFalloff={0.8} />
      <DepthOfField ref={depthOfField} focusDistance={13} focusRange={PLAY_FOCUS_RANGE} bokehScale={PLAY_BOKEH} />
      {godRays && <GodRays sun={sun} samples={48} density={0.92} decay={0.94} weight={0.42} exposure={0.32} clampMax={1} blur />}
      <Bloom luminanceThreshold={4} luminanceSmoothing={0.5} intensity={0.35} mipmapBlur radius={0.7} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Grade />
      <Vignette offset={0.32} darkness={0.5} />
    </EffectComposer>
  );
}
