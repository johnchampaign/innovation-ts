// Age 10 dogma handlers. Ported 1:1 from the C# reference handlers in
// Innovation.Core/Handlers/:
//   - AIWinHandler (+ TSV effect 1: "Draw and score a 10.")
//   - BioengineeringTransferHandler / BioengineeringWinHandler
//   - DatabasesDemandHandler
//   - GlobalizationDemandHandler / GlobalizationDrawHandler
//   - MiniaturizationHandler
//   - RoboticsHandler
//   - SelfServiceExecuteHandler / SelfServiceWinHandler
//   - SoftwareMeldTwoExecuteHandler (+ TSV effect 1: "Draw and score a 10.")
//   - StemCellsHandler
//   - TheInternetSplayHandler / TheInternetDrawMeldPerClockHandler
//
// A.I., Bioengineering eff 2, Globalization eff 2, and Self Service eff 2 are
// solo-win conditions handled via winSolo. Robotics, Software eff 2, and
// Self Service eff 1 queue nested execute-for-self frames via executeSelfOnly.

import { registerDogma } from '../registry';
import { cardById } from '../../card-data';
import {
  draw, drawAndMeld, drawAndScore, hasIcon, meldFromHand, returnFromHand,
  returnFromScore, scoreFromBoard, scoreFromHand, score as pileScore, splay,
  transferBoardToScore, winSolo,
} from '../mechanics';
import { executeSelfOnly } from '../dogma';
import { countIcons } from '../icons';
import { COLORS } from '../types';
import type { Color } from '../types';

// ---------------------------------------------------------------------------
// A.I. — two effects:
//   0: "Draw and score a 10."
//   1: "If Robotics and Software are top cards on any board, the single player
//       with the lowest score wins."
// ---------------------------------------------------------------------------
registerDogma('A.I.', (g, target, ctx) => {
  if (ctx.levelIndex === 0) {
    drawAndScore(g, target, 10);
    return true;
  }
  let roboticsTop = false;
  let softwareTop = false;
  for (const pid of Object.keys(g.players)) {
    const p = g.players[pid];
    for (const c of COLORS) {
      const top = p.piles[c].cards[0];
      if (top === undefined) continue;
      const title = cardById(top).title;
      if (title === 'Robotics') roboticsTop = true;
      else if (title === 'Software') softwareTop = true;
    }
  }
  if (!roboticsTop || !softwareTop) return false;

  let lo = Infinity;
  for (const pid of Object.keys(g.players)) {
    lo = Math.min(lo, pileScore(g.players[pid]));
  }
  const lows: string[] = [];
  for (const pid of Object.keys(g.players)) {
    if (pileScore(g.players[pid]) === lo) lows.push(pid);
  }
  if (lows.length !== 1) return false;
  winSolo(g, lows[0], 'A.I. — lowest score with Robotics+Software on table');
  return true;
});

// ---------------------------------------------------------------------------
// Bioengineering — two effects:
//   0: "Transfer a top card with a [Leaf] from any other player's board to
//       your score pile."
//   1: "If any player has fewer than three [Leaf] icons on their board, the
//       single player with the most [Leaf] icons on their board wins."
// ---------------------------------------------------------------------------
registerDogma('Bioengineering', (g, target, ctx) => {
  if (ctx.levelIndex === 0) {
    if (!ctx.handlerState.asked) {
      const eligible: number[] = [];
      const owners: Record<number, { ownerId: string; color: Color }> = {};
      for (const pid of Object.keys(g.players)) {
        if (pid === target) continue;
        const p = g.players[pid];
        for (const c of COLORS) {
          const top = p.piles[c].cards[0];
          if (top === undefined) continue;
          if (!hasIcon(top, 'leaf')) continue;
          eligible.push(top);
          owners[top] = { ownerId: pid, color: c };
        }
      }
      if (eligible.length === 0) return false;
      ctx.handlerState.asked = true;
      ctx.handlerState.owners = owners;
      ctx.pendingChoice = {
        kind: 'select-hand-card',
        prompt: 'Bioengineering: transfer a top [Leaf] card from another player\'s board to your score pile.',
        playerId: target,
        options: eligible,
        optional: false,
      };
      return;
    }
    const chosen = ctx.response as number;
    const owners = ctx.handlerState.owners as Record<number, { ownerId: string; color: Color }>;
    const meta = owners[chosen];
    if (!meta) return false;
    transferBoardToScore(g, meta.ownerId, target, meta.color);
    return true;
  }
  // level 1.
  const counts: Array<{ pid: string; n: number }> = [];
  let anyBelow = false;
  for (const pid of Object.keys(g.players)) {
    const n = countIcons(g.players[pid], 'leaf');
    counts.push({ pid, n });
    if (n < 3) anyBelow = true;
  }
  if (!anyBelow) return false;
  let max = -1;
  for (const c of counts) if (c.n > max) max = c.n;
  const tops = counts.filter((c) => c.n === max);
  if (tops.length !== 1) return false;
  winSolo(g, tops[0].pid, 'Bioengineering — most [Leaf] icons');
  return true;
});

// ---------------------------------------------------------------------------
// Databases — demand: "Return half (rounded up) of the cards in your score
// pile!"
// ---------------------------------------------------------------------------
registerDogma('Databases', (g, target, ctx) => {
  const p = g.players[target];
  const n = p.scorePile.length;
  if (n === 0) return false;
  const toReturn = Math.ceil(n / 2);
  if (!ctx.handlerState.asked) {
    ctx.handlerState.asked = true;
    ctx.pendingChoice = {
      kind: 'select-score-card-subset',
      prompt: `Databases: return ${toReturn} of your ${n} score-pile cards.`,
      playerId: target,
      options: [...p.scorePile],
      optional: false,
      minCount: toReturn,
      maxCount: toReturn,
    };
    return;
  }
  const resp = ctx.response;
  if (!Array.isArray(resp) || resp.length === 0) return false;
  for (const id of resp) returnFromScore(g, target, id);
  g.dogmaRun!.demandSuccessful = true;
  return true;
});

// ---------------------------------------------------------------------------
// Globalization — two effects:
//   0 (demand): "Return a top card with a [Leaf] on your board!"
//   1:          "Draw and score a 6. If no player has more [Leaf] icons than
//                [Factory] icons on their board, the single player with the
//                most points wins."
// ---------------------------------------------------------------------------
registerDogma('Globalization', (g, target, ctx) => {
  if (ctx.levelIndex === 0) {
    if (!ctx.handlerState.asked) {
      const p = g.players[target];
      const eligibleColors: number[] = [];
      for (const c of COLORS) {
        const top = p.piles[c].cards[0];
        if (top === undefined) continue;
        if (!hasIcon(top, 'leaf')) continue;
        eligibleColors.push(COLORS.indexOf(c));
      }
      if (eligibleColors.length === 0) return false;
      ctx.handlerState.asked = true;
      ctx.pendingChoice = {
        kind: 'select-board-color',
        prompt: 'Globalization: return a top [Leaf] card from your board.',
        playerId: target,
        options: eligibleColors,
        optional: false,
      };
      return;
    }
    const colorIdx = ctx.response as number;
    const color = COLORS[colorIdx];
    const p = g.players[target];
    const top = p.piles[color].cards[0];
    if (top === undefined) return false;
    if (!hasIcon(top, 'leaf')) return false;
    p.piles[color].cards.shift();
    if (p.piles[color].cards.length < 2) p.piles[color].splay = 'none';
    g.decks[cardById(top).age].push(top);
    g.dogmaRun!.demandSuccessful = true;
    return true;
  }
  // level 1.
  drawAndScore(g, target, 6);
  if (g.endByDraw || g.winnerOverride) return true;
  for (const pid of Object.keys(g.players)) {
    const leaf = countIcons(g.players[pid], 'leaf');
    const fac = countIcons(g.players[pid], 'factory');
    if (leaf > fac) return true;
  }
  let max = -1;
  for (const pid of Object.keys(g.players)) {
    const s = pileScore(g.players[pid]);
    if (s > max) max = s;
  }
  const tops: string[] = [];
  for (const pid of Object.keys(g.players)) {
    if (pileScore(g.players[pid]) === max) tops.push(pid);
  }
  if (tops.length !== 1) return true;
  winSolo(g, tops[0], 'Globalization — most points, no Leaf>Factory player');
  return true;
});

// ---------------------------------------------------------------------------
// Miniaturization — "You may return a card from your hand. If you returned
// a 10, draw a 10 for every different value of card in your score pile."
// ---------------------------------------------------------------------------
registerDogma('Miniaturization', (g, target, ctx) => {
  if (!ctx.handlerState.asked) {
    const hand = g.players[target].hand;
    if (hand.length === 0) return false;
    ctx.handlerState.asked = true;
    ctx.pendingChoice = {
      kind: 'select-hand-card',
      prompt: 'Miniaturization: return a card. If it\'s a 10, draw a 10 for each distinct score-pile value.',
      playerId: target,
      options: [...hand],
      optional: true,
    };
    return;
  }
  const resp = ctx.response;
  if (resp === null || resp === undefined) return false;
  const cardId = resp as number;
  const age = cardById(cardId).age;
  returnFromHand(g, target, cardId);
  if (age !== 10) return true;
  const distinct = new Set<number>();
  for (const id of g.players[target].scorePile) distinct.add(cardById(id).age);
  for (let i = 0; i < distinct.size; i++) {
    draw(g, target, 10);
    if (g.endByDraw) return true;
  }
  return true;
});

// ---------------------------------------------------------------------------
// Robotics — "Score your top green card. Draw and meld a 10, then execute its
// non-demand dogma effects for yourself only."
// ---------------------------------------------------------------------------
registerDogma('Robotics', (g, target) => {
  const p = g.players[target];
  const greenTop = p.piles.green.cards[0];
  if (greenTop !== undefined) scoreFromBoard(g, target, 'green', greenTop);
  if (g.winnerOverride) return true;
  const drawn = draw(g, target, 10);
  if (drawn === null) return true;
  meldFromHand(g, target, drawn);
  executeSelfOnly(g, drawn, target);
  return true;
});

// ---------------------------------------------------------------------------
// Self Service — two effects:
//   0: "Execute the non-demand dogma effects of any other top card on your
//       board for yourself only."
//   1: "If you have more achievements than each other player, you win."
// ---------------------------------------------------------------------------
registerDogma('Self Service', (g, target, ctx) => {
  if (ctx.levelIndex === 0) {
    if (!ctx.handlerState.asked) {
      const p = g.players[target];
      const eligible: number[] = [];
      for (const c of COLORS) {
        const top = p.piles[c].cards[0];
        if (top === undefined) continue;
        if (cardById(top).title === 'Self Service') continue;
        eligible.push(top);
      }
      if (eligible.length === 0) return false;
      ctx.handlerState.asked = true;
      ctx.pendingChoice = {
        kind: 'select-hand-card',
        prompt: 'Self Service: choose another top card on your board to execute for yourself only.',
        playerId: target,
        options: eligible,
        optional: false,
      };
      return;
    }
    const chosen = ctx.response as number;
    executeSelfOnly(g, chosen, target);
    return true;
  }
  // level 1: more achievements than every other player.
  const mine = g.players[target].ageAchievements.length
    + g.players[target].specialAchievements.length;
  for (const pid of Object.keys(g.players)) {
    if (pid === target) continue;
    const theirs = g.players[pid].ageAchievements.length
      + g.players[pid].specialAchievements.length;
    if (theirs >= mine) return false;
  }
  winSolo(g, target, 'Self Service — most achievements');
  return true;
});

// ---------------------------------------------------------------------------
// Software — two effects:
//   0: "Draw and score a 10."
//   1: "Draw and meld two 10s, then execute the second card's non-demand
//       dogma effects for yourself only."
// ---------------------------------------------------------------------------
registerDogma('Software', (g, target, ctx) => {
  if (ctx.levelIndex === 0) {
    drawAndScore(g, target, 10);
    return true;
  }
  // level 1.
  const first = draw(g, target, 10);
  if (first === null) return true;
  meldFromHand(g, target, first);
  if (g.winnerOverride) return true;
  const second = draw(g, target, 10);
  if (second === null) return true;
  meldFromHand(g, target, second);
  if (g.winnerOverride) return true;
  executeSelfOnly(g, second, target);
  return true;
});

// ---------------------------------------------------------------------------
// Stem Cells — "You may score all cards from your hand. If you score one,
// you must score them all."
// ---------------------------------------------------------------------------
registerDogma('Stem Cells', (g, target, ctx) => {
  const hand = g.players[target].hand;
  if (hand.length === 0) return false;
  if (!ctx.handlerState.asked) {
    ctx.handlerState.asked = true;
    ctx.pendingChoice = {
      kind: 'yes-no',
      prompt: `Stem Cells: score all ${hand.length} cards from your hand?`,
      playerId: target,
      options: [],
      optional: false,
    };
    return;
  }
  if (ctx.response !== true) return false;
  for (const id of [...g.players[target].hand]) {
    scoreFromHand(g, target, id);
    if (g.winnerOverride) return true;
  }
  return true;
});

// ---------------------------------------------------------------------------
// The Internet — three effects:
//   0: "You may splay your green cards up."
//   1: "Draw and score a 10."
//   2: "Draw and meld a 10 for every two [Clock] icons on your board."
// ---------------------------------------------------------------------------
registerDogma('The Internet', (g, target, ctx) => {
  if (ctx.levelIndex === 0) {
    const greenPile = g.players[target].piles.green;
    if (greenPile.cards.length < 2 || greenPile.splay === 'up') return false;
    if (!ctx.handlerState.asked) {
      ctx.handlerState.asked = true;
      ctx.pendingChoice = {
        kind: 'yes-no',
        prompt: 'The Internet: splay your green cards up?',
        playerId: target,
        options: [],
        optional: false,
      };
      return;
    }
    if (ctx.response !== true) return false;
    return splay(g, target, 'green', 'up');
  }
  if (ctx.levelIndex === 1) {
    drawAndScore(g, target, 10);
    return true;
  }
  // level 2.
  const clocks = countIcons(g.players[target], 'clock');
  const n = Math.floor(clocks / 2);
  for (let i = 0; i < n; i++) {
    drawAndMeld(g, target, 10);
    if (g.endByDraw) return true;
  }
  return n > 0;
});
