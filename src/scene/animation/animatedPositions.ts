import type { MoveEvent } from "../../core/types";
import type { TrackSample } from "./sampleTrack";

// Presentation-only, one-way mailbox: Pieces publishes after updating its mesh.
// Event identity prevents a previous move/reset from supplying a stale position;
// WeakMap ownership releases positions with the event, without React frame state.
const positions = new WeakMap<MoveEvent, Map<string, TrackSample>>();

export function publishAnimatedPosition(event: MoveEvent, pieceId: string, position: TrackSample): void {
  let move = positions.get(event);
  if (!move) positions.set(event, move = new Map());
  move.set(pieceId, position);
}

export function animatedPosition(event: MoveEvent, pieceId: string): TrackSample | undefined {
  return positions.get(event)?.get(pieceId);
}
