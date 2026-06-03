// HeuristicEvaluator — faithful port of Innovation.Core/HeuristicEvaluator.cs
// (which itself mirrors the VB6 score_game_individual + score_game in
// AIFunctions.bas, lines 547–627). Higher values are better for the named
// player. Pure functions of state.
//
// KNOWN-BUG (carried verbatim from C#, see C# comments for full rationale):
// the icon leader-bonus check reads a "stale i" in VB6 that evaluates to 0,
// so the +75 / +50 bonus only fires when nobody has the icon. The port
// keeps this behaviour so AI decisions stay bit-compatible with the
// original; a future "fixed" path can opt in.

import { cardById } from '../card-data';
import { score, achievementCount, highestTopAge } from '../engine/mechanics';
import { countIcons } from '../engine/icons';
import { COLORS } from '../engine/types';
import type { BgioState } from '../adapter/innovationAdapter';
import type { IconName } from '../engine/types';

const ICONS: IconName[] = ['leaf', 'castle', 'lightbulb', 'crown', 'factory', 'clock'];

/** Per-player heuristic in isolation. `scoreRelative` is what an AI picking
 *  for itself should use; this is the per-player component. */
export function scoreIndividual(
  state: BgioState,
  playerId: string,
  searchDepth = 0,
): number {
  const G = state.G;
  const p = G.players[playerId];
  let total = 0;

  // Winning trumps everything. C# line 50; VB6 lines 570–573.
  const gameover = state.ctx.gameover;
  if (gameover && gameover.winners.includes(playerId)) {
    total += 1_000_000 - 100 * searchDepth;
  }

  // Achievements. VB6 line 576.
  total += 10_000 * achievementCount(p);

  // Top-card quadratic. VB6 lines 578–580.
  const topAge = highestTopAge(p);
  total += 5 * topAge * topAge;

  // Per-color pile bonuses. VB6 lines 585–592.
  for (const c of COLORS) {
    const pile = p.piles[c];
    if (pile.cards.length === 0) continue;
    total += 20 + pile.cards.length + cardById(pile.cards[0]).age;
    switch (pile.splay) {
      case 'up': total += 40; break;
      case 'right': total += 25; break;
      case 'left': total += 10; break;
      default: break;
    }
  }

  // Icon race. VB6 lines 594–608.
  for (const icon of ICONS) {
    let max = 0;
    let numAtMax = 1;
    for (const other of Object.values(G.players)) {
      const cnt = countIcons(other, icon);
      if (cnt === max) numAtMax++;
      if (cnt > max) { max = cnt; numAtMax = 1; }
    }
    total += 2 * countIcons(p, icon);

    // BUG-preserve: VB6's stale-`i` read evaluates to 0. Bonus only applies
    // when max is also 0, i.e. nobody has the icon.
    const staleIconRead = 0;
    if (staleIconRead === max && numAtMax === 1) total += 75;
    if (staleIconRead === max && numAtMax > 1)  total += 50;
  }

  // Hand value. VB6 lines 611–613.
  for (const id of p.hand) total += 2 * cardById(id).age;

  // Score pile curve. VB6 lines 616–622.
  const cappedTop = Math.min(topAge, 8);
  const topScoreCap = 5 * (cappedTop + 1);
  const scoreSum = score(p);
  if (scoreSum > topScoreCap) {
    total += Math.trunc(3 * Math.pow(topScoreCap, 1.5) + (scoreSum - topScoreCap) / 2);
  } else {
    total += Math.trunc(3 * Math.pow(scoreSum, 1.5));
  }

  return total;
}

/** Zero-sum-ish relative score: weight the named player's individual score by
 *  2·(n-1) and subtract each opponent's individual score. Matches VB6
 *  score_game (AIFunctions.bas 547–558). This is what an AI maximises. */
export function scoreRelative(
  state: BgioState,
  playerId: string,
  searchDepth = 0,
): number {
  const ids = Object.keys(state.G.players);
  const n = ids.length;
  const self = scoreIndividual(state, playerId, searchDepth);
  let total = 2 * (n - 1) * self;
  for (const id of ids) {
    if (id === playerId) continue;
    total -= scoreIndividual(state, id, searchDepth);
  }
  return total;
}
