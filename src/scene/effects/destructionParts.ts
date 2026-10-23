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
