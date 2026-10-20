import { Physics } from "@react-three/rapier";
import { Suspense } from "react";
import { Debris, DebrisGround } from "./Debris";
import { DustBurst } from "./DustBurst";
import { useEffectsStore } from "./effectsStore";

/** One persistent decorative world; live pieces are deliberately outside Physics. */
export function DestructionLayer() {
  const bursts = useEffectsStore((state) => state.bursts);
  const finishEffect = useEffectsStore((state) => state.finishEffect);
  return (
    <group>
      {bursts.filter((burst) => !burst.dustDone).map((burst) => (
        <DustBurst key={burst.id} burst={burst} onDone={() => finishEffect(burst.id, "dust")} />
      ))}
      <Suspense fallback={null}>
        <Physics timeStep={1 / 60} gravity={[0, -9.81, 0]}>
          <DebrisGround />
          {bursts.filter((burst) => !burst.debrisDone).map((burst) => (
            <Debris key={burst.id} burst={burst} onDone={() => finishEffect(burst.id, "debris")} />
          ))}
        </Physics>
      </Suspense>
    </group>
  );
}
