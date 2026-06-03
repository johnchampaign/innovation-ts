// Mechanics — the composable primitive operations dogma handlers orchestrate.
// Ported from Innovation.Core/Mechanics.cs + ColorStack.cs. Pure mutations on
// the boardgame.io `G` struct (no classes); every handler builds on these and
// never reaches into piles/decks directly.

import type { InnovationState, PlayerData, Color, Splay } from './types';
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
