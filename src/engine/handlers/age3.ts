// Age 3 dogma handlers. Ported from the C# reference handlers in
// Innovation.Core/Handlers/*.cs:
//   Alchemy        — AlchemyDrawRevealHandler.cs + AlchemyMeldScoreHandler.cs
//   Compass        — CompassDemandHandler.cs
//   Education      — EducationHandler.cs
//   Engineering    — EngineeringDemandHandler.cs + EngineeringSplayHandler.cs
//   Feudalism      — FeudalismDemandHandler.cs + FeudalismSplayHandler.cs
//   Machinery      — MachineryDemandHandler.cs + MachineryScoreCastleSplayHandler.cs
//   Medicine       — MedicineDemandHandler.cs
//   Optics         — OpticsHandler.cs
//   Paper          — PaperSplayHandler.cs + PaperDrawPerSplayHandler.cs
//   Translation    — TranslationMeldScoreHandler.cs + TranslationWorldHandler.cs

import { registerDogma } from '../registry';
import { cardById } from '../../card-data';
import {
  claimSpecialAchievement, draw, drawAndScore, hasIcon,
  meldFromHand, meldFromScore, returnFromHand, returnFromScore,
  score as scoreOf, scoreFromHand, splay, transferBoardToBoard,
  transferBoardToScore, transferHandToHand, transferScoreToScore,
} from '../mechanics';
import { countIcons } from '../icons';
import { COLORS } from '../types';
import type { Color } from '../types';

// ---------------------------------------------------------------------------
// Alchemy — two effects.
//   level 0: Draw and reveal a 4 for every 3 castles on your board. If any of
//            the drawn cards are red, return the drawn cards AND your whole
//            hand. Otherwise keep them.
//   level 1: Meld a card from your hand, then score a card from your hand.
// ---------------------------------------------------------------------------
registerDogma('Alchemy', (g, target, ctx) => {
  if (ctx.levelIndex === 0) {
    const castles = countIcons(g.players[target], 'castle');
    const n = Math.floor(castles / 3);
    if (n === 0) return false;
    let anyRed = false;
    for (let i = 0; i < n; i++) {
      const id = draw(g, target, 4);
      if (id === null) return true;
      if (cardById(id).color === 'red') anyRed = true;
    }
    if (!anyRed) return true;
    // Return every card in hand. Returned cards go to the bottom of their
    // age decks — no order choice needed at the rules level.
    const hand = [...g.players[target].hand];
    for (const id of hand) returnFromHand(g, target, id);
    return true;
  }
  // level 1 — meld then score.
  const p = g.players[target];
  if (!ctx.handlerState.step) {
    if (p.hand.length === 0) return false;
    ctx.handlerState.step = 'meld';
    ctx.pendingChoice = {
      kind: 'select-hand-card',
      prompt: 'Alchemy: meld a card from your hand.',
      playerId: target,
      options: [...p.hand],
      optional: false,
    };
    return;
  }
  if (ctx.handlerState.step === 'meld') {
    const id = ctx.response as number;
    meldFromHand(g, target, id);
    if (p.hand.length === 0) return true;
    ctx.handlerState.step = 'score';
    ctx.pendingChoice = {
      kind: 'select-hand-card',
      prompt: 'Alchemy: score a card from your hand.',
      playerId: target,
      options: [...p.hand],
      optional: false,
    };
    return;
  }
  scoreFromHand(g, target, ctx.response as number);
  return true;
});

// ---------------------------------------------------------------------------
// Compass — demand: transfer a top non-green [Leaf] card from your board to
// my board, then transfer a top card without a [Leaf] from my board to your
// board. Per VB6 + C#, the demand TARGET picks both legs.
// ---------------------------------------------------------------------------
registerDogma('Compass', (g, target, ctx) => {
  const activatorId = g.dogmaRun!.activatingPlayerId;
  if (!ctx.handlerState.step) {
    const eligible: number[] = [];
    for (const c of COLORS) {
      if (c === 'green') continue;
      const top = g.players[target].piles[c].cards[0];
      if (top !== undefined && hasIcon(top, 'leaf')) eligible.push(COLORS.indexOf(c));
    }
    if (eligible.length === 0) return false;
    ctx.handlerState.step = 'leg1';
    ctx.pendingChoice = {
      kind: 'select-board-color',
      prompt: "Compass: transfer one of your top non-green [Leaf] cards to the activator's board.",
      playerId: target,
      options: eligible,
      optional: false,
    };
    return;
  }
  if (ctx.handlerState.step === 'leg1') {
    const colorIdx = ctx.response as number;
    const color = COLORS[colorIdx];
    transferBoardToBoard(g, target, activatorId, color);
    g.dogmaRun!.demandSuccessful = true;
    const eligible2: number[] = [];
    for (const c of COLORS) {
      const top = g.players[activatorId].piles[c].cards[0];
      if (top !== undefined && !hasIcon(top, 'leaf')) eligible2.push(COLORS.indexOf(c));
    }
    if (eligible2.length === 0) return true;
    ctx.handlerState.step = 'leg2';
    ctx.pendingChoice = {
      kind: 'select-board-color',
      prompt: "Compass: choose a top non-[Leaf] card on the activator's board to take.",
      playerId: target,
      options: eligible2,
      optional: false,
    };
    return;
  }
  // step === 'leg2'
  const colorIdx = ctx.response as number;
  const color = COLORS[colorIdx];
  transferBoardToBoard(g, activatorId, target, color);
  return true;
});

// ---------------------------------------------------------------------------
// Education — "You may return the highest card from your score pile. If you
// do, draw a card of value two higher than the highest card remaining in
// your score pile."
// ---------------------------------------------------------------------------
registerDogma('Education', (g, target, ctx) => {
  const p = g.players[target];
  if (p.scorePile.length === 0 && !ctx.handlerState.step) return false;
  if (!ctx.handlerState.step) {
    ctx.handlerState.step = 'ask';
    ctx.pendingChoice = {
      kind: 'yes-no',
      prompt: 'Education: return the highest card from your score pile?',
      playerId: target,
      options: [],
      optional: false,
    };
    return;
  }
  if (ctx.handlerState.step === 'ask') {
    if (ctx.response !== true) return false;
    const highest = Math.max(...p.scorePile.map((id) => cardById(id).age));
    const tied = p.scorePile.filter((id) => cardById(id).age === highest);
    if (tied.length === 1) {
      returnFromScore(g, target, tied[0]);
      const remHi = p.scorePile.length === 0
        ? 0 : Math.max(...p.scorePile.map((id) => cardById(id).age));
      draw(g, target, Math.max(1, remHi + 2));
      return true;
    }
    ctx.handlerState.step = 'pick';
    ctx.pendingChoice = {
      kind: 'select-score-card',
      prompt: `Education: choose which of your age-${highest} score-pile cards to return.`,
      playerId: target,
      options: tied,
      optional: false,
    };
    return;
  }
  // step === 'pick'
  const chosen = ctx.response as number;
  returnFromScore(g, target, chosen);
  const remHi = p.scorePile.length === 0
    ? 0 : Math.max(...p.scorePile.map((id) => cardById(id).age));
  draw(g, target, Math.max(1, remHi + 2));
  return true;
});

// ---------------------------------------------------------------------------
// Engineering — two effects.
//   level 0 (demand): Transfer ALL top cards with a [Castle] from your board
//                     to my score pile. No choice.
//   level 1: You may splay your red cards left.
// ---------------------------------------------------------------------------
registerDogma('Engineering', (g, target, ctx) => {
  if (ctx.levelIndex === 0) {
    const activatorId = g.dogmaRun!.activatingPlayerId;
    let any = false;
    for (const c of COLORS) {
      const top = g.players[target].piles[c].cards[0];
      if (top === undefined) continue;
      if (!hasIcon(top, 'castle')) continue;
      transferBoardToScore(g, target, activatorId, c);
      any = true;
    }
    if (any) g.dogmaRun!.demandSuccessful = true;
    return any;
  }
  // level 1 — optional splay of red.
  const redPile = g.players[target].piles.red;
  if (!ctx.handlerState.asked) {
    if (redPile.cards.length < 2 || redPile.splay === 'left') return false;
    ctx.handlerState.asked = true;
    ctx.pendingChoice = {
      kind: 'yes-no',
      prompt: 'Engineering: splay your red cards left?',
      playerId: target,
      options: [],
      optional: false,
    };
    return;
  }
  if (ctx.response !== true) return false;
  return splay(g, target, 'red', 'left');
});

// ---------------------------------------------------------------------------
// Feudalism — two effects.
//   level 0 (demand): Transfer a [Castle] card from hand to my hand.
//   level 1: You may splay your yellow or purple cards left.
// ---------------------------------------------------------------------------
registerDogma('Feudalism', (g, target, ctx) => {
  if (ctx.levelIndex === 0) {
    const activatorId = g.dogmaRun!.activatingPlayerId;
    if (!ctx.handlerState.asked) {
      const eligible = g.players[target].hand.filter((id) => hasIcon(id, 'castle'));
      if (eligible.length === 0) return false;
      ctx.handlerState.asked = true;
      ctx.pendingChoice = {
        kind: 'select-hand-card',
        prompt: "Feudalism: transfer a [Castle] card from your hand to the activator's hand.",
        playerId: target,
        options: eligible,
        optional: false,
      };
      return;
    }
    const id = ctx.response as number;
    transferHandToHand(g, target, activatorId, id);
    g.dogmaRun!.demandSuccessful = true;
    return true;
  }
  // level 1 — pick yellow or purple to splay left.
  if (!ctx.handlerState.asked) {
    const eligible: number[] = [];
    for (const c of ['yellow', 'purple'] as Color[]) {
      const pile = g.players[target].piles[c];
      if (pile.cards.length >= 2 && pile.splay !== 'left') eligible.push(COLORS.indexOf(c));
    }
    if (eligible.length === 0) return false;
    ctx.handlerState.asked = true;
    ctx.pendingChoice = {
      kind: 'select-board-color',
      prompt: 'Feudalism: splay your yellow or purple cards left?',
      playerId: target,
      options: eligible,
      optional: true,
    };
    return;
  }
  if (ctx.response === null || ctx.response === undefined) return false;
  const color = COLORS[ctx.response as number];
  return splay(g, target, color, 'left');
});

// ---------------------------------------------------------------------------
// Machinery — two effects.
//   level 0 (demand): Exchange all cards in your hand with all the highest
//                     cards in my hand. No choice.
//   level 1: Score a card from your hand with a [Castle]. You may splay
//            your red cards left.
// ---------------------------------------------------------------------------
registerDogma('Machinery', (g, target, ctx) => {
  if (ctx.levelIndex === 0) {
    const activatorId = g.dogmaRun!.activatingPlayerId;
    const fromTarget = [...g.players[target].hand];
    const activatorHand = g.players[activatorId].hand;
    let fromActivator: number[] = [];
    if (activatorHand.length > 0) {
      const hi = Math.max(...activatorHand.map((id) => cardById(id).age));
      fromActivator = activatorHand.filter((id) => cardById(id).age === hi);
    }
    if (fromTarget.length === 0 && fromActivator.length === 0) return false;
    for (const id of fromTarget) transferHandToHand(g, target, activatorId, id);
    for (const id of fromActivator) transferHandToHand(g, activatorId, target, id);
    g.dogmaRun!.demandSuccessful = true;
    return true;
  }
  // level 1 — score castle then optional splay.
  const p = g.players[target];
  if (!ctx.handlerState.step) {
    const eligible = p.hand.filter((id) => hasIcon(id, 'castle'));
    if (eligible.length === 0) {
      const redPile = p.piles.red;
      if (redPile.cards.length < 2 || redPile.splay === 'left') return false;
      ctx.handlerState.step = 'splay';
      ctx.handlerState.scored = false;
      ctx.pendingChoice = {
        kind: 'yes-no',
        prompt: 'Machinery: splay your red cards left?',
        playerId: target,
        options: [],
        optional: false,
      };
      return;
    }
    ctx.handlerState.step = 'score';
    ctx.pendingChoice = {
      kind: 'select-hand-card',
      prompt: 'Machinery: score a [Castle] card from your hand.',
      playerId: target,
      options: eligible,
      optional: false,
    };
    return;
  }
  if (ctx.handlerState.step === 'score') {
    scoreFromHand(g, target, ctx.response as number);
    ctx.handlerState.scored = true;
    const redPile = p.piles.red;
    if (redPile.cards.length < 2 || redPile.splay === 'left') return true;
    ctx.handlerState.step = 'splay';
    ctx.pendingChoice = {
      kind: 'yes-no',
      prompt: 'Machinery: splay your red cards left?',
      playerId: target,
      options: [],
      optional: false,
    };
    return;
  }
  // step === 'splay'
  const scored = ctx.handlerState.scored === true;
  if (ctx.response !== true) return scored;
  const splayed = splay(g, target, 'red', 'left');
  return scored || splayed;
});

// ---------------------------------------------------------------------------
// Medicine — demand: Exchange the highest card in your score pile with the
// lowest card in my score pile. Snapshot the activator's pile so a card the
// target just sent isn't immediately eligible to come back.
// ---------------------------------------------------------------------------
registerDogma('Medicine', (g, target, ctx) => {
  const activatorId = g.dogmaRun!.activatingPlayerId;

  const promptActivator = (): boolean | void => {
    const snap = ctx.handlerState.activatorSnap as number[];
    const apile = g.players[activatorId].scorePile;
    const eligible = snap.filter((id) => apile.includes(id));
    if (eligible.length === 0) return true;
    const lo = Math.min(...eligible.map((id) => cardById(id).age));
    const tied = eligible.filter((id) => cardById(id).age === lo);
    if (tied.length === 1) {
      transferScoreToScore(g, activatorId, target, tied[0]);
      return true;
    }
    ctx.handlerState.step = 'activator';
    ctx.pendingChoice = {
      kind: 'select-score-card',
      prompt: `Medicine: choose which of your age-${lo} score-pile cards to send.`,
      playerId: activatorId,
      options: tied,
      optional: false,
    };
    return undefined;
  };

  if (!ctx.handlerState.step) {
    ctx.handlerState.activatorSnap = [...g.players[activatorId].scorePile];
    const tpile = g.players[target].scorePile;
    if (tpile.length === 0) {
      return promptActivator();
    }
    const hi = Math.max(...tpile.map((id) => cardById(id).age));
    const tied = tpile.filter((id) => cardById(id).age === hi);
    if (tied.length === 1) {
      transferScoreToScore(g, target, activatorId, tied[0]);
      g.dogmaRun!.demandSuccessful = true;
      return promptActivator();
    }
    ctx.handlerState.step = 'defender';
    ctx.pendingChoice = {
      kind: 'select-score-card',
      prompt: `Medicine: choose which of your age-${hi} score-pile cards to give up.`,
      playerId: target,
      options: tied,
      optional: false,
    };
    return;
  }
  if (ctx.handlerState.step === 'defender') {
    const id = ctx.response as number;
    transferScoreToScore(g, target, activatorId, id);
    g.dogmaRun!.demandSuccessful = true;
    return promptActivator();
  }
  // step === 'activator'
  const id = ctx.response as number;
  transferScoreToScore(g, activatorId, target, id);
  return true;
});

// ---------------------------------------------------------------------------
// Optics — Draw and meld a 3. If it has a [Crown], draw and score a 4.
// Otherwise transfer a card from your score pile to the score pile of an
// opponent with fewer points than you. We auto-pick the lowest-score
// opponent (tiebreak: next seat).
// ---------------------------------------------------------------------------
registerDogma('Optics', (g, target, ctx) => {
  if (!ctx.handlerState.step) {
    const melded = draw(g, target, 3);
    if (melded === null) return true;
    meldFromHand(g, target, melded);
    if (g.endByDraw || g.winnerOverride) return true;

    if (hasIcon(melded, 'crown')) {
      drawAndScore(g, target, 4);
      return true;
    }

    // Find opponent with fewer points; auto-pick lowest (tiebreak: next seat).
    const myScore = scoreOf(g.players[target]);
    const sortedIds = Object.keys(g.players).sort();
    const myIdx = sortedIds.indexOf(target);
    const n = sortedIds.length;
    let chosen: string | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let i = 1; i < n; i++) {
      const pid = sortedIds[(myIdx + i) % n];
      const s = scoreOf(g.players[pid]);
      if (s >= myScore) continue;
      if (s < bestScore) { bestScore = s; chosen = pid; }
    }
    if (chosen === null) return true;
    if (g.players[target].scorePile.length === 0) return true;
    ctx.handlerState.step = 'pick';
    ctx.handlerState.opponent = chosen;
    ctx.pendingChoice = {
      kind: 'select-score-card',
      prompt: 'Optics: transfer a card from your score pile to a poorer opponent.',
      playerId: target,
      options: [...g.players[target].scorePile],
      optional: false,
    };
    return;
  }
  // step === 'pick'
  const cardId = ctx.response as number;
  const opp = ctx.handlerState.opponent as string;
  transferScoreToScore(g, target, opp, cardId);
  return true;
});

// ---------------------------------------------------------------------------
// Paper — two effects.
//   level 0: You may splay your green or blue cards left.
//   level 1: Draw a 4 for every color you have splayed left.
// ---------------------------------------------------------------------------
registerDogma('Paper', (g, target, ctx) => {
  if (ctx.levelIndex === 0) {
    if (!ctx.handlerState.asked) {
      const eligible: number[] = [];
      for (const c of ['green', 'blue'] as Color[]) {
        const pile = g.players[target].piles[c];
        if (pile.cards.length >= 2 && pile.splay !== 'left') eligible.push(COLORS.indexOf(c));
      }
      if (eligible.length === 0) return false;
      ctx.handlerState.asked = true;
      ctx.pendingChoice = {
        kind: 'select-board-color',
        prompt: 'Paper: splay your green or blue cards left?',
        playerId: target,
        options: eligible,
        optional: true,
      };
      return;
    }
    if (ctx.response === null || ctx.response === undefined) return false;
    const color = COLORS[ctx.response as number];
    return splay(g, target, color, 'left');
  }
  // level 1
  let n = 0;
  for (const c of COLORS) {
    if (g.players[target].piles[c].splay === 'left') n++;
  }
  if (n === 0) return false;
  for (let i = 0; i < n; i++) {
    draw(g, target, 4);
    if (g.endByDraw) return true;
  }
  return true;
});

// ---------------------------------------------------------------------------
// Translation — two effects.
//   level 0: You may meld all the cards in your score pile. If you meld one,
//            you must meld them all. (Yes/no, then pick the order one card at
//            a time so the last-melded card of a given color is on top.)
//   level 1: If each top card on your board has a [Crown], claim World.
// ---------------------------------------------------------------------------
registerDogma('Translation', (g, target, ctx) => {
  if (ctx.levelIndex === 0) {
    const p = g.players[target];
    if (!ctx.handlerState.step) {
      if (p.scorePile.length === 0) return false;
      ctx.handlerState.step = 'confirm';
      ctx.pendingChoice = {
        kind: 'yes-no',
        prompt: 'Translation: meld every card in your score pile?',
        playerId: target,
        options: [],
        optional: false,
      };
      return;
    }
    if (ctx.handlerState.step === 'confirm') {
      if (ctx.response !== true) return false;
      if (p.scorePile.length === 0) return true;
      ctx.handlerState.step = 'pick';
      ctx.pendingChoice = {
        kind: 'select-score-card',
        prompt: `Translation: pick the next card to meld (${p.scorePile.length} remaining).`,
        playerId: target,
        options: [...p.scorePile],
        optional: false,
      };
      return;
    }
    // step === 'pick'
    const id = ctx.response as number;
    meldFromScore(g, target, id);
    if (g.endByDraw || g.winnerOverride) return true;
    if (p.scorePile.length === 0) return true;
    ctx.pendingChoice = {
      kind: 'select-score-card',
      prompt: `Translation: pick the next card to meld (${p.scorePile.length} remaining).`,
      playerId: target,
      options: [...p.scorePile],
      optional: false,
    };
    return;
  }
  // level 1 — World achievement check.
  const p = g.players[target];
  let any = false;
  for (const c of COLORS) {
    const top = p.piles[c].cards[0];
    if (top === undefined) continue;
    any = true;
    if (!hasIcon(top, 'crown')) return false;
  }
  if (!any) return false;
  return claimSpecialAchievement(g, target, 'World');
});
