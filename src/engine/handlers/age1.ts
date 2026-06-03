// Age 1 dogma handlers — starter set for the spike. Each is translated from the
// authoritative TSV rule text (and cross-checked against the C# handler where
// one exists). Covers the three engine paths:
//   • no pause            — Writing, The Wheel, Sailing, Domestication
//   • single optional pick — Agriculture
//   • subset pick          — Pottery
//
// Remaining Age-1 cards (Archery/City States demands, Code of Laws multi-step,
// Masonry, Tools, Oars, Mysticism, Metalworking, Clothing) are intentionally
// unported for now — they fall back to the no-op placeholder. See PORT-PLAN.md.

import { registerDogma } from '../registry';
import { cardById } from '../../card-data';
import {
  claimSpecialAchievement, draw, drawAndMeld, drawAndScore, meldFromHand,
  returnFromHand, scoreFromHand, splay, transferHandToHand, transferHandToScore,
  transferTopCardToPile, tuckFromHand,
} from '../mechanics';
import { countIcons } from '../icons';
import { COLORS } from '../types';
import type { ChoiceResponse, Color, IconName } from '../types';

function cardHasIcon(cardId: number, icon: IconName): boolean {
  return cardById(cardId).icons.includes(icon);
}

// Writing — "Draw a 2."
registerDogma('Writing', (g, target) => {
  draw(g, target, 2);
});

// The Wheel — "Draw two 1s."
registerDogma('The Wheel', (g, target) => {
  draw(g, target, 1);
  draw(g, target, 1);
});

// Sailing — "Draw and meld a 1."
registerDogma('Sailing', (g, target) => {
  drawAndMeld(g, target, 1);
});

// Domestication — "Meld the lowest card in your hand. Draw a 1."
// (On an age tie the rules let the player pick; the spike melds the first such
// card — refine to a choice later.)
registerDogma('Domestication', (g, target) => {
  const hand = g.players[target].hand;
  if (hand.length > 0) {
    let lowest = hand[0];
    for (const id of hand) if (cardById(id).age < cardById(lowest).age) lowest = id;
    meldFromHand(g, target, lowest);
  }
  draw(g, target, 1);
});

// Agriculture — "You may return a card from your hand. If you do, draw and
// score a card of value one higher than the card you returned."
registerDogma('Agriculture', (g, target, ctx) => {
  if (!ctx.handlerState.asked) {
    const hand = g.players[target].hand;
    if (hand.length === 0) return false; // no-op for shared-bonus accounting
    ctx.handlerState.asked = true;
    ctx.pendingChoice = {
      kind: 'select-hand-card',
      prompt: 'Agriculture: you may return a card from your hand to draw and score one a value higher.',
      playerId: target,
      options: [...hand],
      optional: true,
    };
    return;
  }
  const resp = ctx.response;
  if (resp === null || resp === undefined) return false; // declined → no progress
  const cardId = resp as number;
  const returnedAge = cardById(cardId).age;
  returnFromHand(g, target, cardId);
  drawAndScore(g, target, returnedAge + 1);
  return true;
});

// Pottery — TWO effects on the card:
//   level 0: "You may return up to three cards from your hand. If you
//            returned any cards, draw and score a card of value equal to
//            the number of cards you returned."
//   level 1: "Draw a 1."
// One title-keyed handler runs for every level; branch on `ctx.levelIndex`.
// Archery — "I demand you draw a 1, then transfer the highest card in your
// hand to my hand!" Two-step: draw the 1, pause for the target to pick which
// tied-highest to transfer (rulebook p.5: ties go to the target). The single-
// highest case still pauses for symmetry; the adapter can auto-resolve when
// there's only one option.
registerDogma('Archery', (g, target, ctx) => {
  if (!ctx.handlerState.drewAlready) {
    draw(g, target, 1);
    if (g.endByDraw) return true;
    const hand = g.players[target].hand;
    if (hand.length === 0) return true; // defensive — no transfer possible

    const maxAge = Math.max(...hand.map((id) => cardById(id).age));
    const eligible = hand.filter((id) => cardById(id).age === maxAge);
    ctx.handlerState.drewAlready = true;
    ctx.handlerState.activatingPlayerId = g.dogmaRun!.activatingPlayerId;
    ctx.pendingChoice = {
      kind: 'select-hand-card',
      prompt: `Archery: transfer one of your age-${maxAge} cards to the activator's hand.`,
      playerId: target,
      options: eligible,
      optional: false,
    };
    return; // pause (the draw alone is still progress; driver records it on resume)
  }
  // Resume: apply the transfer.
  const cardId = ctx.response as number;
  const activatorId = ctx.handlerState.activatingPlayerId as string;
  transferHandToHand(g, target, activatorId, cardId);
  return true;
});

registerDogma('Pottery', (g, target, ctx) => {
  if (ctx.levelIndex === 0) {
    if (!ctx.handlerState.asked) {
      const hand = g.players[target].hand;
      if (hand.length === 0) return false;
      ctx.handlerState.asked = true;
      ctx.pendingChoice = {
        kind: 'select-hand-card-subset',
        prompt: 'Pottery: you may return up to three cards to draw and score that many.',
        playerId: target,
        options: [...hand],
        optional: true,
        minCount: 0,
        maxCount: Math.min(3, hand.length),
      };
      return;
    }
    const resp: ChoiceResponse | undefined = ctx.response;
    if (Array.isArray(resp) && resp.length > 0) {
      for (const id of resp) returnFromHand(g, target, id);
      drawAndScore(g, target, resp.length);
      return true;
    }
    return false; // declined → no progress for shared-bonus accounting
  }
  // level 1: unconditional "Draw a 1."
  draw(g, target, 1);
  return true;
});

// City States — "I demand you transfer a top card with a [Castle] from your
// board to my board if you have at least four [Castle] icons on your board!
// If you do, draw a 1." Three gates: ≥4 castles, ≥1 top with castle, target
// picks which.
registerDogma('City States', (g, target, ctx) => {
  if (!ctx.handlerState.asked) {
    if (countIcons(g.players[target], 'castle') < 4) return false;
    const eligibleColors: Color[] = [];
    for (const c of COLORS) {
      const top = g.players[target].piles[c].cards[0];
      if (top !== undefined && cardHasIcon(top, 'castle')) eligibleColors.push(c);
    }
    if (eligibleColors.length === 0) return false;
    ctx.handlerState.asked = true;
    ctx.handlerState.activatingPlayerId = g.dogmaRun!.activatingPlayerId;
    ctx.pendingChoice = {
      kind: 'select-board-color',
      prompt: 'City States: transfer one of your top [Castle] cards to the activator\'s board.',
      playerId: target,
      options: eligibleColors.map((c) => COLORS.indexOf(c)),
      optional: false,
    };
    return;
  }
  const colorIdx = ctx.response as number;
  const color = COLORS[colorIdx];
  const activatorId = ctx.handlerState.activatingPlayerId as string;
  const moved = transferTopCardToPile(g, target, activatorId, color);
  if (!moved) return false;
  g.dogmaRun!.demandSuccessful = true;
  if (g.endByDraw) return true;
  draw(g, target, 1);
  return true;
});

// Oars — TWO effects:
//   level 0 (demand): "I demand you transfer a card with a [Crown] from your
//                     hand to my score pile! If you do, draw a 1." (target draws)
//   level 1 (share):  "If no cards were transferred due to this demand, draw a 1."
registerDogma('Oars', (g, target, ctx) => {
  if (ctx.levelIndex === 0) {
    if (!ctx.handlerState.asked) {
      const eligible = g.players[target].hand.filter((id) => cardHasIcon(id, 'crown'));
      if (eligible.length === 0) return false;
      ctx.handlerState.asked = true;
      ctx.handlerState.activatingPlayerId = g.dogmaRun!.activatingPlayerId;
      ctx.pendingChoice = {
        kind: 'select-hand-card',
        prompt: 'Oars: transfer a [Crown] card from your hand to the activator\'s score pile.',
        playerId: target,
        options: eligible,
        optional: false,
      };
      return;
    }
    const cardId = ctx.response as number;
    const activatorId = ctx.handlerState.activatingPlayerId as string;
    transferHandToScore(g, target, activatorId, cardId);
    g.dogmaRun!.demandSuccessful = true;
    if (g.endByDraw) return true;
    draw(g, target, 1);
    return true;
  }
  // level 1: "If no cards were transferred due to this demand, draw a 1."
  if (g.dogmaRun!.demandSuccessful) return false;
  draw(g, target, 1);
  return true;
});

// Clothing — TWO effects:
//   level 0: "Meld a card from your hand of different color from any card on
//            your board." (mandatory if any hand card matches; else no-op)
//   level 1: "Draw and score a 1 for every color present on your board not
//            present on any other player's board."
registerDogma('Clothing', (g, target, ctx) => {
  if (ctx.levelIndex === 0) {
    if (!ctx.handlerState.asked) {
      const p = g.players[target];
      const eligible = p.hand.filter((id) => p.piles[cardById(id).color].cards.length === 0);
      if (eligible.length === 0) return false;
      ctx.handlerState.asked = true;
      ctx.pendingChoice = {
        kind: 'select-hand-card',
        prompt: 'Clothing: meld a card whose color isn\'t already on your board.',
        playerId: target,
        options: eligible,
        optional: false,
      };
      return;
    }
    const cardId = ctx.response as number;
    meldFromHand(g, target, cardId);
    return true;
  }
  // level 1: unique-color bonus. Walk colors; for each that THIS player has
  // and no other player has, draw+score a 1.
  let any = false;
  for (const c of COLORS) {
    if (g.players[target].piles[c].cards.length === 0) continue;
    let othersHave = false;
    for (const [pid, p] of Object.entries(g.players)) {
      if (pid === target) continue;
      if (p.piles[c].cards.length > 0) { othersHave = true; break; }
    }
    if (othersHave) continue;
    drawAndScore(g, target, 1);
    any = true;
    if (g.endByDraw) return true;
  }
  return any;
});

// Code of Laws — "You may tuck a card from your hand of the same color as any
// card on your board. If you do, you may splay that color of your cards left."
// Two pauses: card-pick (optional), then (only if tucked) yes/no for splay.
registerDogma('Code of Laws', (g, target, ctx) => {
  const p = g.players[target];
  if (!ctx.handlerState.step) {
    if (p.hand.length === 0) return false;
    const eligible = p.hand.filter((id) => p.piles[cardById(id).color].cards.length > 0);
    if (eligible.length === 0) return false;
    ctx.handlerState.step = 'pick';
    ctx.pendingChoice = {
      kind: 'select-hand-card',
      prompt: 'Code of Laws: tuck a card whose color matches one of your piles. If you do, you may splay that color left.',
      playerId: target,
      options: eligible,
      optional: true,
    };
    return;
  }
  if (ctx.handlerState.step === 'pick') {
    const resp = ctx.response;
    if (resp === null || resp === undefined) return false; // declined
    const cardId = resp as number;
    const color = cardById(cardId).color;
    tuckFromHand(g, target, cardId);
    ctx.handlerState.step = 'splay';
    ctx.handlerState.color = color;
    ctx.pendingChoice = {
      kind: 'yes-no',
      prompt: `Splay your ${color} cards left?`,
      playerId: target,
      options: [],
      optional: false,
    };
    return;
  }
  // step === 'splay'
  if (ctx.response === true) splay(g, target, ctx.handlerState.color as Color, 'left');
  return true;
});

// Masonry — "You may meld any number of cards from your hand, each with a
// [Castle]. If you melded four or more cards, claim the Monument achievement."
// Phase 2 cut: order-pick prompt + Monument claim are deferred (TODO). For
// now: meld in subset response order, drop Monument logic.
registerDogma('Masonry', (g, target, ctx) => {
  if (!ctx.handlerState.asked) {
    const eligible = g.players[target].hand.filter((id) => cardHasIcon(id, 'castle'));
    if (eligible.length === 0) return false;
    ctx.handlerState.asked = true;
    ctx.pendingChoice = {
      kind: 'select-hand-card-subset',
      prompt: 'Masonry: meld any number of castle-bearing cards. Four or more claims Monument.',
      playerId: target,
      options: eligible,
      optional: true,
      minCount: 0,
      maxCount: eligible.length,
    };
    return;
  }
  const resp = ctx.response;
  if (!Array.isArray(resp) || resp.length === 0) return false;
  for (const id of resp) {
    meldFromHand(g, target, id);
    if (g.endByDraw) return true;
  }
  if (resp.length >= 4) claimSpecialAchievement(g, target, 'Monument');
  return true;
});

// Metalworking — "Draw and reveal a 1. If it has a [Castle], score it and
// repeat this dogma effect. Otherwise, keep it." VB6 bug-1 guard: stop if
// draw cascades off the top of the deck (endByDraw).
registerDogma('Metalworking', (g, target) => {
  let progressed = false;
  while (true) {
    const drawn = draw(g, target, 1);
    if (drawn === null) return progressed; // game just ended
    progressed = true;
    if (cardHasIcon(drawn, 'castle')) {
      scoreFromHand(g, target, drawn);
      if (g.endByDraw) return progressed;
      continue;
    }
    return progressed;
  }
});

// Mysticism — "Draw a 1. If it is the same color as any card on your board,
// meld it and draw a 1." (Match is "any card of that color exists in pile",
// not "top card matches" — VB6 main.frm 4455–4461.)
registerDogma('Mysticism', (g, target) => {
  const drawn = draw(g, target, 1);
  if (drawn === null) return false;
  const color = cardById(drawn).color;
  if (g.players[target].piles[color].cards.length > 0) {
    meldFromHand(g, target, drawn);
    if (!g.endByDraw) draw(g, target, 1);
  }
  return true;
});

// Tools — TWO effects:
//   level 0: "You may return three cards from your hand. If you do, draw and
//            meld a 3." (all-or-nothing — return exactly 3, or 0)
//   level 1: "You may return a 3 from your hand. If you do, draw three 1s."
// Phase 2 cut: skip the order-pick prompt for the level-0 returns (each goes
// to its own age deck, and ties only matter when the player wants to choose
// which copy ends up on the bottom).
registerDogma('Tools', (g, target, ctx) => {
  if (ctx.levelIndex === 0) {
    if (!ctx.handlerState.asked) {
      if (g.players[target].hand.length < 3) return false;
      ctx.handlerState.asked = true;
      ctx.pendingChoice = {
        kind: 'select-hand-card-subset',
        prompt: 'Tools: return three cards from your hand to draw and meld a 3.',
        playerId: target,
        options: [...g.players[target].hand],
        optional: true,
        minCount: 3,
        maxCount: 3,
      };
      return;
    }
    const resp = ctx.response;
    if (!Array.isArray(resp) || resp.length !== 3) return false; // declined
    for (const id of resp) returnFromHand(g, target, id);
    drawAndMeld(g, target, 3);
    return true;
  }
  // level 1
  if (!ctx.handlerState.asked) {
    const threes = g.players[target].hand.filter((id) => cardById(id).age === 3);
    if (threes.length === 0) return false;
    ctx.handlerState.asked = true;
    ctx.pendingChoice = {
      kind: 'select-hand-card',
      prompt: 'Tools: return a 3 from your hand to draw three 1s.',
      playerId: target,
      options: threes,
      optional: true,
    };
    return;
  }
  const resp = ctx.response;
  if (resp === null || resp === undefined) return false; // declined
  returnFromHand(g, target, resp as number);
  for (let i = 0; i < 3; i++) {
    draw(g, target, 1);
    if (g.endByDraw) return true;
  }
  return true;
});
