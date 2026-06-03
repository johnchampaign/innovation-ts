// Age 6 dogma handlers. Ported from the C# reference handlers in
// Innovation.Core/Handlers/ (one TS handler per card title; multi-effect
// cards branch on ctx.levelIndex).
//
// Cards covered:
//   Atomic Theory     — AtomicTheorySplayHandler + AtomicTheoryDrawMeldHandler
//   Canning           — CanningTuckIfHandler + CanningSplayHandler
//   Classification    — ClassificationHandler
//   Democracy         — DemocracyReturnHandler
//   Emancipation      — EmancipationDemandHandler + EmancipationSplayHandler
//   Encyclopedia      — EncyclopediaHandler
//   Industrialization — IndustrializationTuckHandler + IndustrializationSplayHandler
//   Machine Tools     — MachineToolsHandler
//   Metric System     — MetricSystemAnyColorHandler + MetricSystemSplayGreenHandler
//   Vaccination       — VaccinationDemandHandler + VaccinationDrawIfDemandHandler

import { registerDogma } from '../registry';
import { cardById } from '../../card-data';
import {
  draw, drawAndMeld, drawAndScore, meldCard, meldFromHand, returnFromHand,
  returnFromScore, scoreFromBoard, splay, transferHandToHand,
  transferHandToScore, tuckFromHand, hasIcon,
} from '../mechanics';
import { COLORS } from '../types';
import type { ChoiceResponse, Color } from '../types';

// ---- helpers -----------------------------------------------------------

/** Draw a card of `age` and immediately tuck it. Composed because there's
 *  no dedicated drawAndTuck primitive. Returns drawn id or null (deck
 *  exhausted / endByDraw set). */
function drawAndTuck(g: import('../types').InnovationState, playerId: string, age: number): number | null {
  const id = draw(g, playerId, age);
  if (id === null) return null;
  tuckFromHand(g, playerId, id);
  return id;
}

// =======================================================================
// Atomic Theory — eff0: "You may splay your blue cards right." (yes/no)
//                 eff1: "Draw and meld a 7."
// =======================================================================
registerDogma('Atomic Theory', (g, target, ctx) => {
  if (ctx.levelIndex === 0) {
    const pile = g.players[target].piles.blue;
    if (pile.cards.length < 2 || pile.splay === 'right') return false;
    if (!ctx.handlerState.asked) {
      ctx.handlerState.asked = true;
      ctx.pendingChoice = {
        kind: 'yes-no',
        prompt: 'Atomic Theory: splay your blue cards right?',
        playerId: target,
        options: [],
        optional: false,
      };
      return;
    }
    if (ctx.response !== true) return false;
    splay(g, target, 'blue', 'right');
    return true;
  }
  // eff1
  drawAndMeld(g, target, 7);
  return true;
});

// =======================================================================
// Canning — eff0: yes/no draw-and-tuck a 6; on yes, score top non-factory cards.
//           eff1: yes/no splay yellow right.
// =======================================================================
registerDogma('Canning', (g, target, ctx) => {
  if (ctx.levelIndex === 0) {
    if (!ctx.handlerState.asked) {
      ctx.handlerState.asked = true;
      ctx.pendingChoice = {
        kind: 'yes-no',
        prompt: 'Canning: draw and tuck a 6, then score all your top cards without a [Factory]?',
        playerId: target,
        options: [],
        optional: false,
      };
      return;
    }
    if (ctx.response !== true) return false;
    const tucked = drawAndTuck(g, target, 6);
    if (tucked === null || g.endByDraw) return true;
    for (const c of COLORS) {
      const p = g.players[target].piles[c];
      const top = p.cards[0];
      if (top === undefined) continue;
      if (hasIcon(top, 'factory')) continue;
      scoreFromBoard(g, target, c, top);
      if (g.endByDraw) return true;
    }
    return true;
  }
  // eff1 — splay yellow right
  const yp = g.players[target].piles.yellow;
  if (yp.cards.length < 2 || yp.splay === 'right') return false;
  if (!ctx.handlerState.asked) {
    ctx.handlerState.asked = true;
    ctx.pendingChoice = {
      kind: 'yes-no',
      prompt: 'Canning: splay your yellow cards right?',
      playerId: target,
      options: [],
      optional: false,
    };
    return;
  }
  if (ctx.response !== true) return false;
  splay(g, target, 'yellow', 'right');
  return true;
});

// =======================================================================
// Classification — "Reveal the color of a card from your hand. Take into
// your hand all cards of that color from all other players' hands. Then,
// meld all cards of that color from your hand."
// =======================================================================
registerDogma('Classification', (g, target, ctx) => {
  const p = g.players[target];
  if (!ctx.handlerState.stage) {
    if (p.hand.length === 0) return false;
    ctx.handlerState.stage = 'reveal';
    ctx.pendingChoice = {
      kind: 'select-hand-card',
      prompt: 'Classification: reveal a card from your hand (its color drives the effect).',
      playerId: target,
      options: [...p.hand],
      optional: false,
    };
    return;
  }
  if (ctx.handlerState.stage === 'reveal') {
    const revealId = ctx.response as number;
    const color = cardById(revealId).color;
    // Transfer all matching-color cards from every other player's hand.
    for (const [pid, other] of Object.entries(g.players)) {
      if (pid === target) continue;
      const matches = other.hand.filter((id) => cardById(id).color === color);
      for (const id of matches) transferHandToHand(g, pid, target, id);
    }
    const toMeld = p.hand.filter((id) => cardById(id).color === color);
    if (toMeld.length === 0) return true;
    if (toMeld.length === 1) {
      meldFromHand(g, target, toMeld[0]);
      return true;
    }
    ctx.handlerState.stage = 'order';
    ctx.handlerState.toMeld = toMeld;
    ctx.pendingChoice = {
      kind: 'select-card-order',
      prompt: `Classification: choose the order to meld your ${color} cards (top-first; first listed ends up on top).`,
      playerId: target,
      options: toMeld,
      optional: false,
    };
    return;
  }
  // stage === 'order': response is permutation, top-first; apply in reverse.
  const ordered = ctx.response as number[];
  for (let i = ordered.length - 1; i >= 0; i--) {
    meldFromHand(g, target, ordered[i]);
  }
  return true;
});

// =======================================================================
// Democracy — "You may return any number of cards from your hand. If you
// have returned more cards than any other player due to Democracy this
// phase, draw and score an 8."
//
// Cross-target counts live on g.dogmaRun (a custom field so it survives
// the per-target handlerState reset). Strict "more than" — equal does not
// qualify. The comparison happens against counts ALREADY recorded by
// previously-resolved targets (sequential evaluation).
// =======================================================================
registerDogma('Democracy', (g, target, ctx) => {
  const run = g.dogmaRun! as unknown as { democracyCounts?: Record<string, number> };
  if (!run.democracyCounts) run.democracyCounts = {};

  if (!ctx.handlerState.asked) {
    const hand = g.players[target].hand;
    if (hand.length === 0) {
      run.democracyCounts[target] = 0;
      return false;
    }
    ctx.handlerState.asked = true;
    ctx.pendingChoice = {
      kind: 'select-hand-card-subset',
      prompt: 'Democracy: return any number of cards from your hand.',
      playerId: target,
      options: [...hand],
      optional: true,
      minCount: 0,
      maxCount: hand.length,
    };
    return;
  }
  const resp = ctx.response;
  const picks = Array.isArray(resp) ? resp : [];
  for (const id of picks) returnFromHand(g, target, id);
  run.democracyCounts[target] = picks.length;
  if (picks.length === 0) return false;

  // Strictly more than every OTHER recorded target so far.
  let moreThanAll = true;
  for (const [pid, c] of Object.entries(run.democracyCounts)) {
    if (pid === target) continue;
    if (c >= picks.length) { moreThanAll = false; break; }
  }
  if (moreThanAll) drawAndScore(g, target, 8);
  return true;
});

// =======================================================================
// Emancipation — eff0 (demand): transfer a hand card to my score pile; if
//                              you do, target draws a 6.
//                eff1: splay your red or purple cards right (optional).
// =======================================================================
registerDogma('Emancipation', (g, target, ctx) => {
  if (ctx.levelIndex === 0) {
    if (!ctx.handlerState.asked) {
      const hand = g.players[target].hand;
      if (hand.length === 0) return false;
      ctx.handlerState.asked = true;
      ctx.handlerState.activatingPlayerId = g.dogmaRun!.activatingPlayerId;
      ctx.pendingChoice = {
        kind: 'select-hand-card',
        prompt: "Emancipation: transfer a hand card to the activator's score pile.",
        playerId: target,
        options: [...hand],
        optional: false,
      };
      return;
    }
    const cardId = ctx.response as number;
    const activatorId = ctx.handlerState.activatingPlayerId as string;
    transferHandToScore(g, target, activatorId, cardId);
    g.dogmaRun!.demandSuccessful = true;
    if (g.endByDraw) return true;
    draw(g, target, 6);
    return true;
  }
  // eff1 — pick red or purple to splay right
  if (!ctx.handlerState.asked) {
    const eligible: Color[] = [];
    for (const c of ['red', 'purple'] as Color[]) {
      const s = g.players[target].piles[c];
      if (s.cards.length >= 2 && s.splay !== 'right') eligible.push(c);
    }
    if (eligible.length === 0) return false;
    ctx.handlerState.asked = true;
    ctx.pendingChoice = {
      kind: 'select-board-color',
      prompt: 'Emancipation: splay your red or purple cards right?',
      playerId: target,
      options: eligible.map((c) => COLORS.indexOf(c)),
      optional: true,
    };
    return;
  }
  const resp = ctx.response;
  if (resp === null || resp === undefined) return false;
  const color = COLORS[resp as number];
  splay(g, target, color, 'right');
  return true;
});

// =======================================================================
// Encyclopedia — "You may meld all the highest cards in your score pile."
// Yes/no; on yes, meld every score-pile card at the highest age. With 2+
// of the same color, ask for the meld order (top-first).
// =======================================================================
registerDogma('Encyclopedia', (g, target, ctx) => {
  const p = g.players[target];
  if (p.scorePile.length === 0) return false;
  let highest = 0;
  for (const id of p.scorePile) {
    const a = cardById(id).age;
    if (a > highest) highest = a;
  }

  if (!ctx.handlerState.stage) {
    ctx.handlerState.stage = 'yesno';
    ctx.pendingChoice = {
      kind: 'yes-no',
      prompt: `Encyclopedia: meld all ${highest}s from your score pile?`,
      playerId: target,
      options: [],
      optional: false,
    };
    return;
  }
  if (ctx.handlerState.stage === 'yesno') {
    if (ctx.response !== true) return false;
    const toMeld = p.scorePile.filter((id) => cardById(id).age === highest);
    if (toMeld.length === 0) return false;
    // If all distinct colors (no order ambiguity) just meld each.
    const colors = new Set(toMeld.map((id) => cardById(id).color));
    if (toMeld.length === 1 || colors.size === toMeld.length) {
      for (const id of toMeld) meldFromScoreLocal(g, target, id);
      return true;
    }
    ctx.handlerState.stage = 'order';
    ctx.handlerState.toMeld = toMeld;
    ctx.pendingChoice = {
      kind: 'select-card-order',
      prompt: 'Encyclopedia: choose meld order (top-first; first listed ends up on top of its color).',
      playerId: target,
      options: toMeld,
      optional: false,
    };
    return;
  }
  // stage === 'order'
  const ordered = ctx.response as number[];
  for (let i = ordered.length - 1; i >= 0; i--) {
    meldFromScoreLocal(g, target, ordered[i]);
    if (g.endByDraw) return true;
  }
  return true;
});

// Local meld-from-score helper. (mechanics.meldFromScore exists; using
// directly to keep import surface tight.)
function meldFromScoreLocal(g: import('../types').InnovationState, playerId: string, cardId: number): void {
  const p = g.players[playerId];
  const i = p.scorePile.indexOf(cardId);
  if (i < 0) return;
  p.scorePile.splice(i, 1);
  meldCard(g, playerId, cardId);
}

// =======================================================================
// Industrialization — eff0: "Draw and tuck a 6 for every two [Factory]
//                            icons on your board." (uses frozen counts)
//                     eff1: splay red or purple right.
// =======================================================================
registerDogma('Industrialization', (g, target, ctx) => {
  if (ctx.levelIndex === 0) {
    // Featured icon IS factory → frozen counts give us the factory total.
    const factories = g.dogmaRun!.frozenIconCounts[target] ?? 0;
    const n = Math.floor(factories / 2);
    if (n === 0) return false;
    for (let i = 0; i < n; i++) {
      const id = drawAndTuck(g, target, 6);
      if (id === null || g.endByDraw) return true;
    }
    return true;
  }
  // eff1 — same shape as Emancipation eff1.
  if (!ctx.handlerState.asked) {
    const eligible: Color[] = [];
    for (const c of ['red', 'purple'] as Color[]) {
      const s = g.players[target].piles[c];
      if (s.cards.length >= 2 && s.splay !== 'right') eligible.push(c);
    }
    if (eligible.length === 0) return false;
    ctx.handlerState.asked = true;
    ctx.pendingChoice = {
      kind: 'select-board-color',
      prompt: 'Industrialization: splay your red or purple cards right?',
      playerId: target,
      options: eligible.map((c) => COLORS.indexOf(c)),
      optional: true,
    };
    return;
  }
  const resp = ctx.response;
  if (resp === null || resp === undefined) return false;
  splay(g, target, COLORS[resp as number], 'right');
  return true;
});

// =======================================================================
// Machine Tools — "Draw and score a card of value equal to the highest
// card in your score pile." (Empty score pile → age 1 floor, mirrors VB6.)
// =======================================================================
registerDogma('Machine Tools', (g, target) => {
  const p = g.players[target];
  let age = 1;
  for (const id of p.scorePile) {
    const a = cardById(id).age;
    if (a > age) age = a;
  }
  drawAndScore(g, target, age);
  return true;
});

// =======================================================================
// Metric System — eff0: "If your green cards are splayed right, you may
//                       splay any color of your cards right."
//                 eff1: splay green right (yes/no).
// =======================================================================
registerDogma('Metric System', (g, target, ctx) => {
  if (ctx.levelIndex === 0) {
    if (g.players[target].piles.green.splay !== 'right') return false;
    if (!ctx.handlerState.asked) {
      const eligible: Color[] = [];
      for (const c of COLORS) {
        const s = g.players[target].piles[c];
        if (s.cards.length >= 2 && s.splay !== 'right') eligible.push(c);
      }
      if (eligible.length === 0) return false;
      ctx.handlerState.asked = true;
      ctx.pendingChoice = {
        kind: 'select-board-color',
        prompt: 'Metric System: splay any one color of your cards right?',
        playerId: target,
        options: eligible.map((c) => COLORS.indexOf(c)),
        optional: true,
      };
      return;
    }
    const resp = ctx.response;
    if (resp === null || resp === undefined) return false;
    splay(g, target, COLORS[resp as number], 'right');
    return true;
  }
  // eff1
  const gp = g.players[target].piles.green;
  if (gp.cards.length < 2 || gp.splay === 'right') return false;
  if (!ctx.handlerState.asked) {
    ctx.handlerState.asked = true;
    ctx.pendingChoice = {
      kind: 'yes-no',
      prompt: 'Metric System: splay your green cards right?',
      playerId: target,
      options: [],
      optional: false,
    };
    return;
  }
  if (ctx.response !== true) return false;
  splay(g, target, 'green', 'right');
  return true;
});

// =======================================================================
// Vaccination — eff0 (demand): return all the lowest cards in your score
//                pile; if you returned any, draw and meld a 6.
//               eff1: if any card was returned (demandSuccessful),
//                     activator draws and melds a 7.
// =======================================================================
registerDogma('Vaccination', (g, target, ctx) => {
  if (ctx.levelIndex === 0) {
    const p = g.players[target];
    if (p.scorePile.length === 0) return false;
    let lowest = Infinity;
    for (const id of p.scorePile) {
      const a = cardById(id).age;
      if (a < lowest) lowest = a;
    }
    const lows = p.scorePile.filter((id) => cardById(id).age === lowest);
    if (lows.length === 0) return false;
    for (const id of lows) returnFromScore(g, target, id);
    g.dogmaRun!.demandSuccessful = true;
    if (g.endByDraw) return true;
    drawAndMeld(g, target, 6);
    return true;
  }
  // eff1 (non-demand share) — only meaningful if the demand actually fired.
  if (!g.dogmaRun!.demandSuccessful) return false;
  drawAndMeld(g, target, 7);
  return true;
});

// Re-export to silence "unused" warnings if any helper drifts. (No-op
// at runtime.)
export const _age6 = { drawAndTuck };
// Silence unused-helper warning when ChoiceResponse type isn't directly
// referenced after refactor — keep the import for future use.
export type _CR = ChoiceResponse;
