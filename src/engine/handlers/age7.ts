// Age 7 dogma handlers. Ported from C# Innovation.Core/Handlers/*.cs:
//   Bicycle              — BicycleHandler.cs
//   Combustion (demand)  — CombustionDemandHandler.cs
//   Electricity          — ElectricityHandler.cs
//   Evolution            — EvolutionHandler.cs
//   Explosives (demand)  — ExplosivesDemandHandler.cs
//   Lighting             — LightingHandler.cs
//   Publications (×2)    — PublicationsRearrangeHandler.cs + PublicationsSplayHandler.cs
//   Railroad (×2)        — RailroadReturnAndDrawHandler.cs + RailroadSplayUpHandler.cs
//   Refrigeration (×2)   — RefrigerationDemandHandler.cs + RefrigerationScoreHandler.cs
//   Sanitation (demand)  — SanitationDemandHandler.cs
//
// Consistent with the Phase-2 cuts in age1.ts, on-tie order-pick prompts for
// returns/tucks are skipped — the cards proceed in subset-response order.

import { registerDogma } from '../registry';
import { cardById } from '../../card-data';
import {
  draw, drawAndScore, hasIcon, returnFromBoard, returnFromHand,
  returnFromScore, reorderPile, scoreFromHand, splay, transferHandToHand,
  transferScoreToScore, tuckFromHand,
} from '../mechanics';
import { COLORS } from '../types';
import type { ChoiceResponse, Color } from '../types';

// Bicycle — "You may exchange all the cards in your hand with all the cards
// in your score pile."
registerDogma('Bicycle', (g, target, ctx) => {
  if (!ctx.handlerState.asked) {
    const p = g.players[target];
    if (p.hand.length === 0 && p.scorePile.length === 0) return false;
    ctx.handlerState.asked = true;
    ctx.pendingChoice = {
      kind: 'yes-no',
      prompt: 'Bicycle: exchange all cards in your hand with your entire score pile?',
      playerId: target,
      options: [],
      optional: false,
    };
    return;
  }
  if (ctx.response !== true) return false;
  const p = g.players[target];
  const hand = [...p.hand];
  const score = [...p.scorePile];
  p.hand = [...score];
  p.scorePile = [...hand];
  return true;
});

// Combustion (demand) — transfer two cards from target's score pile to
// activator's score pile (or as many as they have if fewer than 2).
registerDogma('Combustion', (g, target, ctx) => {
  if (!ctx.handlerState.asked) {
    const score = g.players[target].scorePile;
    if (score.length === 0) return false;
    const n = Math.min(2, score.length);
    ctx.handlerState.asked = true;
    ctx.handlerState.activatingPlayerId = g.dogmaRun!.activatingPlayerId;
    ctx.pendingChoice = {
      kind: 'select-score-card-subset',
      prompt: `Combustion: transfer ${n} card(s) from your score pile to the activator's score pile.`,
      playerId: target,
      options: [...score],
      optional: false,
      minCount: n,
      maxCount: n,
    };
    return;
  }
  const resp = ctx.response;
  if (!Array.isArray(resp) || resp.length === 0) return false;
  const activatorId = ctx.handlerState.activatingPlayerId as string;
  for (const id of resp) transferScoreToScore(g, target, activatorId, id);
  g.dogmaRun!.demandSuccessful = true;
  return true;
});

// Electricity — "Return all your top cards without a [Factory], then draw an
// 8 for each card you returned." Auto, no choice.
registerDogma('Electricity', (g, target) => {
  const p = g.players[target];
  let returned = 0;
  for (const c of COLORS) {
    const top = p.piles[c].cards[0];
    if (top === undefined) continue;
    if (hasIcon(top, 'factory')) continue;
    returnFromBoard(g, target, c, top);
    returned++;
  }
  for (let i = 0; i < returned; i++) {
    draw(g, target, 8);
    if (g.endByDraw) break;
  }
  return returned > 0;
});

// Evolution — "You may choose to either draw and score an 8 and then return a
// card from your score pile, OR draw a card of value one higher than the
// highest card in your score pile."
registerDogma('Evolution', (g, target, ctx) => {
  const step = ctx.handlerState.step as string | undefined;
  if (!step) {
    ctx.handlerState.step = 'branch';
    ctx.pendingChoice = {
      kind: 'yes-no',
      prompt: 'Evolution: yes = draw+score an 8 then return a score-pile card; '
        + 'no = draw a card one higher than the highest in your score pile.',
      playerId: target,
      options: [],
      optional: false,
    };
    return;
  }
  if (step === 'branch') {
    if (ctx.response === true) {
      // Branch A: draw and score an 8, then return a score-pile card.
      drawAndScore(g, target, 8);
      if (g.endByDraw) return true;
      const score = g.players[target].scorePile;
      if (score.length === 0) return true;
      ctx.handlerState.step = 'return';
      ctx.pendingChoice = {
        kind: 'select-score-card',
        prompt: 'Evolution: return a card from your score pile.',
        playerId: target,
        options: [...score],
        optional: false,
      };
      return;
    }
    // Branch B: draw highestScoreAge + 1.
    const score = g.players[target].scorePile;
    if (score.length === 0) return false;
    const highest = Math.max(...score.map((id) => cardById(id).age));
    draw(g, target, highest + 1);
    return true;
  }
  // step === 'return': resolve branch-A score-pile return.
  const cid = ctx.response;
  if (cid === null || cid === undefined) return true;
  returnFromScore(g, target, cid as number);
  return true;
});

// Explosives (demand) — "I demand you transfer your three highest cards from
// your hand to my hand! If you do, and then have no cards in hand, draw a 7!"
registerDogma('Explosives', (g, target, ctx) => {
  if (!ctx.handlerState.asked) {
    const hand = g.players[target].hand;
    if (hand.length === 0) return false;
    const take = Math.min(3, hand.length);
    // Identify forced (strictly above threshold) and tied (at threshold).
    const sorted = [...hand].sort((a, b) => cardById(b).age - cardById(a).age);
    const thresholdAge = cardById(sorted[take - 1]).age;
    const forced = hand.filter((id) => cardById(id).age > thresholdAge);
    const tied = hand.filter((id) => cardById(id).age === thresholdAge);
    const tieSlots = take - forced.length;
    const activatorId = g.dogmaRun!.activatingPlayerId;
    ctx.handlerState.activatingPlayerId = activatorId;

    // Transfer forced picks immediately.
    for (const id of forced) transferHandToHand(g, target, activatorId, id);

    if (tied.length === tieSlots) {
      // No choice needed — transfer them all.
      for (const id of tied) transferHandToHand(g, target, activatorId, id);
      if (forced.length + tied.length > 0) g.dogmaRun!.demandSuccessful = true;
      if (g.players[target].hand.length === 0) {
        draw(g, target, 7);
      }
      return true;
    }
    // Need defender to pick tied subset.
    if (forced.length > 0) g.dogmaRun!.demandSuccessful = true;
    ctx.handlerState.asked = true;
    ctx.pendingChoice = {
      kind: 'select-hand-card-subset',
      prompt: `Explosives: choose ${tieSlots} of your age-${thresholdAge} cards to transfer.`,
      playerId: target,
      options: tied,
      optional: false,
      minCount: tieSlots,
      maxCount: tieSlots,
    };
    return;
  }
  const resp = ctx.response;
  const activatorId = ctx.handlerState.activatingPlayerId as string;
  if (Array.isArray(resp)) {
    for (const id of resp) transferHandToHand(g, target, activatorId, id);
    if (resp.length > 0) g.dogmaRun!.demandSuccessful = true;
  }
  if (g.players[target].hand.length === 0) {
    draw(g, target, 7);
  }
  return true;
});

// Lighting — "You may tuck up to three cards from your hand. If you do, draw
// and score a 7 for every different value of card you tucked." Order-pick
// for shared-color ties skipped (Phase-2 cut, like Tools/Masonry).
registerDogma('Lighting', (g, target, ctx) => {
  if (!ctx.handlerState.asked) {
    const hand = g.players[target].hand;
    if (hand.length === 0) return false;
    ctx.handlerState.asked = true;
    ctx.pendingChoice = {
      kind: 'select-hand-card-subset',
      prompt: 'Lighting: tuck up to 3 cards; draw and score a 7 for each distinct age tucked.',
      playerId: target,
      options: [...hand],
      optional: true,
      minCount: 0,
      maxCount: Math.min(3, hand.length),
    };
    return;
  }
  const resp = ctx.response;
  if (!Array.isArray(resp) || resp.length === 0) return false;
  const distinctAges = new Set<number>();
  for (const id of resp) {
    distinctAges.add(cardById(id).age);
    tuckFromHand(g, target, id);
    if (g.endByDraw) return true;
  }
  for (let i = 0; i < distinctAges.size; i++) {
    drawAndScore(g, target, 7);
    if (g.endByDraw) break;
  }
  return true;
});

// Publications — TWO effects:
//   level 0: "You may rearrange the order of one color of cards on your board."
//   level 1: "You may splay your yellow or blue cards up."
registerDogma('Publications', (g, target, ctx) => {
  if (ctx.levelIndex === 0) {
    const step = ctx.handlerState.step as string | undefined;
    if (!step) {
      const eligible: number[] = [];
      for (const c of COLORS) {
        if (g.players[target].piles[c].cards.length >= 2) eligible.push(COLORS.indexOf(c));
      }
      if (eligible.length === 0) return false;
      ctx.handlerState.step = 'color';
      ctx.pendingChoice = {
        kind: 'select-board-color',
        prompt: 'Publications: choose a color pile to rearrange.',
        playerId: target,
        options: eligible,
        optional: true,
      };
      return;
    }
    if (step === 'color') {
      const resp = ctx.response;
      if (resp === null || resp === undefined) return false;
      const color = COLORS[resp as number];
      ctx.handlerState.color = color;
      ctx.handlerState.step = 'order';
      ctx.pendingChoice = {
        kind: 'select-card-order',
        prompt: `Publications: set the new top-to-bottom order of your ${color} pile.`,
        playerId: target,
        options: [...g.players[target].piles[color].cards],
        optional: false,
      };
      return;
    }
    // step === 'order'
    const resp = ctx.response;
    if (Array.isArray(resp) && resp.length > 0) {
      const color = ctx.handlerState.color as Color;
      reorderPile(g, target, color, resp);
    }
    return true;
  }
  // level 1
  if (!ctx.handlerState.asked) {
    const eligible: number[] = [];
    for (const c of ['yellow', 'blue'] as Color[]) {
      const pile = g.players[target].piles[c];
      if (pile.cards.length >= 2 && pile.splay !== 'up') eligible.push(COLORS.indexOf(c));
    }
    if (eligible.length === 0) return false;
    ctx.handlerState.asked = true;
    ctx.pendingChoice = {
      kind: 'select-board-color',
      prompt: 'Publications: splay your yellow or blue cards up?',
      playerId: target,
      options: eligible,
      optional: true,
    };
    return;
  }
  const resp = ctx.response;
  if (resp === null || resp === undefined) return false;
  return splay(g, target, COLORS[resp as number], 'up');
});

// Railroad — TWO effects:
//   level 0: "Return all cards from your hand, then draw three 6s."
//   level 1: "You may splay up any one color of your cards currently splayed right."
registerDogma('Railroad', (g, target, ctx) => {
  if (ctx.levelIndex === 0) {
    const hand = [...g.players[target].hand];
    for (const id of hand) {
      returnFromHand(g, target, id);
      if (g.endByDraw) return true;
    }
    for (let i = 0; i < 3; i++) {
      draw(g, target, 6);
      if (g.endByDraw) return true;
    }
    return true;
  }
  // level 1
  if (!ctx.handlerState.asked) {
    const eligible: number[] = [];
    for (const c of COLORS) {
      if (g.players[target].piles[c].splay === 'right') eligible.push(COLORS.indexOf(c));
    }
    if (eligible.length === 0) return false;
    ctx.handlerState.asked = true;
    ctx.pendingChoice = {
      kind: 'select-board-color',
      prompt: 'Railroad: splay one of your right-splayed colors up.',
      playerId: target,
      options: eligible,
      optional: true,
    };
    return;
  }
  const resp = ctx.response;
  if (resp === null || resp === undefined) return false;
  return splay(g, target, COLORS[resp as number], 'up');
});

// Refrigeration — TWO effects:
//   level 0 (demand): "I demand you return half (rounded down) of the cards in your hand!"
//   level 1:          "You may score a card from your hand."
registerDogma('Refrigeration', (g, target, ctx) => {
  if (ctx.levelIndex === 0) {
    if (!ctx.handlerState.asked) {
      const hand = g.players[target].hand;
      const n = Math.floor(hand.length / 2);
      if (n === 0) return false;
      ctx.handlerState.asked = true;
      ctx.pendingChoice = {
        kind: 'select-hand-card-subset',
        prompt: `Refrigeration: return ${n} card(s) from your hand.`,
        playerId: target,
        options: [...hand],
        optional: false,
        minCount: n,
        maxCount: n,
      };
      return;
    }
    const resp = ctx.response;
    if (!Array.isArray(resp) || resp.length === 0) return false;
    for (const id of resp) returnFromHand(g, target, id);
    g.dogmaRun!.demandSuccessful = true;
    return true;
  }
  // level 1
  if (!ctx.handlerState.asked) {
    const hand = g.players[target].hand;
    if (hand.length === 0) return false;
    ctx.handlerState.asked = true;
    ctx.pendingChoice = {
      kind: 'select-hand-card',
      prompt: 'Refrigeration: you may score a card from your hand.',
      playerId: target,
      options: [...hand],
      optional: true,
    };
    return;
  }
  const resp = ctx.response;
  if (resp === null || resp === undefined) return false;
  scoreFromHand(g, target, resp as number);
  return true;
});

// Sanitation (demand) — "I demand you exchange the two highest cards in your
// hand with the lowest card in my hand!" Multi-step:
//   1. Take target's 2 highest (with tie-pick if needed) → activator's hand
//   2. Activator gives their lowest hand card → target (with tie-pick if needed)
// Activator picks are from their hand AS IT STOOD before the transfer.
registerDogma('Sanitation', (g, target, ctx) => {
  const step = ctx.handlerState.step as string | undefined;
  const activatorId = g.dogmaRun!.activatingPlayerId;

  if (!step) {
    // Snapshot activator's hand before any transfers.
    ctx.handlerState.activatorOrig = [...g.players[activatorId].hand];

    const targetHand = g.players[target].hand;
    const take = Math.min(2, targetHand.length);
    if (take === 0) {
      // Skip to activator pick.
      return sanitationActivatorPick(g, target, activatorId, ctx);
    }
    const sorted = [...targetHand].sort((a, b) => cardById(b).age - cardById(a).age);
    const thresholdAge = cardById(sorted[take - 1]).age;
    const forced = targetHand.filter((id) => cardById(id).age > thresholdAge);
    const tied = targetHand.filter((id) => cardById(id).age === thresholdAge);
    const tieSlots = take - forced.length;

    for (const id of forced) transferHandToHand(g, target, activatorId, id);
    if (forced.length > 0 || tied.length > 0) g.dogmaRun!.demandSuccessful = true;

    if (tied.length === tieSlots) {
      for (const id of tied) transferHandToHand(g, target, activatorId, id);
      return sanitationActivatorPick(g, target, activatorId, ctx);
    }
    ctx.handlerState.step = 'defenderTied';
    ctx.pendingChoice = {
      kind: 'select-hand-card-subset',
      prompt: `Sanitation: choose ${tieSlots} of your age-${thresholdAge} cards to send.`,
      playerId: target,
      options: tied,
      optional: false,
      minCount: tieSlots,
      maxCount: tieSlots,
    };
    return;
  }

  if (step === 'defenderTied') {
    const resp = ctx.response;
    if (Array.isArray(resp)) {
      for (const id of resp) transferHandToHand(g, target, activatorId, id);
    }
    return sanitationActivatorPick(g, target, activatorId, ctx);
  }

  // step === 'activatorTied'
  const resp = ctx.response;
  if (resp !== null && resp !== undefined) {
    transferHandToHand(g, activatorId, target, resp as number);
  }
  return true;
});

function sanitationActivatorPick(
  g: import('../types').InnovationState,
  target: string,
  activatorId: string,
  ctx: import('../types').EffectContext,
): boolean | void {
  const orig = ctx.handlerState.activatorOrig as number[];
  const activator = g.players[activatorId];
  const eligible = orig.filter((id) => activator.hand.includes(id));
  if (eligible.length === 0) return true;
  const lowest = Math.min(...eligible.map((id) => cardById(id).age));
  const tied = eligible.filter((id) => cardById(id).age === lowest);
  if (tied.length === 1) {
    transferHandToHand(g, activatorId, target, tied[0]);
    return true;
  }
  ctx.handlerState.step = 'activatorTied';
  ctx.pendingChoice = {
    kind: 'select-hand-card',
    prompt: `Sanitation: choose which of your age-${lowest} cards to send to the defender.`,
    playerId: activatorId,
    options: tied,
    optional: false,
  };
  return;
}

// Suppress unused import warning for ChoiceResponse — kept in type set for
// future handler edits.
export type _SilenceUnused = ChoiceResponse;
