// Age 4 dogma handlers — ported from C# Innovation.Core/Handlers/*.cs.
//
// Cards (10):
//   - Anatomy             (AnatomyDemandHandler.cs)
//   - Colonialism         (ColonialismHandler.cs)
//   - Enterprise          (EnterpriseDemandHandler.cs + EnterpriseSplayHandler.cs)
//   - Experimentation     (trivial — TSV "Draw and meld a 5.")
//   - Gunpowder           (GunpowderDemandHandler.cs + GunpowderDrawIfDemandHandler.cs)
//   - Invention           (InventionSplayAndDrawHandler.cs + InventionWonderHandler.cs)
//   - Navigation          (NavigationDemandHandler.cs)
//   - Perspective         (PerspectiveHandler.cs)
//   - Printing Press      (PrintingPressReturnAndDrawHandler.cs + PrintingPressSplayHandler.cs)
//   - Reformation         (ReformationTuckHandler.cs + ReformationSplayHandler.cs)

import { registerDogma } from '../registry';
import { cardById } from '../../card-data';
import {
  claimSpecialAchievement, draw, drawAndMeld, drawAndScore, hasIcon,
  returnFromBoard, returnFromHand, returnFromScore, scoreFromHand, splay,
  topCard, transferBoardToBoard, transferBoardToScore, transferScoreToScore,
  tuckFromHand,
} from '../mechanics';
import { countIcons } from '../icons';
import { COLORS } from '../types';
import type { Color } from '../types';

// ---------------------------------------------------------------------------
// Anatomy — demand: return a card from your score pile; if you do, return a
// top card of equal value from your board.
// ---------------------------------------------------------------------------
registerDogma('Anatomy', (g, target, ctx) => {
  const p = g.players[target];
  if (!ctx.handlerState.step) {
    if (p.scorePile.length === 0) return false;
    ctx.handlerState.step = 'pickScore';
    ctx.pendingChoice = {
      kind: 'select-score-card',
      prompt: 'Anatomy: return a card from your score pile.',
      playerId: target,
      options: [...p.scorePile],
      optional: false,
    };
    return;
  }
  if (ctx.handlerState.step === 'pickScore') {
    const cardId = ctx.response as number | null;
    if (cardId === null || cardId === undefined) return false;
    const age = cardById(cardId).age;
    returnFromScore(g, target, cardId);
    g.dogmaRun!.demandSuccessful = true;
    if (g.endByDraw || g.winnerOverride) return true;

    // Pick a top card whose age matches the just-returned score card.
    const eligible: number[] = [];
    for (const c of COLORS) {
      const top = topCard(p, c);
      if (top !== null && cardById(top).age === age) eligible.push(COLORS.indexOf(c));
    }
    if (eligible.length === 0) return true;
    ctx.handlerState.step = 'pickBoard';
    ctx.handlerState.requiredAge = age;
    ctx.pendingChoice = {
      kind: 'select-board-color',
      prompt: `Anatomy: return a top card of value ${age} from your board.`,
      playerId: target,
      options: eligible,
      optional: false,
    };
    return;
  }
  // step === 'pickBoard'
  const colorIdx = ctx.response as number | null;
  if (colorIdx === null || colorIdx === undefined) return true;
  const color = COLORS[colorIdx];
  const top = topCard(p, color);
  if (top === null) return true;
  returnFromBoard(g, target, color, top);
  return true;
});

// ---------------------------------------------------------------------------
// Colonialism — "Draw and tuck a 3. If it has a [Crown], repeat this dogma
// effect." Deterministic loop.
// ---------------------------------------------------------------------------
registerDogma('Colonialism', (g, target) => {
  let progressed = false;
  while (true) {
    const id = draw(g, target, 3);
    if (id === null) return progressed;
    tuckFromHand(g, target, id);
    progressed = true;
    if (g.endByDraw || g.winnerOverride) return progressed;
    if (!hasIcon(id, 'crown')) return progressed;
  }
});

// ---------------------------------------------------------------------------
// Enterprise — TWO effects:
//   level 0 (demand): transfer a top non-purple [Crown] from your board to my
//                     board. If you do, "you" (target) draw and meld a 4.
//   level 1 (share): you may splay your green cards right.
// ---------------------------------------------------------------------------
registerDogma('Enterprise', (g, target, ctx) => {
  if (ctx.levelIndex === 0) {
    const p = g.players[target];
    if (!ctx.handlerState.asked) {
      const eligible: number[] = [];
      for (const c of COLORS) {
        if (c === 'purple') continue;
        const top = topCard(p, c);
        if (top !== null && hasIcon(top, 'crown')) eligible.push(COLORS.indexOf(c));
      }
      if (eligible.length === 0) return false;
      ctx.handlerState.asked = true;
      ctx.handlerState.activatingPlayerId = g.dogmaRun!.activatingPlayerId;
      ctx.pendingChoice = {
        kind: 'select-board-color',
        prompt: "Enterprise: transfer a top non-purple [Crown] card to the activator's board.",
        playerId: target,
        options: eligible,
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
    drawAndMeld(g, target, 4);
    return true;
  }
  // level 1: optional splay green right.
  const p = g.players[target];
  if (!ctx.handlerState.asked) {
    if (p.piles.green.cards.length < 2 || p.piles.green.splay === 'right') return false;
    ctx.handlerState.asked = true;
    ctx.pendingChoice = {
      kind: 'yes-no',
      prompt: 'Enterprise: splay your green cards right?',
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

// ---------------------------------------------------------------------------
// Experimentation — "Draw and meld a 5."
// ---------------------------------------------------------------------------
registerDogma('Experimentation', (g, target) => {
  drawAndMeld(g, target, 5);
});

// ---------------------------------------------------------------------------
// Gunpowder — TWO effects:
//   level 0 (demand): transfer a top [Castle] from your board to my score pile.
//   level 1 (share): if any card was transferred due to the demand, draw and
//                    score a 2.
// ---------------------------------------------------------------------------
registerDogma('Gunpowder', (g, target, ctx) => {
  if (ctx.levelIndex === 0) {
    const p = g.players[target];
    if (!ctx.handlerState.asked) {
      const eligible: number[] = [];
      for (const c of COLORS) {
        const top = topCard(p, c);
        if (top !== null && hasIcon(top, 'castle')) eligible.push(COLORS.indexOf(c));
      }
      if (eligible.length === 0) return false;
      ctx.handlerState.asked = true;
      ctx.handlerState.activatingPlayerId = g.dogmaRun!.activatingPlayerId;
      ctx.pendingChoice = {
        kind: 'select-board-color',
        prompt: "Gunpowder: transfer a top [Castle] card to the activator's score pile.",
        playerId: target,
        options: eligible,
        optional: false,
      };
      return;
    }
    const colorIdx = ctx.response as number;
    const color = COLORS[colorIdx];
    const activatorId = ctx.handlerState.activatingPlayerId as string;
    const moved = transferBoardToScore(g, target, activatorId, color);
    if (moved === null) return false;
    g.dogmaRun!.demandSuccessful = true;
    return true;
  }
  // level 1
  if (!g.dogmaRun!.demandSuccessful) return false;
  drawAndScore(g, target, 2);
  return true;
});

// ---------------------------------------------------------------------------
// Invention — TWO effects:
//   level 0: optionally re-splay any one left-splayed color to right; if you do,
//            draw and score a 4.
//   level 1: if all five colors splayed (any direction), claim Wonder.
// ---------------------------------------------------------------------------
registerDogma('Invention', (g, target, ctx) => {
  if (ctx.levelIndex === 0) {
    const p = g.players[target];
    if (!ctx.handlerState.asked) {
      const eligible: number[] = [];
      for (const c of COLORS) {
        if (p.piles[c].splay === 'left') eligible.push(COLORS.indexOf(c));
      }
      if (eligible.length === 0) return false;
      ctx.handlerState.asked = true;
      ctx.pendingChoice = {
        kind: 'select-board-color',
        prompt: 'Invention: re-splay a left-splayed color to the right, then draw and score a 4.',
        playerId: target,
        options: eligible,
        optional: true,
      };
      return;
    }
    const resp = ctx.response;
    if (resp === null || resp === undefined) return false;
    const color = COLORS[resp as number];
    if (!splay(g, target, color, 'right')) return false;
    if (g.endByDraw || g.winnerOverride) return true;
    drawAndScore(g, target, 4);
    return true;
  }
  // level 1: 5 colors splayed (any direction) → claim Wonder.
  const p = g.players[target];
  for (const c of COLORS) {
    if (p.piles[c].splay === 'none') return false;
  }
  return claimSpecialAchievement(g, target, 'Wonder');
});

// ---------------------------------------------------------------------------
// Navigation — demand: transfer a 2 or 3 from your score pile to my score pile.
// ---------------------------------------------------------------------------
registerDogma('Navigation', (g, target, ctx) => {
  if (!ctx.handlerState.asked) {
    const eligible = g.players[target].scorePile.filter((id) => {
      const a = cardById(id).age;
      return a === 2 || a === 3;
    });
    if (eligible.length === 0) return false;
    ctx.handlerState.asked = true;
    ctx.handlerState.activatingPlayerId = g.dogmaRun!.activatingPlayerId;
    ctx.pendingChoice = {
      kind: 'select-score-card',
      prompt: "Navigation: transfer a 2 or 3 from your score pile to the activator's score pile.",
      playerId: target,
      options: eligible,
      optional: false,
    };
    return;
  }
  const cardId = ctx.response as number;
  const activatorId = ctx.handlerState.activatingPlayerId as string;
  transferScoreToScore(g, target, activatorId, cardId);
  g.dogmaRun!.demandSuccessful = true;
  return true;
});

// ---------------------------------------------------------------------------
// Perspective — "You may return a card from your hand. If you do, score a card
// from your hand for every two [Lightbulb] icons on your board."
// Two sub-flows: optional return, then a sequence of mandatory score picks.
// ---------------------------------------------------------------------------
registerDogma('Perspective', (g, target, ctx) => {
  const p = g.players[target];
  if (!ctx.handlerState.step) {
    if (p.hand.length === 0) return false;
    ctx.handlerState.step = 'return';
    ctx.pendingChoice = {
      kind: 'select-hand-card',
      prompt: 'Perspective: return a card from your hand?',
      playerId: target,
      options: [...p.hand],
      optional: true,
    };
    return;
  }
  if (ctx.handlerState.step === 'return') {
    const resp = ctx.response;
    if (resp === null || resp === undefined) return false;
    returnFromHand(g, target, resp as number);
    const bulbs = countIcons(p, 'lightbulb');
    const remaining = Math.floor(bulbs / 2);
    if (remaining <= 0 || p.hand.length === 0) return true;
    ctx.handlerState.step = 'score';
    ctx.handlerState.remaining = remaining;
    ctx.pendingChoice = {
      kind: 'select-hand-card',
      prompt: `Perspective: score a card from your hand (${remaining} remaining).`,
      playerId: target,
      options: [...p.hand],
      optional: false,
    };
    return;
  }
  // step === 'score'
  const cardId = ctx.response as number;
  scoreFromHand(g, target, cardId);
  if (g.endByDraw || g.winnerOverride) return true;
  const left = (ctx.handlerState.remaining as number) - 1;
  if (left <= 0 || p.hand.length === 0) return true;
  ctx.handlerState.remaining = left;
  ctx.pendingChoice = {
    kind: 'select-hand-card',
    prompt: `Perspective: score a card from your hand (${left} remaining).`,
    playerId: target,
    options: [...p.hand],
    optional: false,
  };
  return;
});

// ---------------------------------------------------------------------------
// Printing Press — TWO effects:
//   level 0: optionally return a card from your score pile; if you do, draw a
//            card of value two higher than the top purple card on your board
//            (treat empty purple as age 0; draw at least an age-2).
//   level 1: optional splay blue right.
// ---------------------------------------------------------------------------
registerDogma('Printing Press', (g, target, ctx) => {
  if (ctx.levelIndex === 0) {
    const p = g.players[target];
    if (!ctx.handlerState.asked) {
      if (p.scorePile.length === 0) return false;
      ctx.handlerState.asked = true;
      ctx.pendingChoice = {
        kind: 'select-score-card',
        prompt: 'Printing Press: return a card from your score pile?',
        playerId: target,
        options: [...p.scorePile],
        optional: true,
      };
      return;
    }
    const resp = ctx.response;
    if (resp === null || resp === undefined) return false;
    returnFromScore(g, target, resp as number);
    if (g.endByDraw || g.winnerOverride) return true;
    const top = topCard(p, 'purple');
    const baseAge = top === null ? 0 : cardById(top).age;
    const drawAge = Math.max(1, baseAge + 2);
    draw(g, target, drawAge);
    return true;
  }
  // level 1: optional splay blue right.
  const p = g.players[target];
  if (!ctx.handlerState.asked) {
    if (p.piles.blue.cards.length < 2 || p.piles.blue.splay === 'right') return false;
    ctx.handlerState.asked = true;
    ctx.pendingChoice = {
      kind: 'yes-no',
      prompt: 'Printing Press: splay your blue cards right?',
      playerId: target,
      options: [],
      optional: false,
    };
    return;
  }
  if (ctx.response !== true) return false;
  splay(g, target, 'blue', 'right');
  return true;
});

// ---------------------------------------------------------------------------
// Reformation — TWO effects:
//   level 0: you may tuck a card from your hand for every two [Leaf] icons on
//            your board.
//   level 1: you may splay your yellow or purple cards right.
// (Tuck-order pick — only matters when ≥2 picks share a color — is skipped;
// we tuck in response order.)
// ---------------------------------------------------------------------------
registerDogma('Reformation', (g, target, ctx) => {
  const p = g.players[target];
  if (ctx.levelIndex === 0) {
    if (!ctx.handlerState.asked) {
      const leafs = countIcons(p, 'leaf');
      const max = Math.min(Math.floor(leafs / 2), p.hand.length);
      if (max <= 0) return false;
      ctx.handlerState.asked = true;
      ctx.pendingChoice = {
        kind: 'select-hand-card-subset',
        prompt: `Reformation: tuck up to ${max} card(s) from your hand.`,
        playerId: target,
        options: [...p.hand],
        optional: true,
        minCount: 0,
        maxCount: max,
      };
      return;
    }
    const resp = ctx.response;
    if (!Array.isArray(resp) || resp.length === 0) return false;
    for (const id of resp) {
      tuckFromHand(g, target, id);
      if (g.endByDraw || g.winnerOverride) return true;
    }
    return true;
  }
  // level 1: yellow or purple right.
  if (!ctx.handlerState.asked) {
    const eligible: number[] = [];
    for (const c of ['yellow', 'purple'] as Color[]) {
      if (p.piles[c].cards.length >= 2 && p.piles[c].splay !== 'right') {
        eligible.push(COLORS.indexOf(c));
      }
    }
    if (eligible.length === 0) return false;
    ctx.handlerState.asked = true;
    ctx.pendingChoice = {
      kind: 'select-board-color',
      prompt: 'Reformation: splay your yellow or purple cards right?',
      playerId: target,
      options: eligible,
      optional: true,
    };
    return;
  }
  const resp = ctx.response;
  if (resp === null || resp === undefined) return false;
  const color = COLORS[resp as number];
  return splay(g, target, color, 'right');
});
