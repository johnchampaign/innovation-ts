// AI vs random playoff — confirms the greedy AI dominates random play.
// Runs N games where player 0 is greedy and player 1 is random; prints win
// rate + a few representative games. Soft bar: ≥66% wins. Realistic AI
// hovers around 90%+ vs random in C#.
//
//   npx vite-node scripts/ai-playoff.ts

import { innovationAdapter as A, initialBgioState, type BgioState } from '../src/adapter/innovationAdapter';
import { pickAction } from '../src/ai/greedy';

const NUM_GAMES = 20;
const MAX_STEPS = 5000;

// Reproducible PRNG for the random side.
let rngState = 0xabcd1234 >>> 0;
function rnd(): number {
  rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0;
  return rngState / 2 ** 32;
}

const wins = { '0': 0, '1': 0, draws: 0, timeouts: 0 };
const reasons: Record<string, number> = {};

const start = Date.now();
for (let g = 0; g < NUM_GAMES; g++) {
  let state: BgioState = initialBgioState(2);
  let steps = 0;
  for (; steps < MAX_STEPS && !state.ctx.gameover; steps++) {
    const actor = A.currentActor(state);
    if (actor === null) break;
    let action;
    if (actor === '0') {
      // Greedy AI.
      action = pickAction(state, '0');
    } else {
      // Random.
      const legal = A.legalActions(state, actor);
      if (legal.length === 0) throw new Error(`no legal actions for ${actor}`);
      action = legal[Math.floor(rnd() * legal.length)];
    }
    state = A.applyAction(state, action, actor);
  }
  if (!state.ctx.gameover) {
    wins.timeouts++;
    console.log(`game ${g}: TIMEOUT after ${steps} steps`);
    continue;
  }
  const winners = state.ctx.gameover.winners as string[];
  const reason = String(state.ctx.gameover.reason);
  reasons[reason] = (reasons[reason] ?? 0) + 1;
  if (winners.length === 1) {
    wins[winners[0] as '0' | '1']++;
  } else {
    wins.draws++;
  }
  console.log(`game ${String(g).padStart(2)}: ${steps} steps · winners=[${winners.join(',')}] · ${reason}`);
}
const elapsed = ((Date.now() - start) / 1000).toFixed(1);

console.log('—'.repeat(50));
console.log(`AI (P0) wins: ${wins['0']} · random (P1) wins: ${wins['1']} · draws: ${wins.draws} · timeouts: ${wins.timeouts}`);
const winRate = wins['0'] / (NUM_GAMES - wins.timeouts);
console.log(`AI win rate (excl. timeouts): ${(winRate * 100).toFixed(1)}%`);
console.log(`elapsed: ${elapsed}s · end reasons: ${JSON.stringify(reasons)}`);

if (winRate >= 0.66) {
  console.log('AI playoff OK');
  process.exit(0);
} else {
  console.error(`AI win rate below threshold (${winRate} < 0.66)`);
  process.exit(1);
}
