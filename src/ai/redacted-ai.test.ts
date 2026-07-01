// Regression: the server-driven AI must play on its own REDACTED view.
//
// The framework's GameServer.driveAi hands an AI seat `adapter.viewFor(state,
// seat)` — the opponent's hand and the face-down decks are HIDDEN (-1). The
// greedy evaluator reads every player's cards, so cardById(-1) used to throw;
// that exception bubbled out of pickAction, the controller caught it, and fell
// back to `legal[0]` (= draw). Symptom: the online AI drew every turn and
// never melded. These tests lock in that pickAction/the controller stay
// robust under redaction and actually build a board.

import { describe, it, expect } from 'vitest';
import { innovationAdapter as A, initialBgioState } from '../adapter/innovationAdapter';
import { pickAction } from './greedy';
import { innovationAiControllers } from './controller';

describe('server-driven AI under redaction', () => {
  it('gives the AI a view with the opponent hand + decks hidden', () => {
    const view = A.viewFor(initialBgioState(2), '0');
    expect(view.G.players['1'].hand.every((id) => id < 0)).toBe(true); // opp hand hidden
    expect(view.G.players['0'].hand.every((id) => id >= 0)).toBe(true); // own hand visible
    expect(view.G.decks[1].every((id) => id < 0)).toBe(true);          // decks hidden
  });

  it('pickAction does not throw on a redacted view', () => {
    // The crash (cardById(-1) on the hidden opponent hand) was the whole bug —
    // it made pickAction throw, so the controller fell back to draw forever.
    const view = A.viewFor(initialBgioState(2), '0');
    expect(() => pickAction(view, '0')).not.toThrow();
  });

  it('redaction is behaviour-preserving: same choice as on the full state', () => {
    // The AI must play its own redacted view identically to how it would play
    // the full state — hidden opponent-hand/deck info it legitimately cannot
    // see must not change the decision.
    const full = initialBgioState(2);
    const view = A.viewFor(full, '0');
    expect(pickAction(view, '0')).toEqual(pickAction(full, '0'));
  });

  it('actually builds a board when driven on its own redacted view (not draw-forever)', () => {
    // The reported bug: the online AI only ever drew (empty board). Drive a
    // self-play where every seat plays ONLY its own redacted view (exactly the
    // server path) and confirm the AI melds and accumulates a board.
    let s = initialBgioState(2);
    let melds = 0;
    for (let i = 0; i < 40 && !s.ctx.gameover; i++) {
      const actor = A.currentActor(s);
      if (actor === null) break;
      const act = pickAction(A.viewFor(s, actor), actor);
      if (act.kind === 'meld') melds++;
      s = A.applyAction(s, act, actor);
    }
    const boardCards = (pid: string) =>
      Object.values(s.G.players[pid].piles).reduce((n, p) => n + p.cards.length, 0);
    expect(melds).toBeGreaterThan(0);
    expect(boardCards('0') + boardCards('1')).toBeGreaterThan(0);
  });

  it('the standard controller returns a legal action without throwing', async () => {
    const view = A.viewFor(initialBgioState(2), '0');
    const action = await innovationAiControllers.standard.selectAction({
      state: view, actor: '0', adapter: A, rng: {} as never,
    });
    expect(['draw', 'meld', 'dogma', 'achieve']).toContain(action.kind);
  });
});
