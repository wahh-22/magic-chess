import { useEffect, useRef, useState } from "react";
import { TIME_CONTROLS, type TimeControl } from "../core/clock";
import { DIFFICULTIES } from "../core/engine/difficulty";
import type { SetupMode } from "./flow";
import type { GameSettings } from "./gameStore";
import { Emblem } from "./Heraldry";

type ColorChoice = "w" | "b" | "random";

/** Choices are remembered for the session: a rematch from the menu starts with the same setup. */
const last = { color: "w" as ColorChoice, difficultyId: "casual", timeControl: { ai: "none", local: "none" } as Record<SetupMode, TimeControl> };

const COLORS: readonly [ColorChoice, string, string][] = [
  ["w", "White", "Ivory moves first"],
  ["b", "Black", "Obsidian answers"],
  ["random", "Random", "Let fate decide"],
];

/** Match setup on the title: side, difficulty and clock vs the engine; clock for two players. */
export function SetupScreen({ mode, onBack, onStart }: {
  mode: SetupMode;
  onBack: () => void;
  onStart: (settings: GameSettings) => void;
}) {
  const [color, setColor] = useState<ColorChoice>(last.color);
  const [difficultyId, setDifficultyId] = useState(last.difficultyId);
  const [timeControl, setTimeControl] = useState<TimeControl>(last.timeControl[mode]);
  const form = useRef<HTMLFormElement>(null);
  // Keyboard players land on the first choice: the chosen side, or the clock for two players.
  useEffect(() => { form.current?.querySelector<HTMLElement>("input:checked, select")?.focus(); }, []);

  return (
    <form ref={form} className="arcana-panel match-setup" aria-labelledby="setup-title" onSubmit={(event) => {
      event.preventDefault();
      Object.assign(last, { color, difficultyId, timeControl: { ...last.timeControl, [mode]: timeControl } });
      const humanColor = color === "random" ? (Math.random() < 0.5 ? "w" : "b") : color;
      onStart({ mode, timeControl, humanColor, difficultyId });
    }}>
      <p className="match-setup-kicker">{mode === "ai" ? "Against Stockfish" : "Two players, one board"}</p>
      <h2 id="setup-title">{mode === "ai" ? "Play vs Engine" : "Two Players"}</h2>
      {mode === "ai" && <fieldset className="crest-choices">
        <legend>Your color</legend>
        {COLORS.map(([value, label, hint]) => (
          <label key={value} className="crest-choice">
            {/* Named explicitly: the card's hint is decoration, not part of the choice's name. */}
            <input type="radio" name="color" aria-label={label} checked={color === value} onChange={() => setColor(value)} />
            <span className="crest-art" aria-hidden="true">
              {value === "random"
                ? <span className="random-emblem"><Emblem color="w" size={30} /><Emblem color="b" size={30} /></span>
                : <Emblem color={value} size={46} />}
            </span>
            <span className="crest-label">{label}</span>
            <span className="crest-hint" aria-hidden="true">{hint}</span>
          </label>
        ))}
      </fieldset>}
      <div className="setup-row">
        {mode === "ai" && <div>
          <label className="field-label" htmlFor="difficulty">Difficulty</label>
          <select id="difficulty" value={difficultyId} onChange={(event) => setDifficultyId(event.target.value)}>
            {DIFFICULTIES.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
          </select>
        </div>}
        <div>
          <label className="field-label" htmlFor="time-control">Time control</label>
          <select id="time-control" value={timeControl} onChange={(event) => setTimeControl(event.target.value as TimeControl)}>
            {TIME_CONTROLS.map((control) => <option key={control} value={control}>{control === "none" ? "No clock" : control}</option>)}
          </select>
        </div>
      </div>
      <div className="match-setup-actions">
        <button type="button" onClick={onBack}>Back</button>
        <button className="start-button primary" type="submit">Start game</button>
      </div>
    </form>
  );
}
