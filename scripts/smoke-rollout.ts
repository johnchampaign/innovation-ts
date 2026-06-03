// Headless random rollout — the spike's correctness net (the C# RandomController
// rollout + the framework's "legalActions ⇄ applyAction must agree" check).
//
// For each game: drive random legal actions to game-over via the framework
// ADAPTER (so we exercise exactly the multiplayer code path), asserting after
// every step that (a) applyAction accepted the action legalActions offered, and
// (b) card conservation holds — no card id is ever created or lost.
//
//   npm run smoke

import { innovationAdapter as A, initialBgioState, type BgioState } from '../src/adapter/innovationAdapter';
import { ALL_CARDS, cardById } from '../src/card-data';
import { topCard } from '../src/engine/mechanics';
import type { Color } from '../src/engine/types';

function totalCardIds(state: BgioState): number {
  const G = state.G;
  let n = G.removedFromGame.length;
  for (let a = 1; a < G.decks.length; a++) n += G.decks[a].length;
  for (const p of Object.values(G.players)) {
    n += p.hand.length + p.scorePile.length;
    for (const c of Object.keys(p.piles) as Color[]) n += p.piles[c].cards.length;
  }
  return n;
}

const NUM_GAMES = 25;
const MAX_STEPS = 8000;

// Deterministic LCG so the run is reproducible.
let rngState = 0x1234abcd >>> 0;
function rnd(): number {
  rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0;
  return rngState / 2 ** 32;
}

let over = 0, timeouts = 0;
const reasons: Record<string, number> = {};

for (let game = 0; game < NUM_GAMES; game++) {
  let state = initialBgioState(2);
  const expected = totalCardIds(state);
  // Conservation: every card stays in the system. removedFromGame holds the
  // 9 reserved achievement tiles at start, plus anything Fission wipes.
  if (game === 0 && expected !== ALL_CARDS.length) {
    throw new Error(`unexpected starting card count ${expected} (cards=${ALL_CARDS.length})`);
  }

  let steps = 0;
  for (; steps < MAX_STEPS && !state.ctx.gameover; steps++) {
    const actor = A.currentActor(state);
    if (actor === null) break;
    const legal = A.legalActions(state, actor);
    if (legal.length === 0) throw new Error(`game ${game}: no legal actions for ${actor} at turn ${state.ctx.turn}`);
    const pick = legal[Math.floor(rnd() * legal.length)];
    // Capture which card a dogma is firing for, so failures pinpoint it.
    let dogmaCard = '';
    if (pick.kind === 'dogma') {
      const top = topCard(state.G.players[actor], pick.color);
      if (top !== null) dogmaCard = cardById(top).title;
    }
    state = A.applyAction(state, pick, actor); // throws on legal/apply divergence
    const total = totalCardIds(state);
    if (total !== expected) {
      let extra = '';
      if (pick.kind === 'dogma') {
        extra = ' (card="' + dogmaCard + '")';
      } else if (pick.kind === 'resolveChoice') {
        extra = ' (resolving dogma run: ' + JSON.stringify(state.G.dogmaRun) + ')';
      }
      throw new Error(`game ${game} step ${steps}: card conservation broken (${total} != ${expected}) after ${pick.kind}${extra}`);
    }
  }

  const res = A.result ? A.result(state) : null;
  if (state.ctx.gameover) {
    over++;
    const reason = state.ctx.gameover.reason;
    reasons[reason] = (reasons[reason] ?? 0) + 1;
    console.log(`game ${String(game).padStart(2)}: OVER in ${String(steps).padStart(4)} steps — ${JSON.stringify(res)}`);
  } else {
    timeouts++;
    console.log(`game ${String(game).padStart(2)}: TIMEOUT after ${steps} steps (no end reached)`);
  }
}

console.log('—'.repeat(40));
console.log(`finished: ${over}/${NUM_GAMES} reached game-over, ${timeouts} timeouts`);
console.log(`end reasons: ${JSON.stringify(reasons)}`);
console.log('smoke OK — legalActions⇄applyAction agree, card conservation held');
