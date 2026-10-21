import { Bloom, EffectComposer, N8AO, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";

export function ChamberPost() {
  return (
    <EffectComposer multisampling={0}>
      <N8AO halfRes quality="performance" aoRadius={0.4} intensity={1.1} distanceFalloff={1} />
      <Bloom luminanceThreshold={1.4} intensity={0.25} mipmapBlur />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Vignette offset={0.25} darkness={0.3} />
    </EffectComposer>
  );
}
