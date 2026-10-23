import type { PromotionPiece } from "../core/types";
import { useGameStore } from "./gameStore";
import { PieceGlyph } from "./Heraldry";

const choices: { piece: PromotionPiece; label: string }[] = [
  { piece: "q", label: "Queen" },
  { piece: "r", label: "Rook" },
  { piece: "b", label: "Bishop" },
  { piece: "n", label: "Knight" },
];

export function PromotionPicker() {
  const pending = useGameStore((state) => state.pendingPromotion);
  const color = useGameStore((state) => state.game.turn());
  const choose = useGameStore((state) => state.choosePromotion);
  const cancel = useGameStore((state) => state.cancelPromotion);
  if (!pending) return null;

  return (
    <div className="modal-backdrop promotion-backdrop">
      <section className="arcana-panel promotion-picker" role="dialog" aria-modal="true" aria-labelledby="promotion-title">
        <h2 id="promotion-title">Promote your pawn</h2>
        <div className="promotion-choices">
          {choices.map(({ piece, label }) => (
            <button key={piece} type="button" onClick={() => choose(piece)}>
              <PieceGlyph type={piece} color={color} />
              <span>{label}</span>
            </button>
          ))}
        </div>
        <button className="promotion-cancel" type="button" onClick={cancel}>Cancel</button>
      </section>
    </div>
  );
}
