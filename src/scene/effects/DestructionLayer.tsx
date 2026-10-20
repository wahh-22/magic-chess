import { DustBurst } from "./DustBurst";
import { useEffectsStore } from "./effectsStore";

/** Renders every active capture burst. Purely decorative: never touches game state. */
export function DestructionLayer() {
  const bursts = useEffectsStore((state) => state.bursts);
  const removeBurst = useEffectsStore((state) => state.removeBurst);
  return (
    <group>
      {bursts.map((burst) => (
        <DustBurst key={burst.id} burst={burst} onDone={() => removeBurst(burst.id)} />
      ))}
    </group>
  );
}
