// Age 8 dogma handlers. Ported from the C# reference handlers in
// Innovation.Core/Handlers/, cross-checked against data/cards.tsv.
//
// Cards:
//   Antibiotics      — AntibioticsHandler.cs
//   Corporations     — CorporationsDemandHandler.cs (+ TSV effect 2: draw and meld an 8)
//   Empiricism       — EmpiricismChooseAndDrawHandler.cs + EmpiricismWinHandler.cs
//   Flight           — FlightAnyColorHandler.cs + FlightSplayRedHandler.cs
//   Mass Media       — MassMediaReturnAndPurgeHandler.cs + MassMediaSplayHandler.cs
//   Mobility         — MobilityDemandHandler.cs
//   Quantum Theory   — QuantumTheoryHandler.cs
//   Rocketry         — RocketryHandler.cs
//   Skyscrapers      — SkyscrapersDemandHandler.cs
//   Socialism        — SocialismHandler.cs
//
// Phase-2 simplifications (deliberate, matching Age-1 precedents like Tools/Pottery):
//   - "OrderMatters"/SelectCardOrder prompts (Antibiotics, Quantum Theory, Socialism)
//     are skipped: the engine handles ties at the deck-bottom symmetrically for our
//     purposes. The subset response is applied in the order the player gave.

import { registerDogma } from '../registry';
import { cardById } from '../../card-data';
import {
  draw, drawAndMeld, drawAndScore, meldFromHand,
  returnFromHand, returnFromScore, scoreFromBoard, returnFromBoard,
  splay, hasIcon, transferBoardToScore, transferBoardToBoard,
  transferHandToHand, tuckFromHand, winSolo, purgeValueFromAllScorePiles,
} from '../mechanics';
import { countIcons } from '../icons';
import { COLORS } from '../types';
import type { Color, ChoiceResponse } from '../types';

// ---------------------------------------------------------------------------
// Antibiotics — "You may return up to three cards from your hand. For every
// different value of card that you returned, draw two 8s."
// ---------------------------------------------------------------------------
registerDogma('Antibiotics', (g, target, ctx) => {
  if (!ctx.handlerState.asked) {
    const hand = g.players[target].hand;
    if (hand.length === 0) return false;
    ctx.handlerState.asked = true;
    ctx.pendingChoice = {
      kind: 'select-hand-card-subset',
      prompt: 'Antibiotics: return up to three cards. Draw two 8s for each distinct age returned.',
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
    returnFromHand(g, target, id);
  }
  const draws = distinctAges.size * 2;
  for (let i = 0; i < draws; i++) {
    draw(g, target, 8);
    if (g.endByDraw) return true;
  }
  return true;
});

// ---------------------------------------------------------------------------
// Corporations — TWO effects:
//   level 0 (demand): "I demand you transfer a top non-green card with a
//                      [Factory] from your board to my score pile! If you do,
//                      draw and meld an 8." (the "you" who draw+melds is the
//                      demand target.)
//   level 1 (share):  "Draw and meld an 8."
// ---------------------------------------------------------------------------
registerDogma('Corporations', (g, target, ctx) => {
  if (ctx.levelIndex === 0) {
    if (!ctx.handlerState.asked) {
      const eligible: Color[] = [];
      for (const c of COLORS) {
        if (c === 'green') continue;
        const top = g.players[target].piles[c].cards[0];
        if (top !== undefined && hasIcon(top, 'factory')) eligible.push(c);
      }
      if (eligible.length === 0) return false;
      ctx.handlerState.asked = true;
      ctx.handlerState.activatingPlayerId = g.dogmaRun!.activatingPlayerId;
      ctx.pendingChoice = {
        kind: 'select-board-color',
        prompt: 'Corporations: transfer a top non-green [Factory] card to the activator\'s score pile.',
        playerId: target,
        options: eligible.map((c) => COLORS.indexOf(c)),
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
    if (g.endByDraw) return true;
    drawAndMeld(g, target, 8);
    return true;
  }
  // level 1: shared "Draw and meld an 8."
  drawAndMeld(g, target, 8);
  return true;
});

// ---------------------------------------------------------------------------
// Empiricism — TWO effects:
//   level 0: "Choose two colors, then draw and reveal a 9. If it is either of
//            the colors you chose, meld it and you may splay your cards of
//            that color up."
//   level 1: "If you have twenty or more [Lightbulb] icons on your board, you
//            win." (solo win)
// ---------------------------------------------------------------------------
registerDogma('Empiricism', (g, target, ctx) => {
  if (ctx.levelIndex === 1) {
    if (countIcons(g.players[target], 'lightbulb') < 20) return false;
    winSolo(g, target, 'Empiricism: 20+ lightbulbs');
    return true;
  }
  // level 0
  const st = ctx.handlerState as {
    stage?: 'first' | 'second' | 'splay';
    first?: Color;
    matched?: Color;
  };
  if (!st.stage) {
    st.stage = 'first';
    ctx.pendingChoice = {
      kind: 'select-board-color',
      prompt: 'Empiricism: choose the first color.',
      playerId: target,
      options: COLORS.map((_, i) => i),
      optional: false,
    };
    return;
  }
  if (st.stage === 'first') {
    const idx = ctx.response as number;
    st.first = COLORS[idx];
    st.stage = 'second';
    const rest: number[] = [];
    for (let i = 0; i < COLORS.length; i++) if (COLORS[i] !== st.first) rest.push(i);
    ctx.pendingChoice = {
      kind: 'select-board-color',
      prompt: `Empiricism: choose the second color (first was ${st.first}).`,
      playerId: target,
      options: rest,
      optional: false,
    };
    return;
  }
  if (st.stage === 'second') {
    const idx = ctx.response as number;
    const second = COLORS[idx];
    const first = st.first!;
    const drawn = draw(g, target, 9);
    if (drawn === null) return true;
    const color = cardById(drawn).color;
    if (color !== first && color !== second) return true;
    meldFromHand(g, target, drawn);
    if (g.endByDraw) return true;
    st.matched = color;
    st.stage = 'splay';
    ctx.pendingChoice = {
      kind: 'yes-no',
      prompt: `Empiricism: splay your ${color} cards up?`,
      playerId: target,
      options: [],
      optional: false,
    };
    return;
  }
  // stage === 'splay'
  if (ctx.response === true && st.matched) splay(g, target, st.matched, 'up');
  return true;
});

// ---------------------------------------------------------------------------
// Flight — TWO effects:
//   level 0: "If your red cards are splayed up, you may splay any one color
//            of your cards up."
//   level 1: "You may splay your red cards up."
// ---------------------------------------------------------------------------
registerDogma('Flight', (g, target, ctx) => {
  if (ctx.levelIndex === 0) {
    if (g.players[target].piles.red.splay !== 'up') return false;
    if (!ctx.handlerState.asked) {
      const eligible: Color[] = [];
      for (const c of COLORS) {
        const s = g.players[target].piles[c];
        if (s.cards.length >= 2 && s.splay !== 'up') eligible.push(c);
      }
      if (eligible.length === 0) return false;
      ctx.handlerState.asked = true;
      ctx.pendingChoice = {
        kind: 'select-board-color',
        prompt: 'Flight: splay any one color up?',
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
  const red = g.players[target].piles.red;
  if (red.cards.length < 2 || red.splay === 'up') return false;
  if (!ctx.handlerState.asked) {
    ctx.handlerState.asked = true;
    ctx.pendingChoice = {
      kind: 'yes-no',
      prompt: 'Flight: splay your red cards up?',
      playerId: target,
      options: [],
      optional: false,
    };
    return;
  }
  if (ctx.response !== true) return false;
  return splay(g, target, 'red', 'up');
});

// ---------------------------------------------------------------------------
// Mass Media — TWO effects:
//   level 0: "You may return a card from your hand. If you do, choose a value,
//            and return all cards of that value from all score piles."
//   level 1: "You may splay your purple cards up."
// ---------------------------------------------------------------------------
registerDogma('Mass Media', (g, target, ctx) => {
  if (ctx.levelIndex === 0) {
    const st = ctx.handlerState as { stage?: 'hand' | 'value' };
    if (!st.stage) {
      const hand = g.players[target].hand;
      if (hand.length === 0) return false;
      st.stage = 'hand';
      ctx.pendingChoice = {
        kind: 'select-hand-card',
        prompt: 'Mass Media: return a card from your hand (then choose a value to purge from all score piles).',
        playerId: target,
        options: [...hand],
        optional: true,
      };
      return;
    }
    if (st.stage === 'hand') {
      const resp = ctx.response;
      if (resp === null || resp === undefined) return false;
      returnFromHand(g, target, resp as number);
      if (g.endByDraw) return true;
      const values = new Set<number>();
      for (const p of Object.values(g.players)) {
        for (const id of p.scorePile) values.add(cardById(id).age);
      }
      if (values.size === 0) return true;
      st.stage = 'value';
      ctx.pendingChoice = {
        kind: 'select-value',
        prompt: 'Mass Media: choose a value to return from all score piles.',
        playerId: target,
        options: [...values].sort((a, b) => a - b),
        optional: false,
      };
      return;
    }
    // stage === 'value'
    const age = ctx.response as number;
    purgeValueFromAllScorePiles(g, age);
    return true;
  }
  // level 1: optional splay purple up.
  const purple = g.players[target].piles.purple;
  if (purple.cards.length < 2 || purple.splay === 'up') return false;
  if (!ctx.handlerState.asked) {
    ctx.handlerState.asked = true;
    ctx.pendingChoice = {
      kind: 'yes-no',
      prompt: 'Mass Media: splay your purple cards up?',
      playerId: target,
      options: [],
      optional: false,
    };
    return;
  }
  if (ctx.response !== true) return false;
  return splay(g, target, 'purple', 'up');
});

// ---------------------------------------------------------------------------
// Mobility — demand: "I demand you transfer your two highest non-red cards
// without a [Factory] from your board to my score pile! If you transferred
// any cards, draw an 8!"
//
// Up to 2 highest-age top cards on non-red piles without a Factory icon. Ties
// at the cutoff age are broken by the target. (Phase-2 simplification: if more
// candidates tie at cutoff than slots remain, prompt once per slot — same as C#.)
// ---------------------------------------------------------------------------
interface MobilityState {
  stage?: 'tie';
  remaining?: number;
  tiedAge?: number;
  transferred?: boolean;
}

registerDogma('Mobility', (g, target, ctx) => {
  const activatorId = g.dogmaRun!.activatingPlayerId;
  const st = ctx.handlerState as MobilityState;

  function eligibleNow(): { color: Color; age: number }[] {
    const out: { color: Color; age: number }[] = [];
    for (const c of COLORS) {
      if (c === 'red') continue;
      const top = g.players[target].piles[c].cards[0];
      if (top === undefined) continue;
      if (hasIcon(top, 'factory')) continue;
      out.push({ color: c, age: cardById(top).age });
    }
    return out;
  }

  function finish(transferred: boolean): boolean | void {
    if (!transferred) return false;
    g.dogmaRun!.demandSuccessful = true;
    if (g.endByDraw) return true;
    draw(g, target, 8);
    return true;
  }

  if (!st.stage) {
    const eligible = eligibleNow();
    if (eligible.length === 0) return false;
    eligible.sort((a, b) => b.age - a.age);
    const take = Math.min(2, eligible.length);
    const cutoffAge = eligible[take - 1].age;
    const above = eligible.filter((e) => e.age > cutoffAge);
    const atCutoff = eligible.filter((e) => e.age === cutoffAge);
    const needFromTied = take - above.length;

    // Transfer auto (strictly above cutoff).
    for (const e of above) transferBoardToScore(g, target, activatorId, e.color);
    let transferred = above.length > 0;

    if (atCutoff.length === needFromTied) {
      for (const e of atCutoff) transferBoardToScore(g, target, activatorId, e.color);
      transferred = transferred || atCutoff.length > 0;
      return finish(transferred);
    }

    // Need to prompt for tie-break.
    st.stage = 'tie';
    st.remaining = needFromTied;
    st.tiedAge = cutoffAge;
    st.transferred = transferred;
    ctx.pendingChoice = {
      kind: 'select-board-color',
      prompt: `Mobility: choose a top non-red age-${cutoffAge} card (without [Factory]) to give up.`,
      playerId: target,
      options: atCutoff.map((e) => COLORS.indexOf(e.color)),
      optional: false,
    };
    return;
  }

  // stage === 'tie'
  const colorIdx = ctx.response as number;
  const color = COLORS[colorIdx];
  transferBoardToScore(g, target, activatorId, color);
  st.transferred = true;
  st.remaining = (st.remaining ?? 1) - 1;

  if (st.remaining > 0) {
    const stillTied: number[] = [];
    for (const c of COLORS) {
      if (c === 'red') continue;
      const top = g.players[target].piles[c].cards[0];
      if (top === undefined) continue;
      if (hasIcon(top, 'factory')) continue;
      if (cardById(top).age === st.tiedAge) stillTied.push(COLORS.indexOf(c));
    }
    if (stillTied.length > 0) {
      ctx.pendingChoice = {
        kind: 'select-board-color',
        prompt: `Mobility: choose another top non-red age-${st.tiedAge} card to give up.`,
        playerId: target,
        options: stillTied,
        optional: false,
      };
      return;
    }
  }
  return finish(true);
});

// ---------------------------------------------------------------------------
// Quantum Theory — "You may return up to two cards from your hand. If you
// return two, draw a 10 and then draw and score a 10."
// ---------------------------------------------------------------------------
registerDogma('Quantum Theory', (g, target, ctx) => {
  if (!ctx.handlerState.asked) {
    const hand = g.players[target].hand;
    if (hand.length === 0) return false;
    ctx.handlerState.asked = true;
    ctx.pendingChoice = {
      kind: 'select-hand-card-subset',
      prompt: 'Quantum Theory: return up to two cards. Returning two draws a 10 and draws+scores a 10.',
      playerId: target,
      options: [...hand],
      optional: true,
      minCount: 0,
      maxCount: Math.min(2, hand.length),
    };
    return;
  }
  const resp = ctx.response;
  if (!Array.isArray(resp) || resp.length === 0) return false;
  for (const id of resp) returnFromHand(g, target, id);
  if (resp.length === 2) {
    draw(g, target, 10);
    if (g.endByDraw) return true;
    drawAndScore(g, target, 10);
  }
  return true;
});

// ---------------------------------------------------------------------------
// Rocketry — "Return a card in any other player's score pile for every two
// [Clock] icons on your board." The activator/target picks one card per pause.
// ---------------------------------------------------------------------------
registerDogma('Rocketry', (g, target, ctx) => {
  const st = ctx.handlerState as { remaining?: number };
  if (st.remaining === undefined) {
    st.remaining = Math.floor(countIcons(g.players[target], 'clock') / 2);
  }

  // If resuming with a previous answer, process it first.
  if (ctx.response !== undefined) {
    const resp = ctx.response;
    if (resp === null) {
      return; // declined further — no-op return so handler ends
    }
    const chosen = resp as number;
    // Find the owner.
    for (const [pid, p] of Object.entries(g.players)) {
      if (pid === target) continue;
      const i = p.scorePile.indexOf(chosen);
      if (i >= 0) {
        returnFromScore(g, pid, chosen);
        break;
      }
    }
    st.remaining = st.remaining - 1;
  }

  if (st.remaining <= 0) return true;

  // Gather options across all other players.
  const eligible: number[] = [];
  for (const [pid, p] of Object.entries(g.players)) {
    if (pid === target) continue;
    eligible.push(...p.scorePile);
  }
  if (eligible.length === 0) return true;

  ctx.pendingChoice = {
    kind: 'select-score-card',
    prompt: `Rocketry: return an opponent score-pile card (${st.remaining} left).`,
    playerId: target,
    options: eligible,
    optional: false,
  };
  return;
});

// ---------------------------------------------------------------------------
// Skyscrapers — demand: "I demand you transfer a top non-yellow card with a
// [Clock] from your board to my board! If you do, score the card beneath it,
// and return all other cards from that pile!"
// ---------------------------------------------------------------------------
registerDogma('Skyscrapers', (g, target, ctx) => {
  const activatorId = g.dogmaRun!.activatingPlayerId;

  function applyTransfer(color: Color): void {
    transferBoardToBoard(g, target, activatorId, color);
    const pile = g.players[target].piles[color];
    if (pile.cards.length === 0) return;
    // The new top is the "card beneath" — score it.
    const beneath = pile.cards[0];
    scoreFromBoard(g, target, color, beneath);
    // Return remaining cards (top-down) to their age decks.
    while (pile.cards.length > 0) {
      const id = pile.cards[0];
      returnFromBoard(g, target, color, id);
    }
  }

  if (!ctx.handlerState.asked) {
    const eligible: Color[] = [];
    for (const c of COLORS) {
      if (c === 'yellow') continue;
      const top = g.players[target].piles[c].cards[0];
      if (top !== undefined && hasIcon(top, 'clock')) eligible.push(c);
    }
    if (eligible.length === 0) return false;
    ctx.handlerState.asked = true;
    ctx.pendingChoice = {
      kind: 'select-board-color',
      prompt: 'Skyscrapers: choose a top non-yellow [Clock] card to transfer.',
      playerId: target,
      options: eligible.map((c) => COLORS.indexOf(c)),
      optional: false,
    };
    return;
  }
  const colorIdx = ctx.response as number;
  const color = COLORS[colorIdx];
  applyTransfer(color);
  g.dogmaRun!.demandSuccessful = true;
  return true;
});

// ---------------------------------------------------------------------------
// Socialism — "You may tuck all cards from your hand. If you tuck one, you
// must tuck them all. If you tucked at least one purple card, take all the
// lowest cards in each other player's hand into your hand."
// ---------------------------------------------------------------------------
registerDogma('Socialism', (g, target, ctx) => {
  if (g.players[target].hand.length === 0) return false;
  if (!ctx.handlerState.asked) {
    ctx.handlerState.asked = true;
    ctx.pendingChoice = {
      kind: 'yes-no',
      prompt: 'Socialism: tuck your entire hand?',
      playerId: target,
      options: [],
      optional: false,
    };
    return;
  }
  if (ctx.response !== true) return false;
  const hand = [...g.players[target].hand];
  let tuckedPurple = false;
  for (const id of hand) {
    if (cardById(id).color === 'purple') tuckedPurple = true;
    tuckFromHand(g, target, id);
  }
  if (!tuckedPurple) return true;
  for (const [pid, p] of Object.entries(g.players)) {
    if (pid === target) continue;
    if (p.hand.length === 0) continue;
    let lowAge = Infinity;
    for (const id of p.hand) lowAge = Math.min(lowAge, cardById(id).age);
    const taken = p.hand.filter((id) => cardById(id).age === lowAge);
    for (const id of taken) transferHandToHand(g, pid, target, id);
  }
  return true;
});

// Suppress unused-var warning in some configurations.
export const _AGE8_LOADED = true;
// Reference to keep ChoiceResponse import meaningful for type-checkers that
// might tree-shake it; it documents the response shape consumed above.
export type _Age8Resp = ChoiceResponse;
