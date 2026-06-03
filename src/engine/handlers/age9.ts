// Age 9 dogma handlers. Ported from Innovation.Core/Handlers/*.cs:
//   Collaboration   — CollaborationDemandHandler.cs + CollaborationWinHandler.cs
//   Composites      — CompositesDemandHandler.cs
//   Computers       — ComputersSplayHandler.cs + ComputersDrawMeldExecuteHandler.cs
//   Ecology         — EcologyHandler.cs
//   Fission         — FissionDemandHandler.cs + FissionReturnHandler.cs
//   Genetics        — GeneticsHandler.cs
//   Satellites      — SatellitesReturnDrawHandler.cs + SatellitesSplayHandler.cs
//                     + SatellitesMeldExecuteHandler.cs
//   Services        — ServicesDemandHandler.cs
//   Specialization  — SpecializationRevealHandler.cs + SpecializationSplayHandler.cs
//   Suburbia        — SuburbiaHandler.cs

import { registerDogma } from '../registry';
import { cardById } from '../../card-data';
import { executeSelfOnly } from '../dogma';
import {
  draw, drawAndScore, hasIcon, meldCard, meldFromHand,
  returnFromBoard, returnFromHand, scoreFromBoard, scoreFromHand, splay,
  transferHandToBoard, transferHandToHand, transferScoreToHand,
  transferScoreToScore, transferTopCardToHand, tuckFromHand, winSolo,
} from '../mechanics';
import { COLORS } from '../types';
import type { Color } from '../types';

// ---------------------------------------------------------------------------
// Collaboration — demand: target draws two 9s; activator picks which one moves
// to activator's board; target melds the other. Second effect: solo-win if
// target has ≥10 green cards on board.
// ---------------------------------------------------------------------------
registerDogma('Collaboration', (g, target, ctx) => {
  if (ctx.levelIndex === 0) {
    if (!ctx.handlerState.drew) {
      const a = draw(g, target, 9);
      if (a === null || g.endByDraw) return true;
      const b = draw(g, target, 9);
      if (b === null || g.endByDraw) return true;
      ctx.handlerState.drew = true;
      ctx.handlerState.a = a;
      ctx.handlerState.b = b;
      ctx.handlerState.activatingPlayerId = g.dogmaRun!.activatingPlayerId;
      ctx.pendingChoice = {
        kind: 'select-hand-card',
        prompt: "Collaboration: choose which drawn card transfers to the activator's board.",
        playerId: g.dogmaRun!.activatingPlayerId,
        options: [a, b],
        optional: false,
      };
      return;
    }
    const toActivator = ctx.response as number;
    const a = ctx.handlerState.a as number;
    const b = ctx.handlerState.b as number;
    const toMeld = toActivator === a ? b : a;
    const activatorId = ctx.handlerState.activatingPlayerId as string;
    transferHandToBoard(g, target, activatorId, toActivator);
    g.dogmaRun!.demandSuccessful = true;
    if (g.winnerOverride || g.endByDraw) return true;
    meldFromHand(g, target, toMeld);
    return true;
  }
  // level 1: "If you have ten or more green cards on your board, you win."
  if (g.players[target].piles.green.cards.length >= 10) {
    winSolo(g, target, 'Collaboration: 10+ green cards on board');
    return true;
  }
  return false;
});

// ---------------------------------------------------------------------------
// Composites — demand: transfer all but one hand card to activator's hand, AND
// transfer the highest score-pile card to activator's score pile.
// ---------------------------------------------------------------------------
registerDogma('Composites', (g, target, ctx) => {
  const activatorId = g.dogmaRun!.activatingPlayerId;
  const step = ctx.handlerState.step as string | undefined;

  if (!step) {
    const hand = g.players[target].hand;
    if (hand.length >= 2) {
      ctx.handlerState.step = 'hand-pick';
      ctx.pendingChoice = {
        kind: 'select-hand-card',
        prompt: 'Composites: choose the one card to keep in your hand.',
        playerId: target,
        options: [...hand],
        optional: false,
      };
      return;
    }
    // hand 0 or 1 — nothing to transfer from hand; fall through to score pick.
    ctx.handlerState.step = 'score-decide';
  }

  if (ctx.handlerState.step === 'hand-pick') {
    const keep = ctx.response as number;
    const toTransfer = g.players[target].hand.filter((id) => id !== keep);
    for (const id of toTransfer) {
      transferHandToHand(g, target, activatorId, id);
    }
    if (toTransfer.length > 0) g.dogmaRun!.demandSuccessful = true;
    ctx.handlerState.step = 'score-decide';
  }

  if (ctx.handlerState.step === 'score-decide') {
    const sp = g.players[target].scorePile;
    if (sp.length === 0) return g.dogmaRun!.demandSuccessful;
    const hi = Math.max(...sp.map((id) => cardById(id).age));
    const tied = sp.filter((id) => cardById(id).age === hi);
    if (tied.length === 1) {
      transferScoreToScore(g, target, activatorId, tied[0]);
      g.dogmaRun!.demandSuccessful = true;
      return true;
    }
    ctx.handlerState.step = 'score-pick';
    ctx.pendingChoice = {
      kind: 'select-score-card',
      prompt: `Composites: choose which of your age-${hi} score cards to give up.`,
      playerId: target,
      options: tied,
      optional: false,
    };
    return;
  }

  // step === 'score-pick'
  const pick = ctx.response as number;
  transferScoreToScore(g, target, activatorId, pick);
  g.dogmaRun!.demandSuccessful = true;
  return true;
});

// ---------------------------------------------------------------------------
// Computers — eff0: optional splay red or green cards up.
//             eff1: draw and meld a 10; executeSelfOnly its non-demand effects.
// ---------------------------------------------------------------------------
registerDogma('Computers', (g, target, ctx) => {
  if (ctx.levelIndex === 0) {
    if (!ctx.handlerState.asked) {
      const eligible: Color[] = [];
      for (const c of ['red', 'green'] as Color[]) {
        const st = g.players[target].piles[c];
        if (st.cards.length >= 2 && st.splay !== 'up') eligible.push(c);
      }
      if (eligible.length === 0) return false;
      ctx.handlerState.asked = true;
      ctx.pendingChoice = {
        kind: 'select-board-color',
        prompt: 'Computers: splay your red or green cards up?',
        playerId: target,
        options: eligible.map((c) => COLORS.indexOf(c)),
        optional: true,
      };
      return;
    }
    const resp = ctx.response;
    if (resp === null || resp === undefined) return false;
    const color = COLORS[resp as number];
    return splay(g, target, color, 'up');
  }
  // level 1
  const id = draw(g, target, 10);
  if (id === null) return true;
  meldFromHand(g, target, id);
  if (g.winnerOverride || g.endByDraw) return true;
  executeSelfOnly(g, id, target);
  return true;
});

// ---------------------------------------------------------------------------
// Ecology — optional return; if returned, score a card and draw two 10s.
// ---------------------------------------------------------------------------
registerDogma('Ecology', (g, target, ctx) => {
  const step = ctx.handlerState.step as string | undefined;
  if (!step) {
    if (g.players[target].hand.length === 0) return false;
    ctx.handlerState.step = 'return';
    ctx.pendingChoice = {
      kind: 'select-hand-card',
      prompt: 'Ecology: you may return a card from your hand to score a card and draw two 10s.',
      playerId: target,
      options: [...g.players[target].hand],
      optional: true,
    };
    return;
  }
  if (step === 'return') {
    const resp = ctx.response;
    if (resp === null || resp === undefined) return false;
    returnFromHand(g, target, resp as number);
    if (g.endByDraw) return true;
    if (g.players[target].hand.length === 0) {
      draw(g, target, 10);
      if (!g.endByDraw) draw(g, target, 10);
      return true;
    }
    ctx.handlerState.step = 'score';
    ctx.pendingChoice = {
      kind: 'select-hand-card',
      prompt: 'Ecology: choose a card to score.',
      playerId: target,
      options: [...g.players[target].hand],
      optional: false,
    };
    return;
  }
  // step === 'score'
  const sid = ctx.response as number;
  scoreFromHand(g, target, sid);
  if (g.endByDraw) return true;
  draw(g, target, 10);
  if (!g.endByDraw) draw(g, target, 10);
  return true;
});

// ---------------------------------------------------------------------------
// Fission — demand: target draws a 10; if RED, wipe all hands/boards/scores.
//           eff1: return a top card other than Fission from any player's board.
//                 Skipped if eff0 wiped the world.
// ---------------------------------------------------------------------------
registerDogma('Fission', (g, target, ctx) => {
  if (ctx.levelIndex === 0) {
    const id = draw(g, target, 10);
    if (id === null) return true;
    g.dogmaRun!.demandSuccessful = true;
    if (cardById(id).color !== 'red') return true;
    // Apocalypse: remove every player's hand/board/score-pile from the game
    // (Fission's text really does "remove ... from this game" permanently).
    for (const p of Object.values(g.players)) {
      g.removedFromGame.push(...p.hand);
      p.hand = [];
      g.removedFromGame.push(...p.scorePile);
      p.scorePile = [];
      for (const c of COLORS) {
        g.removedFromGame.push(...p.piles[c].cards);
        p.piles[c] = { cards: [], splay: 'none' };
      }
    }
    g.dogmaRun!.fissionWiped = true;
    return true;
  }
  // level 1
  if (g.dogmaRun!.fissionWiped) return false;

  if (!ctx.handlerState.asked) {
    // Collect (playerId, color, topCardId) for every top card NOT titled Fission.
    const options: number[] = [];
    const map: Record<number, { pid: string; color: Color }> = {};
    for (const pid of Object.keys(g.players)) {
      const p = g.players[pid];
      for (const c of COLORS) {
        const top = p.piles[c].cards[0];
        if (top === undefined) continue;
        if (cardById(top).title === 'Fission') continue;
        options.push(top);
        map[top] = { pid, color: c };
      }
    }
    if (options.length === 0) return false;
    ctx.handlerState.asked = true;
    ctx.handlerState.map = map;
    ctx.pendingChoice = {
      kind: 'select-score-card',
      prompt: "Fission: choose a top card (other than Fission) from any player's board to return.",
      playerId: target,
      options,
      optional: false,
    };
    return;
  }
  const chosen = ctx.response as number;
  const map = ctx.handlerState.map as Record<number, { pid: string; color: Color }>;
  const where = map[chosen];
  if (!where) return false;
  returnFromBoard(g, where.pid, where.color, chosen);
  return true;
});

// ---------------------------------------------------------------------------
// Genetics — draw and meld a 10; score all cards beneath it (the new top).
// ---------------------------------------------------------------------------
registerDogma('Genetics', (g, target) => {
  const id = draw(g, target, 10);
  if (id === null) return true;
  meldFromHand(g, target, id);
  if (g.winnerOverride || g.endByDraw) return true;
  const color = cardById(id).color;
  const pile = g.players[target].piles[color];
  const beneath = pile.cards.slice(1); // snapshot — scoreFromBoard mutates
  for (const b of beneath) {
    scoreFromBoard(g, target, color, b);
    if (g.winnerOverride || g.endByDraw) return true;
  }
  return true;
});

// ---------------------------------------------------------------------------
// Satellites — eff0: return all cards from hand, draw three 8s.
//              eff1: may splay purple up (yes/no).
//              eff2: meld a card from hand and executeSelfOnly its effects.
// ---------------------------------------------------------------------------
registerDogma('Satellites', (g, target, ctx) => {
  if (ctx.levelIndex === 0) {
    // Return all hand to age decks. Order doesn't materially affect game state
    // (each card goes to bottom of its own age deck); skip the order-pick.
    const hand = [...g.players[target].hand];
    for (const id of hand) {
      returnFromHand(g, target, id);
      if (g.endByDraw) return true;
    }
    for (let i = 0; i < 3; i++) {
      draw(g, target, 8);
      if (g.endByDraw) return true;
    }
    return true;
  }
  if (ctx.levelIndex === 1) {
    const st = g.players[target].piles.purple;
    if (st.cards.length < 2 || st.splay === 'up') return false;
    if (!ctx.handlerState.asked) {
      ctx.handlerState.asked = true;
      ctx.pendingChoice = {
        kind: 'yes-no',
        prompt: 'Satellites: splay your purple cards up?',
        playerId: target,
        options: [],
        optional: false,
      };
      return;
    }
    if (ctx.response === true) return splay(g, target, 'purple', 'up');
    return false;
  }
  // level 2: meld a hand card and execute its non-demand effects for self.
  if (g.players[target].hand.length === 0) return false;
  if (!ctx.handlerState.asked) {
    ctx.handlerState.asked = true;
    ctx.pendingChoice = {
      kind: 'select-hand-card',
      prompt: 'Satellites: meld a card and execute its non-demand effects for yourself.',
      playerId: target,
      options: [...g.players[target].hand],
      optional: false,
    };
    return;
  }
  const id = ctx.response as number;
  meldFromHand(g, target, id);
  if (g.winnerOverride || g.endByDraw) return true;
  executeSelfOnly(g, id, target);
  return true;
});

// ---------------------------------------------------------------------------
// Services — demand: transfer ALL tied-highest score-pile cards to activator's
// HAND. If any moved, target picks a non-leaf top card from activator's board
// to take into their hand.
// ---------------------------------------------------------------------------
registerDogma('Services', (g, target, ctx) => {
  const activatorId = g.dogmaRun!.activatingPlayerId;

  if (!ctx.handlerState.transferred) {
    const sp = g.players[target].scorePile;
    if (sp.length === 0) return false;
    const hi = Math.max(...sp.map((id) => cardById(id).age));
    const tied = sp.filter((id) => cardById(id).age === hi);
    for (const id of tied) transferScoreToHand(g, target, id);
    // transferScoreToHand only operates within a player; move them to activator.
    // Move from target.hand → activator.hand for each tied id.
    for (const id of tied) {
      transferHandToHand(g, target, activatorId, id);
    }
    g.dogmaRun!.demandSuccessful = true;
    ctx.handlerState.transferred = true;

    // Now collect eligible top cards on activator's board without leaf.
    const eligible: number[] = [];
    const map: Record<number, Color> = {};
    for (const c of COLORS) {
      const top = g.players[activatorId].piles[c].cards[0];
      if (top === undefined) continue;
      if (hasIcon(top, 'leaf')) continue;
      eligible.push(top);
      map[top] = c;
    }
    if (eligible.length === 0) return true;
    ctx.handlerState.map = map;
    ctx.handlerState.activatingPlayerId = activatorId;
    ctx.pendingChoice = {
      kind: 'select-score-card',
      prompt: "Services: take a top non-[Leaf] card from the activator's board into your hand.",
      playerId: target,
      options: eligible,
      optional: false,
    };
    return;
  }
  const chosen = ctx.response as number;
  const map = ctx.handlerState.map as Record<number, Color>;
  const color = map[chosen];
  if (color === undefined) return true;
  transferTopCardToHand(g, activatorId, target, color);
  return true;
});

// ---------------------------------------------------------------------------
// Specialization — eff0: reveal a hand card; take that color's top card from
// every other player's board into your hand.
//                  eff1: may splay yellow or blue up.
// ---------------------------------------------------------------------------
registerDogma('Specialization', (g, target, ctx) => {
  if (ctx.levelIndex === 0) {
    if (g.players[target].hand.length === 0) return false;
    if (!ctx.handlerState.asked) {
      ctx.handlerState.asked = true;
      ctx.pendingChoice = {
        kind: 'select-hand-card',
        prompt: 'Specialization: reveal a card from your hand — take that color\'s top card from every other player.',
        playerId: target,
        options: [...g.players[target].hand],
        optional: false,
      };
      return;
    }
    const id = ctx.response as number;
    const color = cardById(id).color;
    let any = false;
    for (const pid of Object.keys(g.players)) {
      if (pid === target) continue;
      const top = g.players[pid].piles[color].cards[0];
      if (top === undefined) continue;
      transferTopCardToHand(g, pid, target, color);
      any = true;
    }
    return any || true; // revealing alone counts as progress (matches C# return true).
  }
  // level 1
  if (!ctx.handlerState.asked) {
    const eligible: Color[] = [];
    for (const c of ['yellow', 'blue'] as Color[]) {
      const st = g.players[target].piles[c];
      if (st.cards.length >= 2 && st.splay !== 'up') eligible.push(c);
    }
    if (eligible.length === 0) return false;
    ctx.handlerState.asked = true;
    ctx.pendingChoice = {
      kind: 'select-board-color',
      prompt: 'Specialization: splay your yellow or blue cards up?',
      playerId: target,
      options: eligible.map((c) => COLORS.indexOf(c)),
      optional: true,
    };
    return;
  }
  const resp = ctx.response;
  if (resp === null || resp === undefined) return false;
  const color = COLORS[resp as number];
  return splay(g, target, color, 'up');
});

// ---------------------------------------------------------------------------
// Suburbia — tuck any number of hand cards; draw and score a 1 for each.
// (Order-pick skipped: each card goes to its own color pile and a multi-tuck
// of the same color tucks each to the bottom-then-bottom, which the engine
// handles in subset response order.)
// ---------------------------------------------------------------------------
registerDogma('Suburbia', (g, target, ctx) => {
  if (!ctx.handlerState.asked) {
    if (g.players[target].hand.length === 0) return false;
    ctx.handlerState.asked = true;
    ctx.pendingChoice = {
      kind: 'select-hand-card-subset',
      prompt: 'Suburbia: tuck any number of cards from your hand. Draw and score a 1 for each.',
      playerId: target,
      options: [...g.players[target].hand],
      optional: true,
      minCount: 0,
      maxCount: g.players[target].hand.length,
    };
    return;
  }
  const resp = ctx.response;
  if (!Array.isArray(resp) || resp.length === 0) return false;
  for (const id of resp) {
    tuckFromHand(g, target, id);
    if (g.endByDraw) return true;
  }
  for (let i = 0; i < resp.length; i++) {
    drawAndScore(g, target, 1);
    if (g.endByDraw) return true;
  }
  return true;
});

// Quiet unused-import warnings for primitives the C# templates referenced but
// the simplified TS port doesn't currently call.
void meldCard;
void transferScoreToHand;
