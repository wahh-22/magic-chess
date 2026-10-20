import { useStore } from "zustand";
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
  startGame(settings: GameSettings): void;
  selectSquare(square: Square): void;
  submitCommand(text: string): void;
  choosePromotion(piece: PromotionPiece): void;
  cancelPromotion(): void;
  animationDone(): void;
  backToSetup(): void;
}

const initialSettings: GameSettings = { mode: "ai", humanColor: "w", difficultyId: "casual" };
const clearedSelection = { selected: null, legalTargets: [], pendingPromotion: null };

function isHumanTurn(state: GameStore): boolean {
  return state.settings.mode === "local" || state.game.turn() === state.settings.humanColor;
}

function acceptsInput(state: GameStore): boolean {
  return state.phase === "playing" && !state.aiThinking && state.animationQueue.length === 0 && isHumanTurn(state);
}

export function createGameStore(deps: { createEngine: () => Engine }) {
  let engine: Engine | undefined;
  let engineReady: Promise<boolean> = Promise.resolve(false);

  return createStore<GameStore>()((set, get) => {
    const reportError = (id: number, error: unknown) => {
      if (get().gameId !== id) return;
      set({ aiThinking: false, lastError: error instanceof Error ? error.message : String(error) });
    };

    const enqueue = (event: MoveEvent) => {
      set((state) => ({
        animationQueue: [...state.animationQueue, event],
        ...clearedSelection,
        lastError: null,
      }));
    };

    const requestAiMove = async () => {
      const state = get();
      if (state.phase !== "playing" || isHumanTurn(state) || state.aiThinking || state.animationQueue.length) return;
      const id = state.gameId;
      const ready = engineReady;
      set({ aiThinking: true });
      try {
        const initialized = await ready;
        if (get().gameId !== id) return;
        if (!initialized) {
          set({ aiThinking: false });
          return;
        }
        const difficulty = DIFFICULTIES.find((item) => item.id === state.settings.difficultyId) ?? DEFAULT_DIFFICULTY;
        const uci = await engine!.bestMove(state.game.fen(), difficulty);
        if (get().gameId !== id) return;
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

      startGame(settings) {
        const game = new GameState();
        const id = get().gameId + 1;
        set({
          phase: "playing", settings: { ...settings }, game, displayedPieces: game.pieces(),
          animationQueue: [], ...clearedSelection, aiThinking: false, outcome: null,
          lastError: null, gameId: id,
        });
        if (settings.mode === "ai") {
          try {
            engine ??= deps.createEngine();
            engineReady = engine.newGame().then(() => true, (error: unknown) => {
              reportError(id, error);
              return false;
            });
          } catch (error) {
            engineReady = Promise.resolve(false);
            reportError(id, error);
            return;
          }
          void requestAiMove();
        }
      },

      selectSquare(square) {
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
        if (outcome) set({ phase: "over", outcome });
        else void requestAiMove();
      },

      backToSetup() {
        set((state) => ({
          phase: "setup", gameId: state.gameId + 1, animationQueue: [], ...clearedSelection,
          aiThinking: false, outcome: null, lastError: null,
        }));
      },
    };
  });
}

export const gameStore = createGameStore({ createEngine: createStockfishEngine });

export function useGameStore<T>(selector: (state: GameStore) => T): T {
  return useStore(gameStore, selector);
}
