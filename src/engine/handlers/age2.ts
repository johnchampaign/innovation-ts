// Age 2 dogma handlers. Ported from
// Innovation.Core/Handlers/{Calendar,CanalBuilding,Construction*,Currency,
// Fermenting,Mapmaking*,Mathematics,MonotheismDemand,Philosophy*,RoadBuilding}.cs
// against data/cards.tsv (rows where age == 2).
//
// Cards covered (10):
//   Calendar, Canal Building, Construction (demand + Empire),
//   Currency, Fermenting, Mapmaking (demand + conditional draw),
//   Mathematics, Monotheism (demand only — TSV effect-2 is also "draw and tuck a 1"),
//   Philosophy (splay-left + score), Road Building.
//
// Phase-2 cuts (see deferred[]):
//   - Currency / Road Building omit the order-pick for ties (Pottery/Masonry parity).
//   - Road Building auto-picks the next seat as exchange opponent in >2p.

import { registerDogma } from '../registry';
import { cardById } from '../../card-data';
import {
  claimSpecialAchievement, draw, drawAndMeld, drawAndScore,
  meldFromHand, returnFromHand, scoreFromHand, splay,
  transferHandToHand, transferScoreToHand, transferScoreToScore,
  transferHandToScore, transferBoardToScore, transferBoardToBoard,
  tuckFromHand,
} from '../mechanics';
import { countIcons } from '../icons';
import { COLORS } from '../types';
import type { Color } from '../types';

// ---------------------------------------------------------------------------
// Calendar — "If you have more cards in your score pile than in your hand,
// draw two 3s."
// ---------------------------------------------------------------------------
registerDogma('Calendar', (g, target) => {
  const p = g.players[target];
  if (p.scorePile.length <= p.hand.length) return false;
  draw(g, target, 3);
  if (g.endByDraw) return true;
  draw(g, target, 3);
  return true;
});

// ---------------------------------------------------------------------------
// Canal Building — "You may exchange all the highest cards in your hand
// with all the highest cards in your score pile."
// ---------------------------------------------------------------------------
registerDogma('Canal Building', (g, target, ctx) => {
  const p = g.players[target];
  if (p.hand.length === 0 && p.scorePile.length === 0) return false;
  if (!ctx.handlerState.asked) {
    ctx.handlerState.asked = true;
    ctx.pendingChoice = {
      kind: 'yes-no',
      prompt: 'Canal Building: exchange all highest cards in your hand with all highest cards in your score pile?',
      playerId: target,
      options: [],
      optional: false,
    };
    return;
  }
  if (ctx.response !== true) return false;
  const handHi = p.hand.length === 0 ? 0
    : Math.max(...p.hand.map((id) => cardById(id).age));
  const scoreHi = p.scorePile.length === 0 ? 0
    : Math.max(...p.scorePile.map((id) => cardById(id).age));
  const fromHand = p.hand.filter((id) => cardById(id).age === handHi);
  const fromScore = p.scorePile.filter((id) => cardById(id).age === scoreHi);
  for (const id of fromHand) transferHandToScore(g, target, target, id);
  for (const id of fromScore) transferScoreToHand(g, target, id);
  return true;
});

// ---------------------------------------------------------------------------
// Construction — TWO effects:
//   level 0 (demand): "I demand you transfer two cards from your hand to my
//                     hand, then draw a 2!"
//   level 1:          "If you are the only player with five top cards, claim
//                     the Empire achievement."
// ---------------------------------------------------------------------------
registerDogma('Construction', (g, target, ctx) => {
  if (ctx.levelIndex === 0) {
    if (!ctx.handlerState.asked) {
      const p = g.players[target];
      if (p.hand.length === 0) {
        // Per C# bug-fix: still draw a 2 as consolation.
        draw(g, target, 2);
        return true;
      }
      const n = Math.min(2, p.hand.length);
      ctx.handlerState.asked = true;
      ctx.handlerState.activatingPlayerId = g.dogmaRun!.activatingPlayerId;
      ctx.pendingChoice = {
        kind: 'select-hand-card-subset',
        prompt: `Construction: transfer ${n} cards from your hand to the activator's hand, then draw a 2.`,
        playerId: target,
        options: [...p.hand],
        optional: false,
        minCount: n,
        maxCount: n,
      };
      return;
    }
    const resp = ctx.response;
    const activatorId = ctx.handlerState.activatingPlayerId as string;
    if (Array.isArray(resp) && resp.length > 0) {
      for (const id of resp) transferHandToHand(g, target, activatorId, id);
      g.dogmaRun!.demandSuccessful = true;
    }
    if (g.endByDraw) return true;
    draw(g, target, 2);
    return true;
  }
  // level 1: Empire achievement. Activator only (non-demand share path).
  const me = g.players[target];
  for (const c of COLORS) if (me.piles[c].cards.length === 0) return false;
  for (const [pid, p] of Object.entries(g.players)) {
    if (pid === target) continue;
    let allFive = true;
    for (const c of COLORS) if (p.piles[c].cards.length === 0) { allFive = false; break; }
    if (allFive) return false;
  }
  return claimSpecialAchievement(g, target, 'Empire');
});

// ---------------------------------------------------------------------------
// Currency — "You may return any number of cards from your hand. If you do,
// draw and score a 2 for every different value of card you returned."
// ---------------------------------------------------------------------------
registerDogma('Currency', (g, target, ctx) => {
  const p = g.players[target];
  if (!ctx.handlerState.asked) {
    if (p.hand.length === 0) return false;
    ctx.handlerState.asked = true;
    ctx.pendingChoice = {
      kind: 'select-hand-card-subset',
      prompt: 'Currency: return any number of cards from your hand to draw and score a 2 for each distinct age returned.',
      playerId: target,
      options: [...p.hand],
      optional: true,
      minCount: 0,
      maxCount: p.hand.length,
    };
    return;
  }
  const resp = ctx.response;
  if (!Array.isArray(resp) || resp.length === 0) return false;
  const ages = new Set<number>();
  for (const id of resp) {
    ages.add(cardById(id).age);
    returnFromHand(g, target, id);
  }
  for (let i = 0; i < ages.size; i++) {
    drawAndScore(g, target, 2);
    if (g.endByDraw) return true;
  }
  return true;
});

// ---------------------------------------------------------------------------
// Fermenting — "Draw a 2 for every two [Leaf] icons on your board."
// ---------------------------------------------------------------------------
registerDogma('Fermenting', (g, target) => {
  const leaves = countIcons(g.players[target], 'leaf');
  const n = Math.floor(leaves / 2);
  if (n === 0) return false;
  for (let i = 0; i < n; i++) {
    draw(g, target, 2);
    if (g.endByDraw) return true;
  }
  return true;
});

// ---------------------------------------------------------------------------
// Mapmaking — TWO effects:
//   level 0 (demand): "I demand you transfer a 1 from your score pile to my
//                     score pile."
//   level 1:          "If any card was transferred due to the demand, draw
//                     and score a 1."
// ---------------------------------------------------------------------------
registerDogma('Mapmaking', (g, target, ctx) => {
  if (ctx.levelIndex === 0) {
    if (!ctx.handlerState.asked) {
      const eligible = g.players[target].scorePile.filter((id) => cardById(id).age === 1);
      if (eligible.length === 0) return false;
      ctx.handlerState.asked = true;
      ctx.handlerState.activatingPlayerId = g.dogmaRun!.activatingPlayerId;
      ctx.pendingChoice = {
        kind: 'select-score-card',
        prompt: "Mapmaking: transfer a 1 from your score pile to the activator's score pile.",
        playerId: target,
        options: eligible,
        optional: false,
      };
      return;
    }
    const resp = ctx.response;
    if (resp === null || resp === undefined) return false;
    const cardId = resp as number;
    const activatorId = ctx.handlerState.activatingPlayerId as string;
    transferScoreToScore(g, target, activatorId, cardId);
    g.dogmaRun!.demandSuccessful = true;
    return true;
  }
  // level 1
  if (!g.dogmaRun!.demandSuccessful) return false;
  drawAndScore(g, target, 1);
  return true;
});

// ---------------------------------------------------------------------------
// Mathematics — "You may return a card from your hand. If you do, draw and
// meld a card of value one higher than the card you returned."
// ---------------------------------------------------------------------------
registerDogma('Mathematics', (g, target, ctx) => {
  const p = g.players[target];
  if (!ctx.handlerState.asked) {
    if (p.hand.length === 0) return false;
    ctx.handlerState.asked = true;
    ctx.pendingChoice = {
      kind: 'select-hand-card',
      prompt: 'Mathematics: return a card from your hand to draw and meld one of value one higher.',
      playerId: target,
      options: [...p.hand],
      optional: true,
    };
    return;
  }
  const resp = ctx.response;
  if (resp === null || resp === undefined) return false;
  const cardId = resp as number;
  const age = cardById(cardId).age;
  returnFromHand(g, target, cardId);
  drawAndMeld(g, target, age + 1);
  return true;
});

// ---------------------------------------------------------------------------
// Monotheism — TWO effects:
//   level 0 (demand): "I demand you transfer a top card on your board of a
//                     different color from any card on my board to my score
//                     pile! If you do, draw and tuck a 1!"
//   level 1:          "Draw and tuck a 1." (non-demand share)
// ---------------------------------------------------------------------------
registerDogma('Monotheism', (g, target, ctx) => {
  if (ctx.levelIndex === 0) {
    const activatorId = ctx.handlerState.activatingPlayerId as string | undefined
      ?? g.dogmaRun!.activatingPlayerId;
    if (!ctx.handlerState.asked) {
      const activator = g.players[activatorId];
      const eligible: Color[] = [];
      for (const c of COLORS) {
        if (g.players[target].piles[c].cards.length === 0) continue;
        if (activator.piles[c].cards.length > 0) continue;
        eligible.push(c);
      }
      if (eligible.length === 0) return false;
      ctx.handlerState.asked = true;
      ctx.handlerState.activatingPlayerId = g.dogmaRun!.activatingPlayerId;
      ctx.pendingChoice = {
        kind: 'select-board-color',
        prompt: "Monotheism: transfer a top card of a color the activator has no cards in to their score pile.",
        playerId: target,
        options: eligible.map((c) => COLORS.indexOf(c)),
        optional: false,
      };
      return;
    }
    const colorIdx = ctx.response as number;
    const color = COLORS[colorIdx];
    const moved = transferBoardToScore(g, target, activatorId, color);
    if (moved === null) return false;
    g.dogmaRun!.demandSuccessful = true;
    if (g.endByDraw) return true;
    // "If you do, draw and tuck a 1" — "you" is the demand target.
    const drawn = draw(g, target, 1);
    if (drawn !== null && !g.endByDraw) tuckFromHand(g, target, drawn);
    return true;
  }
  // level 1: "Draw and tuck a 1."
  const drawn = draw(g, target, 1);
  if (drawn === null) return false;
  tuckFromHand(g, target, drawn);
  return true;
});

// ---------------------------------------------------------------------------
// Philosophy — TWO effects:
//   level 0: "You may splay left any one color of your cards."
//   level 1: "You may score a card from your hand."
// ---------------------------------------------------------------------------
registerDogma('Philosophy', (g, target, ctx) => {
  if (ctx.levelIndex === 0) {
    const p = g.players[target];
    if (!ctx.handlerState.asked) {
      const eligible: Color[] = [];
      for (const c of COLORS) {
        const pile = p.piles[c];
        if (pile.cards.length >= 2 && pile.splay !== 'left') eligible.push(c);
      }
      if (eligible.length === 0) return false;
      ctx.handlerState.asked = true;
      ctx.pendingChoice = {
        kind: 'select-board-color',
        prompt: 'Philosophy: splay one of your colors left.',
        playerId: target,
        options: eligible.map((c) => COLORS.indexOf(c)),
        optional: true,
      };
      return;
    }
    const resp = ctx.response;
    if (resp === null || resp === undefined) return false;
    const color = COLORS[resp as number];
    return splay(g, target, color, 'left');
  }
  // level 1: optional score-from-hand.
  const p = g.players[target];
  if (!ctx.handlerState.asked) {
    if (p.hand.length === 0) return false;
    ctx.handlerState.asked = true;
    ctx.pendingChoice = {
      kind: 'select-hand-card',
      prompt: 'Philosophy: score a card from your hand?',
      playerId: target,
      options: [...p.hand],
      optional: true,
    };
    return;
  }
  const resp = ctx.response;
  if (resp === null || resp === undefined) return false;
  scoreFromHand(g, target, resp as number);
  return true;
});

// ---------------------------------------------------------------------------
// Road Building — "Meld one or two cards from your hand. If you melded two,
// you may transfer your top red card to another player's board. In exchange,
// transfer that player's top green card to your board."
// Phase-2 cut: opponent picked as next seat (no select-player kind yet).
// ---------------------------------------------------------------------------
registerDogma('Road Building', (g, target, ctx) => {
  const p = g.players[target];
  if (!ctx.handlerState.step) {
    if (p.hand.length === 0) return false;
    const max = Math.min(2, p.hand.length);
    ctx.handlerState.step = 'subset';
    ctx.pendingChoice = {
      kind: 'select-hand-card-subset',
      prompt: 'Road Building: meld one or two cards from your hand.',
      playerId: target,
      options: [...p.hand],
      optional: false,
      minCount: 1,
      maxCount: max,
    };
    return;
  }
  if (ctx.handlerState.step === 'subset') {
    const resp = ctx.response;
    if (!Array.isArray(resp) || resp.length === 0) return false;
    for (const id of resp) {
      meldFromHand(g, target, id);
      if (g.endByDraw) return true;
    }
    if (resp.length < 2) return true;
    // Two melded — offer exchange if the player has a top red and there's an opponent.
    if (p.piles.red.cards.length === 0) return true;
    const pids = Object.keys(g.players).sort();
    if (pids.length <= 1) return true;
    const idx = pids.indexOf(target);
    const opponentId = pids[(idx + 1) % pids.length];
    ctx.handlerState.step = 'exchange';
    ctx.handlerState.opponentId = opponentId;
    ctx.pendingChoice = {
      kind: 'yes-no',
      prompt: `Road Building: transfer your top red card to player ${opponentId} in exchange for their top green card?`,
      playerId: target,
      options: [],
      optional: false,
    };
    return;
  }
  // step === 'exchange'
  if (ctx.response !== true) return true;
  const opponentId = ctx.handlerState.opponentId as string;
  transferBoardToBoard(g, target, opponentId, 'red');
  if (g.endByDraw) return true;
  transferBoardToBoard(g, opponentId, target, 'green');
  return true;
});
