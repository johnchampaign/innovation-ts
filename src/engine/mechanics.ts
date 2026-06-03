// Mechanics — the composable primitive operations dogma handlers orchestrate.
// Ported from Innovation.Core/Mechanics.cs + ColorStack.cs. Pure mutations on
// the boardgame.io `G` struct (no classes); every handler builds on these and
// never reaches into piles/decks directly.

import type { InnovationState, PlayerData, Color, Splay, IconName } from './types';
import { cardById } from '../card-data';

export function pile(p: PlayerData, color: Color) {
  return p.piles[color];
}

export function topCard(p: PlayerData, color: Color): number | null {
  const st = p.piles[color];
  return st.cards.length > 0 ? st.cards[0] : null;
}

/** Highest age among the player's top cards (0 if the board is empty). The
 *  draw action draws a card of value = max(1, highestTopAge). */
export function highestTopAge(p: PlayerData): number {
  let best = 0;
  for (const color of Object.keys(p.piles) as Color[]) {
    const top = topCard(p, color);
    if (top !== null) best = Math.max(best, cardById(top).age);
  }
  return best;
}

/** Total age of cards in the score pile (the player's "score"). */
export function score(p: PlayerData): number {
  return p.scorePile.reduce((s, id) => s + cardById(id).age, 0);
}

export function achievementCount(p: PlayerData): number {
  return p.ageAchievements.length + p.specialAchievements.length;
}

/** Draw a card of the given age from the supply into the player's hand, going
 *  UP to higher ages when a deck is empty (Innovation's "draw from the next
 *  available deck" rule). Returns the drawn card id, or null if no card exists
 *  at any age ≥ `age` — which means a draw above age 10 was forced and the game
 *  ends (caller sets `g.endByDraw`). */
export function draw(g: InnovationState, playerId: string, age: number): number | null {
  let a = Math.max(1, age);
  while (a <= 10) {
    const deck = g.decks[a];
    if (deck.length > 0) {
      const id = deck.shift()!;
      g.players[playerId].hand.push(id);
      return id;
    }
    a++;
  }
  g.endByDraw = true;
  return null;
}

/** Meld a card already in hand onto the top of its color pile. */
export function meldFromHand(g: InnovationState, playerId: string, cardId: number): void {
  const p = g.players[playerId];
  const i = p.hand.indexOf(cardId);
  if (i < 0) throw new Error(`meld: card ${cardId} not in player ${playerId}'s hand`);
  p.hand.splice(i, 1);
  meldCard(g, playerId, cardId);
}

/** Place a card on top of its color pile (used by draw-and-meld effects too). */
export function meldCard(g: InnovationState, playerId: string, cardId: number): void {
  const color = cardById(cardId).color;
  g.players[playerId].piles[color].cards.unshift(cardId);
}

/** Tuck a card (from hand) to the BOTTOM of its color pile. */
export function tuckFromHand(g: InnovationState, playerId: string, cardId: number): void {
  const p = g.players[playerId];
  const i = p.hand.indexOf(cardId);
  if (i < 0) throw new Error(`tuck: card ${cardId} not in hand`);
  p.hand.splice(i, 1);
  const color = cardById(cardId).color;
  p.piles[color].cards.push(cardId);
  p.tuckedThisTurn++;
}

/** Score a card from hand: move it to the score pile. */
export function scoreFromHand(g: InnovationState, playerId: string, cardId: number): void {
  const p = g.players[playerId];
  const i = p.hand.indexOf(cardId);
  if (i < 0) throw new Error(`score: card ${cardId} not in hand`);
  p.hand.splice(i, 1);
  p.scorePile.push(cardId);
  p.scoredThisTurn++;
}

/** Draw a card of `age` and immediately score it. */
export function drawAndScore(g: InnovationState, playerId: string, age: number): void {
  const id = draw(g, playerId, age);
  if (id === null) return;
  scoreFromHand(g, playerId, id);
}

/** Draw a card of `age` and immediately meld it. */
export function drawAndMeld(g: InnovationState, playerId: string, age: number): void {
  const id = draw(g, playerId, age);
  if (id === null) return;
  meldFromHand(g, playerId, id);
}

/** Return a card from hand to the BOTTOM of its age deck. */
export function returnFromHand(g: InnovationState, playerId: string, cardId: number): void {
  const p = g.players[playerId];
  const i = p.hand.indexOf(cardId);
  if (i < 0) throw new Error(`return: card ${cardId} not in hand`);
  p.hand.splice(i, 1);
  g.decks[cardById(cardId).age].push(cardId);
}

/** Transfer a card from one player's hand to another's. Used by Archery and
 *  other "I demand … transfer a card" handlers. */
export function transferHandToHand(
  g: InnovationState,
  fromId: string,
  toId: string,
  cardId: number,
): void {
  const from = g.players[fromId];
  const i = from.hand.indexOf(cardId);
  if (i < 0) throw new Error(`transferHandToHand: card ${cardId} not in ${fromId}'s hand`);
  from.hand.splice(i, 1);
  g.players[toId].hand.push(cardId);
}

/** Transfer a hand card to another player's score pile. Used by Oars. */
export function transferHandToScore(
  g: InnovationState,
  fromId: string,
  toId: string,
  cardId: number,
): void {
  const from = g.players[fromId];
  const i = from.hand.indexOf(cardId);
  if (i < 0) throw new Error(`transferHandToScore: card ${cardId} not in ${fromId}'s hand`);
  from.hand.splice(i, 1);
  g.players[toId].scorePile.push(cardId);
}

/** Transfer the top card of a color pile from one player to the top of the
 *  same color pile on another player's board. Used by City States. Returns
 *  true if a card moved (false if the source pile was empty). */
export function transferTopCardToPile(
  g: InnovationState,
  fromId: string,
  toId: string,
  color: Color,
): boolean {
  const src = g.players[fromId].piles[color];
  if (src.cards.length === 0) return false;
  const top = src.cards.shift()!;
  // The transferred pile loses its splay when emptied to a single card —
  // unsplay if drop below 2 (mirrors C#: pile of <2 has no splay).
  if (src.cards.length < 2) src.splay = 'none';
  g.players[toId].piles[color].cards.unshift(top);
  return true;
}

/** Apply a splay to a color pile. A pile of <2 cards can't be splayed; a splay
 *  matching the current direction is a no-op. */
export function splay(g: InnovationState, playerId: string, color: Color, dir: Splay): boolean {
  const st = g.players[playerId].piles[color];
  if (st.cards.length < 2) return false;
  if (st.splay === dir) return false;
  st.splay = dir;
  return true;
}

// ---------------------------------------------------------------------------
// Phase-1.5 primitives (added before fanning out Ages 2-10).
// Ported from the C# Mechanics.* surface used by the Age 2-10 handlers.
// ---------------------------------------------------------------------------

/** True if any of the card's four corner slots displays the given icon.
 *  Helper used wherever a handler asks "does this card have a Castle?". */
export function hasIcon(cardId: number, icon: IconName): boolean {
  return cardById(cardId).icons.includes(icon);
}

/** Return a score-pile card to the BOTTOM of its age deck. Used by Education,
 *  Anatomy, Vaccination, Mass Media, etc. */
export function returnFromScore(g: InnovationState, playerId: string, cardId: number): void {
  const p = g.players[playerId];
  const i = p.scorePile.indexOf(cardId);
  if (i < 0) throw new Error(`returnFromScore: card ${cardId} not in ${playerId}'s score pile`);
  p.scorePile.splice(i, 1);
  g.decks[cardById(cardId).age].push(cardId);
}

/** Transfer a score-pile card from one player's score pile to another's. Used
 *  by Mapmaking, Medicine, Pirate Code, Combustion, Navigation, Optics, etc. */
export function transferScoreToScore(
  g: InnovationState,
  fromId: string,
  toId: string,
  cardId: number,
): void {
  const from = g.players[fromId];
  const i = from.scorePile.indexOf(cardId);
  if (i < 0) throw new Error(`transferScoreToScore: card ${cardId} not in ${fromId}'s score pile`);
  from.scorePile.splice(i, 1);
  g.players[toId].scorePile.push(cardId);
}

/** Move a score-pile card into the same player's hand. Used by Canal Building. */
export function transferScoreToHand(
  g: InnovationState,
  playerId: string,
  cardId: number,
): void {
  const p = g.players[playerId];
  const i = p.scorePile.indexOf(cardId);
  if (i < 0) throw new Error(`transferScoreToHand: card ${cardId} not in ${playerId}'s score pile`);
  p.scorePile.splice(i, 1);
  p.hand.push(cardId);
}

/** Transfer the top card of a color pile to another player's same-color pile
 *  (top). Identical to `transferTopCardToPile` — exposed under the C# name so
 *  ported handlers read 1:1. */
export const transferBoardToBoard = transferTopCardToPile;

/** Transfer the top card of a color pile to the recipient's score pile. Used
 *  by Monotheism, Engineering, Gunpowder, Corporations, Mobility,
 *  Bioengineering. Returns the moved card id, or null if pile was empty. */
export function transferBoardToScore(
  g: InnovationState,
  fromId: string,
  toId: string,
  color: Color,
): number | null {
  const src = g.players[fromId].piles[color];
  if (src.cards.length === 0) return null;
  const top = src.cards.shift()!;
  if (src.cards.length < 2) src.splay = 'none';
  g.players[toId].scorePile.push(top);
  return top;
}

/** Transfer a hand card directly onto another player's color pile (as the new
 *  top). Used by Collaboration. */
export function transferHandToBoard(
  g: InnovationState,
  fromId: string,
  toId: string,
  cardId: number,
): void {
  const from = g.players[fromId];
  const i = from.hand.indexOf(cardId);
  if (i < 0) throw new Error(`transferHandToBoard: card ${cardId} not in ${fromId}'s hand`);
  from.hand.splice(i, 1);
  const color = cardById(cardId).color;
  g.players[toId].piles[color].cards.unshift(cardId);
}

/** Transfer the top of a color pile to another player's hand. Used by
 *  Specialization and the cross-player branch of Services. Returns the moved
 *  card id, or null if the pile was empty. */
export function transferTopCardToHand(
  g: InnovationState,
  fromId: string,
  toId: string,
  color: Color,
): number | null {
  const src = g.players[fromId].piles[color];
  if (src.cards.length === 0) return null;
  const top = src.cards.shift()!;
  if (src.cards.length < 2) src.splay = 'none';
  g.players[toId].hand.push(top);
  return top;
}

/** Score a card from somewhere in a color pile (top or covered) into the
 *  owner's score pile. Splay drops if the pile falls below 2 cards. */
export function scoreFromBoard(
  g: InnovationState,
  playerId: string,
  color: Color,
  cardId: number,
): void {
  const p = g.players[playerId];
  const pile = p.piles[color];
  const i = pile.cards.indexOf(cardId);
  if (i < 0) throw new Error(`scoreFromBoard: card ${cardId} not in ${playerId}'s ${color} pile`);
  pile.cards.splice(i, 1);
  if (pile.cards.length < 2) pile.splay = 'none';
  p.scorePile.push(cardId);
  p.scoredThisTurn++;
}

/** Return a card from anywhere in a color pile (top or covered) to the bottom
 *  of its age deck. */
export function returnFromBoard(
  g: InnovationState,
  playerId: string,
  color: Color,
  cardId: number,
): void {
  const p = g.players[playerId];
  const pile = p.piles[color];
  const i = pile.cards.indexOf(cardId);
  if (i < 0) throw new Error(`returnFromBoard: card ${cardId} not in ${playerId}'s ${color} pile`);
  pile.cards.splice(i, 1);
  if (pile.cards.length < 2) pile.splay = 'none';
  g.decks[cardById(cardId).age].push(cardId);
}

/** Meld a score-pile card directly onto its color pile (top). Used by
 *  Translation, Encyclopedia. */
export function meldFromScore(g: InnovationState, playerId: string, cardId: number): void {
  const p = g.players[playerId];
  const i = p.scorePile.indexOf(cardId);
  if (i < 0) throw new Error(`meldFromScore: card ${cardId} not in ${playerId}'s score pile`);
  p.scorePile.splice(i, 1);
  meldCard(g, playerId, cardId);
}

/** Reorder a color pile (top-first). Used by Publications. The new order must
 *  be a permutation of the pile's current cards. */
export function reorderPile(
  g: InnovationState,
  playerId: string,
  color: Color,
  newOrder: number[],
): void {
  const pile = g.players[playerId].piles[color];
  if (newOrder.length !== pile.cards.length) {
    throw new Error(`reorderPile: length mismatch (${newOrder.length} vs ${pile.cards.length})`);
  }
  const expected = new Set(pile.cards);
  for (const id of newOrder) {
    if (!expected.delete(id)) throw new Error(`reorderPile: ${id} not in or duplicated`);
  }
  pile.cards = [...newOrder];
}

/** Return every card of the given age from every player's score pile to the
 *  bottom of the age deck. Used by Mass Media. */
export function purgeValueFromAllScorePiles(g: InnovationState, age: number): void {
  for (const p of Object.values(g.players)) {
    const keep: number[] = [];
    const purge: number[] = [];
    for (const id of p.scorePile) {
      if (cardById(id).age === age) purge.push(id);
      else keep.push(id);
    }
    p.scorePile = keep;
    for (const id of purge) g.decks[age].push(id);
  }
}

/** Solo-win: end the game immediately with one declared winner. Used by
 *  Empiricism, Collaboration, AI, Bioengineering, Globalization, Self Service.
 *  Sets `G.winnerOverride`; `endIf` picks it up at the next reducer step. */
export function winSolo(g: InnovationState, playerId: string, reason: string): void {
  g.winnerOverride = { winners: [playerId], reason };
}

/** Claim a special achievement (Monument / Empire / World / Wonder / Universe)
 *  if it's still in the supply. Used by Masonry (Monument when ≥4 cards melded
 *  in one effect), Construction (Empire), Translation (World), Astronomy
 *  (Universe), Invention (Wonder). The eligibility conditions live in the
 *  card-text triggers themselves; this primitive just moves the tile.
 *  Returns true if claimed, false if it had already been taken (or if it
 *  isn't listed in the supply for some reason). */
export function claimSpecialAchievement(
  g: InnovationState,
  playerId: string,
  name: string,
): boolean {
  const i = g.availableSpecialAchievements.indexOf(name);
  if (i < 0) return false;
  g.availableSpecialAchievements.splice(i, 1);
  g.players[playerId].specialAchievements.push(name);
  return true;
}
