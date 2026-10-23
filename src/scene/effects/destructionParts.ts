import type { Color, PieceType } from '../../core/types';
import type { PieceModelProvider } from '../pieces/PieceModelProvider';
import { budgetRigidParts, type RigidPart } from './pieceParts';

const cache = new WeakMap<RigidPart[], Map<number, RigidPart[]>>();

/** Undefined deliberately selects the existing procedural fracture path. */
export function selectDestructionParts(provider: PieceModelProvider, type: PieceType, color: Color, maxBodies: number) {
  const parts = provider.parts?.(type, color);
  if (!parts?.length) return undefined;
  let budgets = cache.get(parts);
  if (!budgets) { budgets = new Map(); cache.set(parts, budgets); }
  let result = budgets.get(maxBodies);
  if (!result) { result = budgetRigidParts(parts, maxBodies); budgets.set(maxBodies, result); }
  return result;
}

const TYPES: PieceType[] = ['p', 'n', 'b', 'r', 'q', 'k'];
const COLORS: Color[] = ['w', 'b'];

/** Runs `task` when the main thread is idle; returns a cancel function. */
export type IdleScheduler = (task: () => void) => () => void;

const whenIdle: IdleScheduler = (task) => {
  if (typeof requestIdleCallback === 'function') {
    const handle = requestIdleCallback(task, { timeout: 4000 });
    return () => cancelIdleCallback(handle);
  }
  const handle = setTimeout(task, 50);
  return () => clearTimeout(handle);
};

/**
 * Splits and budgets every piece's destruction parts ahead of the first capture, one
 * piece/colour per idle callback, so the capture itself only mounts ready geometry.
 */
export function prewarmDestructionParts(provider: PieceModelProvider, maxBodies: number, schedule: IdleScheduler = whenIdle): () => void {
  const queue = TYPES.flatMap((type) => COLORS.map((color) => [type, color] as const));
  let cancel: (() => void) | undefined;
  let stopped = false;
  const next = () => {
    const item = queue.shift();
    if (!item || stopped) return;
    cancel = schedule(() => {
      if (stopped) return;
      selectDestructionParts(provider, item[0], item[1], maxBodies);
      next();
    });
  };
  next();
  return () => { stopped = true; cancel?.(); };
}
