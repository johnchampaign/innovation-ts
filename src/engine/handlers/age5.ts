// Age 5 dogma handlers. Ported 1:1 from the C# reference handlers in
// Innovation.Core/Handlers/*.cs. Cards covered (all ten Age-5 titles):
//
//   Astronomy        — AstronomyDrawMeldHandler + AstronomyUniverseHandler
//   Banking          — BankingDemandHandler + BankingSplayHandler
//   Chemistry        — ChemistrySplayHandler + ChemistryDrawScoreReturnHandler
//   Coal             — CoalTuckHandler + CoalSplayHandler + CoalScorePairHandler
//   Measurement      — MeasurementHandler
//   Physics          — PhysicsHandler
//   The Pirate Code  — PirateCodeDemandHandler + PirateCodeScoreIfDemandHandler
//   Societies        — SocietiesDemandHandler
//   Statistics       — StatisticsDemandHandler + StatisticsSplayHandler
//   Steam Engine     — SteamEngineHandler
//
// Multi-effect cards use one title-keyed handler that branches on
// `ctx.levelIndex`. Splay-right "you may" effects always show a yes/no
// prompt for symmetry with the C# behaviour, gated on pile-size ≥2 and
// not-already-right-splayed.

import { registerDogma } from '../registry';
import { cardById } from '../../card-data';
import {
  claimSpecialAchievement,
  draw,
  drawAndScore,
  hasIcon,
  highestTopAge,
  meldFromHand,
  returnFromHand,
  returnFromScore,
  scoreFromBoard,
  splay,
  transferBoardToBoard,
  transferScoreToScore,
  tuckFromHand,
} from '../mechanics';
import { COLORS } from '../types';
import type { Color, IconName } from '../types';

// --- helpers ---------------------------------------------------------------
function drawAndTuck(
  g: import('../types').InnovationState,
  playerId: string,
  age: number,
): number | null {
  const id = draw(g, playerId, age);
  if (id === null) return null;
  tuckFromHand(g, playerId, id);
  return id;
}

function topOf(
  g: import('../types').InnovationState,
  pid: string,
  color: Color,
): number | null {
  const c = g.players[pid].piles[color].cards;
  return c.length > 0 ? c[0] : null;
}

function eligibleColorsForDemand(
  g: import('../types').InnovationState,
  pid: string,
  excludeColor: Color,
  requiredIcon: IconName,
): Color[] {
  const out: Color[] = [];
  for (const c of COLORS) {
    if (c === excludeColor) continue;
    const top = topOf(g, pid, c);
    if (top === null) continue;
    if (hasIcon(top, requiredIcon)) out.push(c);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Astronomy — Purple/Lightbulb
//   eff 0: Draw and reveal a 6. If green or blue, meld and repeat.
//   eff 1: If all non-purple top cards are value 6+, claim Universe.
// ---------------------------------------------------------------------------
registerDogma('Astronomy', (g, target, ctx) => {
  if (ctx.levelIndex === 0) {
    let progressed = false;
    while (true) {
      const id = draw(g, target, 6);
      if (id === null) return progressed;
      progressed = true;
      const color = cardById(id).color;
      if (color !== 'green' && color !== 'blue') return progressed;
      meldFromHand(g, target, id);
      if (g.endByDraw || g.winnerOverride) return progressed;
    }
  }
  // eff 1: Universe achievement
  for (const c of COLORS) {
    if (c === 'purple') continue;
    const top = topOf(g, target, c);
    if (top === null) return false;
    if (cardById(top).age < 6) return false;
  }
  return claimSpecialAchievement(g, target, 'Universe');
});

// ---------------------------------------------------------------------------
// Banking — Green/Crown
//   eff 0 demand: transfer top non-green [Factory] from your board to mine.
//                 If you do, target draws and scores a 5.
//   eff 1: You may splay your green cards right.
// ---------------------------------------------------------------------------
registerDogma('Banking', (g, target, ctx) => {
  if (ctx.levelIndex === 0) {
    if (!ctx.handlerState.asked) {
      const eligible = eligibleColorsForDemand(g, target, 'green', 'factory');
      if (eligible.length === 0) return false;
      ctx.handlerState.asked = true;
      ctx.handlerState.activatingPlayerId = g.dogmaRun!.activatingPlayerId;
      ctx.pendingChoice = {
        kind: 'select-board-color',
        prompt: 'Banking: transfer a top non-green [Factory] card to the activator\'s board.',
        playerId: target,
        options: eligible.map((c) => COLORS.indexOf(c)),
        optional: false,
      };
      return;
    }
    const colorIdx = ctx.response as number;
    const color = COLORS[colorIdx];
    const activatorId = ctx.handlerState.activatingPlayerId as string;
    const moved = transferBoardToBoard(g, target, activatorId, color);
    if (!moved) return false;
    g.dogmaRun!.demandSuccessful = true;
    if (g.endByDraw || g.winnerOverride) return true;
    drawAndScore(g, target, 5);
    return true;
  }
  // eff 1: splay green right (optional yes/no)
  return splayRightOptional(g, target, ctx, 'green', 'Banking');
});

// ---------------------------------------------------------------------------
// Chemistry — Blue/Factory
//   eff 0: You may splay your blue cards right.
//   eff 1: Draw and score (highestTop+1), then return a card from your score.
// ---------------------------------------------------------------------------
registerDogma('Chemistry', (g, target, ctx) => {
  if (ctx.levelIndex === 0) {
    return splayRightOptional(g, target, ctx, 'blue', 'Chemistry');
  }
  // eff 1
  if (!ctx.handlerState.drew) {
    const startAge = Math.max(1, highestTopAge(g.players[target]) + 1);
    drawAndScore(g, target, startAge);
    if (g.endByDraw || g.winnerOverride) return true;
    const sp = g.players[target].scorePile;
    if (sp.length === 0) return true;
    ctx.handlerState.drew = true;
    ctx.pendingChoice = {
      kind: 'select-score-card',
      prompt: 'Chemistry: return a card from your score pile.',
      playerId: target,
      options: [...sp],
      optional: false,
    };
    return;
  }
  const resp = ctx.response;
  if (resp === null || resp === undefined) return true;
  returnFromScore(g, target, resp as number);
  return true;
});

// ---------------------------------------------------------------------------
// Coal — Red/Factory
//   eff 0: Draw and tuck a 5.
//   eff 1: You may splay your red cards right.
//   eff 2: You may score any top card; if you do, also score the card beneath.
// ---------------------------------------------------------------------------
registerDogma('Coal', (g, target, ctx) => {
  if (ctx.levelIndex === 0) {
    const id = drawAndTuck(g, target, 5);
    return id !== null;
  }
  if (ctx.levelIndex === 1) {
    return splayRightOptional(g, target, ctx, 'red', 'Coal');
  }
  // eff 2: score top + the card beneath
  if (!ctx.handlerState.asked) {
    const eligible: Color[] = [];
    for (const c of COLORS) {
      if (g.players[target].piles[c].cards.length > 0) eligible.push(c);
    }
    if (eligible.length === 0) return false;
    ctx.handlerState.asked = true;
    ctx.pendingChoice = {
      kind: 'select-board-color',
      prompt: 'Coal: score a top card (and the card beneath it)?',
      playerId: target,
      options: eligible.map((c) => COLORS.indexOf(c)),
      optional: true,
    };
    return;
  }
  const resp = ctx.response;
  if (resp === null || resp === undefined) return false;
  const color = COLORS[resp as number];
  const pile = g.players[target].piles[color];
  if (pile.cards.length === 0) return false;
  const top = pile.cards[0];
  scoreFromBoard(g, target, color, top);
  if (g.endByDraw || g.winnerOverride) return true;
  if (pile.cards.length > 0) {
    const next = pile.cards[0];
    scoreFromBoard(g, target, color, next);
  }
  return true;
});

// ---------------------------------------------------------------------------
// Measurement — Green/Lightbulb (single effect)
//   "You may return a card from your hand. If you do, splay any one color of
//    your cards right, and draw a card of value equal to the number of cards
//    of that color on your board."
// ---------------------------------------------------------------------------
registerDogma('Measurement', (g, target, ctx) => {
  if (!ctx.handlerState.step) {
    if (g.players[target].hand.length === 0) return false;
    ctx.handlerState.step = 'return';
    ctx.pendingChoice = {
      kind: 'select-hand-card',
      prompt: 'Measurement: return a card from your hand?',
      playerId: target,
      options: [...g.players[target].hand],
      optional: true,
    };
    return;
  }
  if (ctx.handlerState.step === 'return') {
    const resp = ctx.response;
    if (resp === null || resp === undefined) return false;
    returnFromHand(g, target, resp as number);
    if (g.endByDraw || g.winnerOverride) return true;
    const eligible: Color[] = [];
    for (const c of COLORS) {
      if (g.players[target].piles[c].cards.length >= 2) eligible.push(c);
    }
    if (eligible.length === 0) return true;
    ctx.handlerState.step = 'splay';
    ctx.pendingChoice = {
      kind: 'select-board-color',
      prompt: 'Measurement: splay a color right (and draw a card of value equal to that pile\'s size).',
      playerId: target,
      options: eligible.map((c) => COLORS.indexOf(c)),
      optional: true,
    };
    return;
  }
  // step === 'splay'
  const resp = ctx.response;
  if (resp === null || resp === undefined) return true;
  const color = COLORS[resp as number];
  splay(g, target, color, 'right');
  if (g.endByDraw || g.winnerOverride) return true;
  const count = g.players[target].piles[color].cards.length;
  draw(g, target, Math.min(10, Math.max(1, count)));
  return true;
});

// ---------------------------------------------------------------------------
// Physics — Blue/Lightbulb (single effect)
//   "Draw three 6 and reveal them. If two or more of the drawn cards are of
//    the same color, return the drawn cards and all the cards in your hand.
//    Otherwise, keep them."
// ---------------------------------------------------------------------------
registerDogma('Physics', (g, target, ctx) => {
  if (!ctx.handlerState.phase) {
    const drawn: number[] = [];
    for (let i = 0; i < 3; i++) {
      const id = draw(g, target, 6);
      if (id === null) return true;
      drawn.push(id);
    }
    const seen = new Set<Color>();
    let dup = false;
    for (const id of drawn) {
      const c = cardById(id).color;
      if (seen.has(c)) { dup = true; break; }
      seen.add(c);
    }
    if (!dup) return true; // keep them
    // Return entire hand. Phase-2 simplification (matches Tools/Antibiotics/etc):
    // skip the order-pick prompt; return in current hand order.
    const hand = [...g.players[target].hand];
    for (const id of hand) returnFromHand(g, target, id);
    return true;
  }
  return true;
});

// ---------------------------------------------------------------------------
// The Pirate Code — Red/Crown
//   eff 0 demand: transfer two cards of value ≤4 from your score to my score.
//   eff 1: If any card was transferred, score the lowest top [Crown] from
//          your board.
// ---------------------------------------------------------------------------
registerDogma('The Pirate Code', (g, target, ctx) => {
  if (ctx.levelIndex === 0) {
    if (!ctx.handlerState.step) {
      const eligible = g.players[target].scorePile.filter((id) => cardById(id).age <= 4);
      if (eligible.length === 0) return false;
      ctx.handlerState.step = 'first';
      ctx.handlerState.activatingPlayerId = g.dogmaRun!.activatingPlayerId;
      ctx.pendingChoice = {
        kind: 'select-score-card',
        prompt: 'Pirate Code: transfer a card of value 4 or less from your score pile (1 of 2).',
        playerId: target,
        options: eligible,
        optional: false,
      };
      return;
    }
    if (ctx.handlerState.step === 'first') {
      const id1 = ctx.response as number;
      const activatorId = ctx.handlerState.activatingPlayerId as string;
      transferScoreToScore(g, target, activatorId, id1);
      g.dogmaRun!.demandSuccessful = true;
      if (g.endByDraw || g.winnerOverride) return true;
      const eligible2 = g.players[target].scorePile.filter((cid) => cardById(cid).age <= 4);
      if (eligible2.length === 0) return true;
      ctx.handlerState.step = 'second';
      ctx.pendingChoice = {
        kind: 'select-score-card',
        prompt: 'Pirate Code: transfer a second card of value 4 or less from your score pile.',
        playerId: target,
        options: eligible2,
        optional: false,
      };
      return;
    }
    // step === 'second'
    const id2 = ctx.response as number;
    const activatorId = ctx.handlerState.activatingPlayerId as string;
    transferScoreToScore(g, target, activatorId, id2);
    return true;
  }
  // eff 1: lowest top crown
  if (!g.dogmaRun!.demandSuccessful) return false;
  if (!ctx.handlerState.asked) {
    let lowest = Infinity;
    const atLowest: Color[] = [];
    for (const c of COLORS) {
      const top = topOf(g, target, c);
      if (top === null) continue;
      const card = cardById(top);
      if (!hasIcon(top, 'crown')) continue;
      if (card.age < lowest) { lowest = card.age; atLowest.length = 0; atLowest.push(c); }
      else if (card.age === lowest) atLowest.push(c);
    }
    if (atLowest.length === 0) return false;
    if (atLowest.length === 1) {
      const c = atLowest[0];
      scoreFromBoard(g, target, c, topOf(g, target, c)!);
      return true;
    }
    ctx.handlerState.asked = true;
    ctx.pendingChoice = {
      kind: 'select-board-color',
      prompt: `Pirate Code: choose which of your age-${lowest} top crown cards to score.`,
      playerId: target,
      options: atLowest.map((c) => COLORS.indexOf(c)),
      optional: false,
    };
    return;
  }
  const color = COLORS[ctx.response as number];
  const top = topOf(g, target, color);
  if (top === null) return false;
  scoreFromBoard(g, target, color, top);
  return true;
});

// ---------------------------------------------------------------------------
// Societies — Purple/Crown (single effect, demand)
//   "I demand you transfer a top non-purple card with a [Lightbulb] from your
//    board to my board! If you do, draw a 5!" (target draws)
// ---------------------------------------------------------------------------
registerDogma('Societies', (g, target, ctx) => {
  if (!ctx.handlerState.asked) {
    const eligible = eligibleColorsForDemand(g, target, 'purple', 'lightbulb');
    if (eligible.length === 0) return false;
    ctx.handlerState.asked = true;
    ctx.handlerState.activatingPlayerId = g.dogmaRun!.activatingPlayerId;
    ctx.pendingChoice = {
      kind: 'select-board-color',
      prompt: 'Societies: transfer a top non-purple [Lightbulb] card to the activator\'s board.',
      playerId: target,
      options: eligible.map((c) => COLORS.indexOf(c)),
      optional: false,
    };
    return;
  }
  const color = COLORS[ctx.response as number];
  const activatorId = ctx.handlerState.activatingPlayerId as string;
  const moved = transferBoardToBoard(g, target, activatorId, color);
  if (!moved) return false;
  g.dogmaRun!.demandSuccessful = true;
  if (g.endByDraw || g.winnerOverride) return true;
  draw(g, target, 5);
  return true;
});

// ---------------------------------------------------------------------------
// Statistics — Yellow/Leaf
//   eff 0 demand: draw the highest card in your score pile (= move to hand).
//                 If you do and have exactly 1 card in hand afterwards, repeat.
//   eff 1: You may splay your yellow cards right.
// ---------------------------------------------------------------------------
registerDogma('Statistics', (g, target, ctx) => {
  if (ctx.levelIndex === 0) {
    // Resume from a tied-pick pause?
    if (ctx.handlerState.awaitingPick) {
      const id = ctx.response as number;
      const p = g.players[target];
      const i = p.scorePile.indexOf(id);
      if (i >= 0) {
        p.scorePile.splice(i, 1);
        p.hand.push(id);
        g.dogmaRun!.demandSuccessful = true;
        ctx.handlerState.any = true;
      }
      ctx.handlerState.awaitingPick = false;
      if (p.hand.length !== 1) return ctx.handlerState.any === true ? true : false;
      // else fall through and continue looping
    }

    // Main loop: try to auto-pull until either done or we need to pause.
    while (true) {
      const p = g.players[target];
      if (p.scorePile.length === 0) return ctx.handlerState.any === true ? true : false;
      let highest = 0;
      for (const id of p.scorePile) {
        const a = cardById(id).age;
        if (a > highest) highest = a;
      }
      const tied = p.scorePile.filter((id) => cardById(id).age === highest);
      if (tied.length === 1) {
        const id = tied[0];
        const i = p.scorePile.indexOf(id);
        p.scorePile.splice(i, 1);
        p.hand.push(id);
        g.dogmaRun!.demandSuccessful = true;
        ctx.handlerState.any = true;
        if (p.hand.length !== 1) return true;
        continue;
      }
      // Multiple tied — pause for pick.
      ctx.handlerState.awaitingPick = true;
      ctx.pendingChoice = {
        kind: 'select-score-card',
        prompt: `Statistics: choose which of your age-${highest} cards to move to your hand.`,
        playerId: target,
        options: tied,
        optional: false,
      };
      return;
    }
  }
  // eff 1: splay yellow right
  return splayRightOptional(g, target, ctx, 'yellow', 'Statistics');
});

// ---------------------------------------------------------------------------
// Steam Engine — Yellow/Factory (single effect)
//   "Draw and tuck two 4, then score your bottom yellow card."
// ---------------------------------------------------------------------------
registerDogma('Steam Engine', (g, target) => {
  for (let i = 0; i < 2; i++) {
    const id = drawAndTuck(g, target, 4);
    if (id === null || g.endByDraw || g.winnerOverride) return true;
  }
  const yellow = g.players[target].piles.yellow.cards;
  if (yellow.length === 0) return true;
  const bottom = yellow[yellow.length - 1];
  scoreFromBoard(g, target, 'yellow', bottom);
  return true;
});

// ---------------------------------------------------------------------------
// Shared helper for the "You may splay COLOR right" effects (Banking eff1,
// Chemistry eff0, Coal eff1, Statistics eff1). Pauses on yes/no when valid.
// ---------------------------------------------------------------------------
function splayRightOptional(
  g: import('../types').InnovationState,
  target: string,
  ctx: import('../types').EffectContext,
  color: Color,
  label: string,
): boolean | void {
  const pile = g.players[target].piles[color];
  if (pile.cards.length < 2 || pile.splay === 'right') return false;
  if (!ctx.handlerState.asked) {
    ctx.handlerState.asked = true;
    ctx.pendingChoice = {
      kind: 'yes-no',
      prompt: `${label}: splay your ${color} cards right?`,
      playerId: target,
      options: [],
      optional: false,
    };
    return;
  }
  if (ctx.response !== true) return false;
  splay(g, target, color, 'right');
  return true;
}
