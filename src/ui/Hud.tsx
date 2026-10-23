import { useEffect, useRef, useState } from "react";
import { formatTime, remainingAt } from "../core/clock";
import { exportPgn } from "../core/pgn";
import { DIFFICULTIES } from "../core/engine/difficulty";
import type { Color } from "../core/types";
import { canUndo, useGameStore } from "./gameStore";
import { Emblem, PieceGlyph } from "./Heraldry";
import {
  capturedBy, describeCaptured, hudBanner, isLowTime, materialBalance, moveColumns, plateSides, playerName,
  type MoveEntry,
} from "./hudModel";
import { describeError, isEngineError, statusLabel } from "./messages";

const opponent = (color: Color): Color => color === "w" ? "b" : "w";
const sideName = (color: Color) => color === "w" ? "White" : "Black";

function PlayerPlate({ color, align }: { color: Color; align: "left" | "right" }) {
  const settings = useGameStore((state) => state.settings);
  const pieces = useGameStore((state) => state.displayedPieces);
  const toMove = useGameStore((state) => state.phase === "playing" && state.game.turn() === color);
  const captured = capturedBy(pieces, color);
  const balance = materialBalance(pieces) * (color === "w" ? 1 : -1);
  const name = playerName(settings, color);
  return (
    <section className={`player-plate player-plate-${align}${toMove ? " to-move" : ""}`}
      aria-label={`${sideName(color)}: ${name}`} aria-current={toMove ? "step" : undefined}>
      <Emblem color={color} />
      <div className="player-text">
        <p className="player-name">{name}</p>
        <p className="player-captures" aria-label={describeCaptured(captured) + (balance > 0 ? `, material +${balance}` : "")}>
          {captured.map((type, index) => <PieceGlyph key={index} type={type} color={opponent(color)} />)}
          {balance > 0 && <span className="material-lead" aria-hidden="true">+{balance}</span>}
        </p>
      </div>
    </section>
  );
}

function CenterPlate({ sides }: { sides: [Color, Color] }) {
  const game = useGameStore((state) => state.game);
  const outcome = useGameStore((state) => state.outcome);
  const clock = useGameStore((state) => state.clock);
  const aiThinking = useGameStore((state) => state.aiThinking);
  const tick = useGameStore((state) => state.tick);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    // The HUD tick is what detects a flag fall while nobody moves.
    const timer = window.setInterval(() => { tick(); setNow(Date.now()); }, 100);
    return () => window.clearInterval(timer);
  }, [tick]);
  const times = clock && remainingAt(clock, now);
  return (
    <div className={`center-plate${times ? " timed" : ""}`}>
      {times && <div className="clocks" aria-label="Chess clocks">
        {sides.map((color) => {
          const running = clock?.running === color;
          const low = isLowTime(times[color]);
          return <p key={color} aria-label={`${sideName(color)} clock`}
            className={`clock${running ? " running" : ""}${low ? " low" : ""}`}>
            <span className={`clock-pip clock-pip-${color}`} aria-hidden="true" />
            {formatTime(times[color])}
          </p>;
        })}
      </div>}
      <p className="turn-label" role="status">{statusLabel(game.turn(), game.inCheck(), outcome)}</p>
      {aiThinking && <p className="engine-thinking" role="status">Engine is thinking…</p>}
    </div>
  );
}

function MoveColumn({ color, entries, align, latestPly }: {
  color: Color; entries: MoveEntry[]; align: "left" | "right"; latestPly: number;
}) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [entries.length]);
  return (
    <div className={`move-column move-column-${align}`} role="region" aria-label={`${sideName(color)} moves`}
      tabIndex={0} ref={list}>
      {entries.length === 0 ? <p className="empty-history">No moves yet.</p> : <ol>
        {entries.map(({ number, san, ply }) => (
          <li key={ply} className={ply === latestPly ? "latest" : undefined}>
            <span className="move-number">{number}</span><span className="move-san">{san}</span>
          </li>
        ))}
      </ol>}
    </div>
  );
}

const BANNER_TEXT = { check: "Check", checkmate: "Checkmate" } as const;

export function Hud() {
  // The game object mutates in place: re-render on every store update, as moves are applied.
  const state = useGameStore((state) => state);
  const { game, settings, outcome, lastError, retryAiMove } = state;
  const canRetry = lastError && isEngineError(lastError) && state.phase === "playing" && settings.mode === "ai" &&
    game.turn() !== settings.humanColor && !state.aiThinking && state.animationQueue.length === 0;
  const history = game.history();
  const columns = moveColumns(history);
  const sides = plateSides(settings);
  const banner = hudBanner({ inCheck: game.inCheck(), outcome, animating: state.animationQueue.length > 0 });

  return (
    <>
      <header className="hud-bar" aria-label="Game information">
        <PlayerPlate color={sides[0]} align="left" />
        <CenterPlate sides={sides} />
        <PlayerPlate color={sides[1]} align="right" />
      </header>
      {banner && <div className={`hud-banner hud-banner-${banner}`} aria-hidden="true">
        <span>{BANNER_TEXT[banner]}</span>
      </div>}
      {lastError && <div className="game-error" role="alert">
        <p>{describeError(lastError)}</p>
        {canRetry && <button type="button" onClick={retryAiMove}>Retry</button>}
      </div>}
      <MoveColumn color={sides[0]} entries={columns[sides[0]]} align="left" latestPly={history.length - 1} />
      <MoveColumn color={sides[1]} entries={columns[sides[1]]} align="right" latestPly={history.length - 1} />
    </>
  );
}

const ICONS = {
  undo: "M7 5 3 9l4 4M3.5 9H11a4 4 0 0 1 0 8H8",
  export: "M10 3v9m-4-4 4 4 4-4M4 15v2h12v-2",
  newGame: "M4 10a6 6 0 1 0 2-4.5M4 3v3.5h3.5",
  menu: "M4 6h12M4 10h12M4 14h12",
};

function Icon({ path }: { path: string }) {
  return (
    <svg className="icon" viewBox="0 0 20 20" width="14" height="14" aria-hidden="true" focusable="false">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** In-game commands; the button text is their accessible name. */
export function GameActions() {
  const state = useGameStore((state) => state);
  const { game, settings } = state;
  const downloadPgn = () => {
    const difficulty = DIFFICULTIES.find((item) => item.id === settings.difficultyId)?.label ?? "Casual";
    const name = (color: "w" | "b") => settings.mode === "local" ? (color === "w" ? "White" : "Black") :
      color === settings.humanColor ? "You" : `Stockfish (${difficulty})`;
    const text = exportPgn(game, { white: name("w"), black: name("b"), date: new Date(), outcome: state.outcome });
    const url = URL.createObjectURL(new Blob([text], { type: "application/x-chess-pgn" }));
    const link = document.createElement("a");
    link.href = url; link.download = "magic-chess.pgn"; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  return (
    <>
      <button type="button" className="hud-button" onClick={state.undo} disabled={!canUndo(state)}>
        <Icon path={ICONS.undo} />Undo</button>
      <button type="button" className="hud-button" onClick={downloadPgn}><Icon path={ICONS.export} />Export PGN</button>
      <button type="button" className="hud-button" onClick={() => state.startGame(settings)}>
        <Icon path={ICONS.newGame} />New game</button>
      <button type="button" className="hud-button" onClick={state.backToSetup}><Icon path={ICONS.menu} />Menu</button>
    </>
  );
}
