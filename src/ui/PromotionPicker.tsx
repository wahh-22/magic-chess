import type { PromotionPiece } from "../core/types";
import { useGameStore } from "./gameStore";

const choices: { piece: PromotionPiece; label: string }[] = [
  { piece: "q", label: "Queen" },
  { piece: "r", label: "Rook" },
  { piece: "b", label: "Bishop" },
  { piece: "n", label: "Knight" },
];

export function PromotionPicker() {
  const pending = useGameStore((state) => state.pendingPromotion);
  const choose = useGameStore((state) => state.choosePromotion);
  const cancel = useGameStore((state) => state.cancelPromotion);
  if (!pending) return null;

  return (
    <div className="promotion-backdrop">
      <section className="promotion-picker" role="dialog" aria-modal="true" aria-labelledby="promotion-title">
        <h2 id="promotion-title">Promote your pawn</h2>
        <div className="promotion-choices">
          {choices.map(({ piece, label }) => (
            <button key={piece} type="button" onClick={() => choose(piece)}>{label}</button>
          ))}
        </div>
        <button className="promotion-cancel" type="button" onClick={cancel}>Cancel</button>
      </section>
    </div>
  );
}
