// Sanity tests for the HeuristicEvaluator port. Not bit-comparing to the C#
// (that's a much bigger effort); just confirming the shape of the score is
// sensible and that scoreRelative responds to the right inputs in the right
// direction.

import { describe, expect, it } from 'vitest';
import { scoreIndividual, scoreRelative } from './evaluator';
import { initialBgioState } from '../adapter/innovationAdapter';
import { claimSpecialAchievement, meldFromHand } from '../engine/mechanics';

function fresh() {
  // bgio's InitializeGame freezes the returned object; clone so tests can
  // synthesise scenarios via in-place mutation. AI code itself always goes
  // through applyAction which clones internally.
  return JSON.parse(JSON.stringify(initialBgioState(2)));
}

describe('scoreIndividual', () => {
  it('returns 0 (or close to) on an empty board', () => {
    const s = fresh();
    // Each player drew 2 hand cards from age 1 → hand value contributes a
    // few points. No top cards, no piles, no achievements.
    const v0 = scoreIndividual(s, '0');
    expect(v0).toBeGreaterThanOrEqual(0);
    expect(v0).toBeLessThan(500); // sanity: nothing wild
  });

  it('credits 10k per achievement', () => {
    const s = fresh();
    const before = scoreIndividual(s, '0');
    claimSpecialAchievement(s.G, '0', 'Monument');
    const after = scoreIndividual(s, '0');
    expect(after - before).toBe(10_000);
  });

  it("changes the score when a card is melded (sign depends on bug-preserved icon bonus)", () => {
    // The bug-preserved icon-leader bonus (+50 per tied-zero icon) means a
    // single early meld can show a NEGATIVE delta because the activator
    // now leads in one icon and loses the tied-zero bonus. That's the C#
    // behaviour we explicitly preserve. So this test just confirms the
    // evaluator notices the meld at all.
    const s = fresh();
    const before = scoreIndividual(s, '0');
    meldFromHand(s.G, '0', s.G.players['0'].hand[0]);
    const after = scoreIndividual(s, '0');
    expect(after).not.toBe(before);
  });

  it('returns a big number when the named player has won', () => {
    const s = fresh();
    // Synthesise gameover by mutating ctx.
    (s.ctx as { gameover?: { winners: string[]; reason: string } }).gameover = {
      winners: ['0'], reason: 'test',
    };
    const v0 = scoreIndividual(s, '0');
    const v1 = scoreIndividual(s, '1');
    expect(v0).toBeGreaterThan(900_000);
    expect(v1).toBeLessThan(v0);
  });
});

describe('scoreRelative', () => {
  it('is zero-sum when both players are identical', () => {
    const s = fresh();
    // Force both hands identical — copy player 0's hand to player 1.
    s.G.players['1'].hand = [...s.G.players['0'].hand];
    const r0 = scoreRelative(s, '0');
    const r1 = scoreRelative(s, '1');
    expect(r0).toBe(r1);
  });

  it("rewards the player with more achievements (a signal the icon-bonus bug doesn't fight)", () => {
    const s = fresh();
    claimSpecialAchievement(s.G, '0', 'Monument');
    claimSpecialAchievement(s.G, '0', 'Empire');
    const r0 = scoreRelative(s, '0');
    const r1 = scoreRelative(s, '1');
    expect(r0).toBeGreaterThan(r1);
  });

  it('penalises losing relative to the opponent (Masonry-like achievement)', () => {
    const s = fresh();
    const r0Before = scoreRelative(s, '0');
    claimSpecialAchievement(s.G, '1', 'Monument');
    const r0After = scoreRelative(s, '0');
    expect(r0After).toBeLessThan(r0Before);
  });
});
