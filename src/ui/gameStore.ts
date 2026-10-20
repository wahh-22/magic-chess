import { useStore } from "zustand";
import { importPgn as parsePgn } from "../core/pgn";
import { browserStorage, readSave, writeSave, type SaveStorage } from "./persistence";
import { flagFall, pauseClock, resumeClock, startClock, switchClock, type ClockState, type TimeControl } from "../core/clock";
import { createStore } from "zustand/vanilla";
import { parseCommand } from "../core/CommandParser";
import { GameState } from "../core/GameState";
import { createStockfishEngine } from "../core/engine/createStockfishEngine";
import { DEFAULT_DIFFICULTY, DIFFICULTIES } from "../core/engine/difficulty";
import type { Engine } from "../core/engine/Engine";
import { applyEventToPieces } from "../core/pieces";
import type { Color, GameOutcome, LegalMove, MoveEvent, PieceInstance, PromotionPiece, Square } from "../core/types";

export interface GameSettings {
  mode: "ai" | "local";
  humanColor: Color;
  difficultyId: string;
  timeControl?: TimeControl;
}

export interface GameStore {
  phase: "setup" | "playing" | "over";
  settings: GameSettings;
  game: GameState;
  displayedPieces: PieceInstance[];
  animationQueue: MoveEvent[];
  selected: Square | null;
  legalTargets: LegalMove[];
  pendingPromotion: { from: Square; to: Square } | null;
  aiThinking: boolean;
  outcome: GameOutcome | null;
  lastError: string | null;
  gameId: number;
  positionVersion: number;
  clock: ClockState | null;
  tick(): void;
  hasSavedGame: boolean;
  continueGame(): void;
  importPgn(text: string): string | null;
  undo(): void;
  startGame(settings: GameSettings): void;
  selectSquare(square: Square): void;
  submitCommand(text: string): void;
  choosePromotion(piece: PromotionPiece): void;
  cancelPromotion(): void;
  animationDone(): void;
  backToSetup(): void;
  retryAiMove(): void;
}

const initialSettings: GameSettings = { mode: "ai", humanColor: "w", difficultyId: "casual" };
const clearedSelection = { selected: null, legalTargets: [], pendingPromotion: null };

function isHumanTurn(state: GameStore): boolean {
  return state.settings.mode === "local" || state.game.turn() === state.settings.humanColor;
}

function acceptsInput(state: GameStore): boolean {
  return state.phase === "playing" && !state.aiThinking && state.animationQueue.length === 0 && isHumanTurn(state);
}

export function canUndo(state: GameStore): boolean {
  if (state.phase === "setup" || state.aiThinking || state.animationQueue.length) return false;
  const count = state.game.history().length;
  return state.settings.mode === "local" ? count > 0 : count >= 2 && isHumanTurn(state);
}

export function createGameStore(deps: { createEngine: () => Engine; now?: () => number; storage?: SaveStorage }) {
  const now = deps.now ?? Date.now;
  let engine: Engine | undefined;
  let engineReady: Promise<boolean> = Promise.resolve(false);

  return createStore<GameStore>()((set, get) => {
    const persist = () => {
      const state = get();
      const outcome = state.outcome ?? state.game.outcome();
      const saved = writeSave(deps.storage, { settings: state.settings, game: state.game,
        clock: state.clock, phase: outcome ? "over" : "playing", outcome }, now());
      set({ hasSavedGame: saved && !outcome });
    };
    const reportError = (id: number, error: unknown) => {
      if (get().gameId !== id) return;
      set({ aiThinking: false, lastError: error instanceof Error ? error.message : String(error) });
    };

    const checkTime = () => {
      const state = get();
      if (state.phase !== "playing") return false;
      const outcome = flagFall(state.clock, now(), state.game.pieces());
      if (!outcome) return false;
      set({ phase: "over", outcome, clock: state.clock && pauseClock(state.clock, now()),
        aiThinking: false, gameId: state.gameId + 1, animationQueue: [],
        displayedPieces: state.game.pieces(), ...clearedSelection,
        positionVersion: state.positionVersion + 1 });
      persist();
      return true;
    };

    const enqueue = (event: MoveEvent) => {
      set((state) => ({
        clock: state.clock ? (event.outcome
          ? pauseClock(switchClock(state.clock, state.game.turn(), now()), now())
          : switchClock(state.clock, state.game.turn(), now())) : null,
        animationQueue: [...state.animationQueue, event],
        ...clearedSelection,
        lastError: null,
      }));
      persist();
    };

    const initializeEngine = (id: number) => {
      try {
        engine ??= deps.createEngine();
        engineReady = engine.newGame().then(() => true, (error: unknown) => {
          reportError(id, error);
          return false;
        });
      } catch (error) {
        engineReady = Promise.resolve(false);
        reportError(id, error);
      }
    };

    const requestAiMove = async (retryInitialization = false) => {
      const state = get();
      if (state.phase !== "playing" || isHumanTurn(state) || state.aiThinking || state.animationQueue.length) return;
      const id = state.gameId;
      const ready = engineReady;
      set({ aiThinking: true });
      try {
        let initialized = await ready;
        if (get().gameId !== id) return;
        if (!initialized && retryInitialization) {
          initializeEngine(id);
          initialized = await engineReady;
          if (get().gameId !== id) return;
        }
        if (!initialized) {
          set({ aiThinking: false });
          return;
        }
        const difficulty = DIFFICULTIES.find((item) => item.id === state.settings.difficultyId) ?? DEFAULT_DIFFICULTY;
        const uci = await engine!.bestMove(state.game.fen(), difficulty);
        if (get().gameId !== id || checkTime() || get().phase !== "playing") return;
        if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) throw new Error("Invalid engine move");
        const result = state.game.applyMove({
          from: uci.slice(0, 2),
          to: uci.slice(2, 4),
          ...(uci[4] ? { promotion: uci[4] as PromotionPiece } : {}),
        });
        if (!result.ok) throw new Error(`Engine move: ${result.error}`);
        enqueue(result.event);
        set({ aiThinking: false });
      } catch (error) {
        reportError(id, error);
      }
    };

    const game = new GameState();
    return {
      phase: "setup",
      settings: initialSettings,
      game,
      displayedPieces: game.pieces(),
      animationQueue: [],
      ...clearedSelection,
      aiThinking: false,
      outcome: null,
      lastError: null,
      gameId: 0,
      positionVersion: 0,
      clock: null,
      tick() { checkTime(); },
      hasSavedGame: readSave(deps.storage)?.phase === "playing",

      continueGame() {
        const saved = readSave(deps.storage);
        if (!saved || saved.phase !== "playing") { set({ hasSavedGame: false }); return; }
        const id = get().gameId + 1;
        set({ ...saved, clock: saved.clock && resumeClock(saved.clock, saved.game.turn(), now()),
          displayedPieces: saved.game.pieces(), animationQueue: [], ...clearedSelection,
          aiThinking: false, lastError: null, gameId: id, positionVersion: get().positionVersion + 1 });
        if (saved.settings.mode === "ai") { initializeEngine(id); void requestAiMove(); }
      },

      importPgn(text) {
        try {
          const game = parsePgn(text);
          const outcome = game.outcome();
          set({ game, displayedPieces: game.pieces(), phase: outcome ? "over" : "playing", outcome,
            settings: { ...initialSettings, mode: "local", timeControl: "none" }, clock: null,
            animationQueue: [], ...clearedSelection, aiThinking: false, lastError: null,
            gameId: get().gameId + 1, positionVersion: get().positionVersion + 1 });
          persist();
          return null;
        } catch (error) { return error instanceof Error ? error.message : "Invalid PGN"; }
      },

      undo() {
        const state = get();
        if (!canUndo(state)) return;
        state.game.undo();
        if (state.settings.mode === "ai") state.game.undo();
        // Undo keeps both current balances (including earned increments); no time refund.
        const clock = state.clock && resumeClock(pauseClock(state.clock, now()), state.game.turn(), now());
        set({ phase: "playing", outcome: null, clock, displayedPieces: state.game.pieces(),
          ...clearedSelection, lastError: null, gameId: state.gameId + 1,
          positionVersion: state.positionVersion + 1 });
        persist();
      },

      startGame(settings) {
        const game = new GameState();
        const id = get().gameId + 1;
        set({
          phase: "playing", settings: { ...settings, timeControl: settings.timeControl ?? "none" }, game, displayedPieces: game.pieces(),
          clock: startClock(settings.timeControl ?? "none", "w", now()),
          animationQueue: [], ...clearedSelection, aiThinking: false, outcome: null,
          lastError: null, gameId: id,
        });
        persist();
        if (settings.mode === "ai") {
          initializeEngine(id);
          void requestAiMove();
        }
      },

      selectSquare(square) {
        if (checkTime()) return;
        const state = get();
        if (!acceptsInput(state) || state.pendingPromotion) return;
        if (state.selected && state.legalTargets.some((move) => move.to === square)) {
          state.submitCommand(`${state.selected}${square}`);
          return;
        }
        if (state.game.pieceAt(square)?.color === state.game.turn()) {
          set({ selected: square, legalTargets: state.game.legalMovesFrom(square), lastError: null });
        } else {
          set(clearedSelection);
        }
      },

      submitCommand(text) {
        if (checkTime()) return;
        const state = get();
        if (!acceptsInput(state)) return;
        const command = parseCommand(text, state.game.legalMoves());
        if (!command.ok) {
          if (command.error === "promotion-required") {
            set({ pendingPromotion: { from: command.from, to: command.to }, lastError: null });
          } else {
            set({ lastError: command.error });
          }
          return;
        }
        const result = state.game.applyMove(command.move);
        if (result.ok) enqueue(result.event);
        else set({ lastError: result.error });
      },

      choosePromotion(piece) {
        const state = get();
        if (!acceptsInput(state) || !state.pendingPromotion) return;
        const { from, to } = state.pendingPromotion;
        state.submitCommand(`${from}${to}${piece}`);
      },

      cancelPromotion() {
        set({ pendingPromotion: null });
      },

      animationDone() {
        const state = get();
        const head = state.animationQueue[0];
        if (!head) return;
        const animationQueue = state.animationQueue.slice(1);
        set({ displayedPieces: applyEventToPieces(state.displayedPieces, head), animationQueue });
        if (animationQueue.length) return;
        const outcome = state.game.outcome();
        if (outcome) {
          set({ phase: "over", outcome, clock: state.clock && pauseClock(state.clock, now()) });
          persist();
        }
        else void requestAiMove();
      },

      retryAiMove() {
        const state = get();
        if (!state.lastError || state.phase !== "playing" || isHumanTurn(state) ||
            state.aiThinking || state.animationQueue.length) return;
        set({ lastError: null });
        void requestAiMove(true);
      },

      backToSetup() {
        if (get().phase === "setup") return;
        persist();
        set((state) => ({
          phase: "setup", gameId: state.gameId + 1, animationQueue: [], ...clearedSelection,
          clock: state.clock && pauseClock(state.clock, now()),
          aiThinking: false, outcome: null, lastError: null,
        }));
      },
    };
  });
}

export const gameStore = createGameStore({ createEngine: createStockfishEngine, storage: browserStorage() });

export function useGameStore<T>(selector: (state: GameStore) => T): T {
  return useStore(gameStore, selector);
}

// Development-only handle for browser smoke tests (scripts/smoke.mjs).
if (import.meta.env.DEV) Object.assign(globalThis, { __gameStore: gameStore });
