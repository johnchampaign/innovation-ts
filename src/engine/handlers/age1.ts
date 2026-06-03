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
  draw, drawAndMeld, drawAndScore, meldFromHand, returnFromHand,
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
    if (hand.length === 0) return;
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
  if (resp === null || resp === undefined) return; // declined
  const cardId = resp as number;
  const returnedAge = cardById(cardId).age;
  returnFromHand(g, target, cardId);
  drawAndScore(g, target, returnedAge + 1);
});

// Pottery — "You may return up to three cards from your hand. If you do, draw
// and score a card of value equal to the number of cards you returned." then a
// separate effect: "Draw a 1."
registerDogma('Pottery', (g, target, ctx) => {
  if (!ctx.handlerState.asked) {
    ctx.handlerState.asked = true;
    const hand = g.players[target].hand;
    if (hand.length > 0) {
      ctx.pendingChoice = {
        kind: 'select-hand-card-subset',
        prompt: 'Pottery: you may return up to three cards to draw and score that many.',
        playerId: target,
        options: [...hand],
        optional: true,
        minCount: 0,
        maxCount: Math.min(3, hand.length),
      };
      return; // wait for the subset answer; "Draw a 1" runs on resume below
    }
  } else {
    const resp: ChoiceResponse | undefined = ctx.response;
    if (Array.isArray(resp) && resp.length > 0) {
      for (const id of resp) returnFromHand(g, target, id);
      drawAndScore(g, target, resp.length);
    }
  }
  // Second effect, always runs: "Draw a 1."
  draw(g, target, 1);
});
