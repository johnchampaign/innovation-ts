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
  draw, drawAndMeld, drawAndScore, meldFromHand, returnFromHand, transferHandToHand,
} from '../mechanics';
import type { ChoiceResponse } from '../types';

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
