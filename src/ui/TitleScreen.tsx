import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { getSoundProvider } from "../audio/webAudioSampler";
import type { FlowEvent, MenuScreen, SetupMode } from "./flow";
import type { GameSettings } from "./gameStore";
import { Emblem } from "./Heraldry";
import { KeyArt } from "./KeyArt";
import { KEY_ART } from "./keyArtSources";
import { nextFocus } from "./menuFocus";
import { SettingsFields, type SettingsProps } from "./SettingsFields";
import { SetupScreen } from "./SetupScreen";

const PGN_LABEL = "Import PGN (local two-player game, no clock)";

/** A few embers drifting up: CSS only (no canvas, no WebGL), still under reduced motion. */
const EMBERS = Array.from({ length: 14 }, (_, index) => {
  const unit = (seed: number) => (Math.sin(index * 127.1 + seed * 311.7) * 43758.5453) % 1;
  const random = (seed: number) => Math.abs(unit(seed));
  return {
    left: `${(8 + random(1) * 84).toFixed(1)}%`,
    delay: `${(-random(2) * 14).toFixed(2)}s`,
    duration: `${(9 + random(3) * 8).toFixed(2)}s`,
    drift: `${((random(4) - 0.5) * 9).toFixed(1)}vw`,
    size: `${(2 + random(5) * 3).toFixed(1)}px`,
  };
});

function TitleBackdrop() {
  return (
    <div className="title-backdrop" aria-hidden="true">
      <KeyArt className="title-art" {...KEY_ART.title} />
      <div className="title-shade" />
      <div className="title-embers">
        {EMBERS.map((ember, index) => (
          <span key={index} style={{ left: ember.left, width: ember.size, height: ember.size, animationDelay: ember.delay,
            animationDuration: ember.duration, ["--drift" as string]: ember.drift }} />
        ))}
      </div>
    </div>
  );
}

/**
 * Hover and select sounds through the shared provider: it creates no AudioContext before a
 * gesture (unlock runs in the first pointer or key press) and stays silent until then.
 */
function useMenuSounds() {
  const provider = getSoundProvider();
  useEffect(() => {
    const unlock = () => { void provider.unlock().catch(() => { /* Retry on the next gesture. */ }); };
    window.addEventListener("pointerdown", unlock, true);
    window.addEventListener("keydown", unlock, true);
    return () => {
      window.removeEventListener("pointerdown", unlock, true);
      window.removeEventListener("keydown", unlock, true);
    };
  }, [provider]);
  return useMemo(() => ({
    move: () => provider.play("pebbles", { volume: 0.12, rate: 1.9 }),
    select: () => provider.play("set-down", { volume: 0.4 }),
  }), [provider]);
}

interface MenuItem { id: string; label: string; detail: string }

/**
 * Console-style list: arrows move the focus (wrapping), Enter selects, hover focuses; one help
 * line under the list describes the focused item.
 */
function TitleMenu({ items, initial, onMove, onSelect }: { items: MenuItem[]; initial: string; onMove: () => void; onSelect: (id: string) => void }) {
  const list = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const buttons = () => [...(list.current?.querySelectorAll<HTMLButtonElement>(".menu-item") ?? [])];
  useEffect(() => {
    (buttons().find((button) => button.dataset.item === initial) ?? buttons()[0])?.focus();
    // Focus once on arrival (or when coming back from a sub-screen); later the player moves it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const onKeyDown = (event: ReactKeyboardEvent) => {
    const all = buttons();
    const next = nextFocus(all.indexOf(document.activeElement as HTMLButtonElement), all.length, event.key);
    if (next === null) return;
    event.preventDefault();
    all[next]!.focus();
    onMove();
  };
  const help = items.find((item) => item.id === focused)?.detail;
  return <>
    <div className="title-menu" role="group" aria-label="Main menu" ref={list} onKeyDown={onKeyDown}
      onFocus={(event) => setFocused((event.target as HTMLElement).dataset.item ?? null)} onBlur={() => setFocused(null)}>
      {items.map((item) => (
        <button key={item.id} type="button" className="menu-item" data-item={item.id} aria-describedby={`menu-help-${item.id}`}
          onPointerEnter={(event) => { if (document.activeElement !== event.currentTarget) { event.currentTarget.focus(); onMove(); } }}
          onClick={() => onSelect(item.id)}>
          <span className="menu-item-mark" aria-hidden="true">◆</span>
          {item.label}
          <span id={`menu-help-${item.id}`} hidden>{item.detail}</span>
        </button>
      ))}
    </div>
    <p className="title-menu-help" aria-hidden="true">{help ?? "\u00a0"}</p>
  </>;
}

function Logo() {
  return (
    <header className="title-logo">
      <div className="title-crest" aria-hidden="true"><Emblem color="w" size={34} /><Emblem color="b" size={34} /></div>
      <h1>Magic Chess</h1>
      <p className="title-subtitle">Ivory against obsidian</p>
    </header>
  );
}

function SubScreen({ children }: { children: ReactNode }) {
  return <div className="title-subscreen">{children}</div>;
}

export function TitleScreen({ screen, mode, hasSavedGame, dispatch, onStart, onContinue, onImport, onCredits, settings }: {
  screen: MenuScreen;
  mode: SetupMode;
  hasSavedGame: boolean;
  dispatch: (event: FlowEvent) => void;
  onStart: (settings: GameSettings) => void;
  onContinue: () => void;
  /** Validates and starts an imported game; returns a readable error instead. */
  onImport: (text: string) => string | null;
  onCredits: () => void;
  settings: Omit<SettingsProps, "onCredits" | "provider">;
}) {
  const sounds = useMenuSounds();
  const file = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  // The item that opened a sub-screen gets the focus back when the title returns.
  const [lastItem, setLastItem] = useState("play-ai");
  const select = (id: string) => {
    sounds.select();
    setLastItem(id);
    switch (id) {
      case "continue": onContinue(); break;
      case "play-ai": dispatch({ type: "setup", mode: "ai" }); break;
      case "play-local": dispatch({ type: "setup", mode: "local" }); break;
      case "import": file.current?.click(); break;
      case "settings": dispatch({ type: "settings" }); break;
      case "credits": onCredits(); break;
    }
  };

  useEffect(() => {
    if (screen === "title") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || document.querySelector(".credits-backdrop")) return;
      event.preventDefault();
      sounds.select();
      dispatch({ type: "back" });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [screen, dispatch, sounds]);

  const items: MenuItem[] = [
    ...(hasSavedGame ? [{ id: "continue", label: "Continue game", detail: "Return to your last battle" }] : []),
    { id: "play-ai", label: "Play vs Engine", detail: "Face Stockfish at your level" },
    { id: "play-local", label: "Two Players", detail: "Share the board on this computer" },
    { id: "import", label: "Import PGN", detail: "Replay a saved game" },
    { id: "settings", label: "Settings", detail: "Graphics, camera and sound" },
    { id: "credits", label: "Credits", detail: "Models, sounds, engine and art" },
  ];

  return (
    <div className="title-screen" data-screen={screen}>
      <TitleBackdrop />
      <main className="title-content">
        <Logo />
        {screen === "title" && <>
          <TitleMenu key="menu" items={items} initial={hasSavedGame && lastItem === "play-ai" ? "continue" : lastItem} onMove={sounds.move} onSelect={select} />
          {importError && <p className="title-error" role="alert">{importError}</p>}
        </>}
        {screen === "setup" && <SubScreen>
          <SetupScreen mode={mode} onBack={() => { sounds.select(); dispatch({ type: "back" }); }}
            onStart={(choice) => { sounds.select(); onStart(choice); }} />
        </SubScreen>}
        {screen === "settings" && <SubScreen>
          <section className="arcana-panel title-settings" aria-labelledby="settings-title">
            <h2 id="settings-title">Settings</h2>
            <div className="title-settings-fields"><SettingsFields {...settings} /></div>
            <div className="match-setup-actions">
              <button type="button" autoFocus onClick={() => { sounds.select(); dispatch({ type: "back" }); }}>Back</button>
            </div>
          </section>
        </SubScreen>}
        <input ref={file} className="visually-hidden" type="file" tabIndex={-1} aria-label={PGN_LABEL}
          accept=".pgn,text/plain,application/x-chess-pgn" onChange={async (event) => {
            const chosen = event.target.files?.[0];
            event.target.value = "";
            if (!chosen) return;
            try { setImportError(onImport(await chosen.text())); }
            catch { setImportError("Could not read the PGN file."); }
          }} />
      </main>
      <footer className="title-hints" aria-hidden="true">
        <span><kbd>↑</kbd><kbd>↓</kbd> Select</span>
        <span><kbd>Enter</kbd> Confirm</span>
        {screen !== "title" && <span><kbd>Esc</kbd> Back</span>}
      </footer>
    </div>
  );
}
