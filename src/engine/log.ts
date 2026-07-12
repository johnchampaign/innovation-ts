// Structured game log (log-format v2, same envelope as Rebellion — see
// docs/log-events.md for the kind/payload registry).
//
// ONE choke point: every log write goes through logEvent(), which wraps the
// framework's appendGameLog with a cap and stamps the current turn. Card
// handlers do NOT log directly — events are emitted at the dispatch level
// (game.ts moves) and at the dogma driver level (dogma.ts), so the ~100 card
// handlers stay untouched.

import { appendGameLog, type GameLogEntry } from 'digital-boardgame-framework';
import type { InnovationState } from './types';

/** Keep the in-state log bounded so snapshots stay small. */
export const LOG_CAP = 500;

export type InnovationLogEntry = GameLogEntry<string>;

/** Append an event, stamping seq (framework) and the current turn (state). */
export function logEvent(
  g: InnovationState,
  entry: Omit<InnovationLogEntry, 'seq' | 'turn'> & { turn?: number },
): void {
  appendGameLog(g.log, { turn: g.turnNumber ?? 0, ...entry }, LOG_CAP);
}
