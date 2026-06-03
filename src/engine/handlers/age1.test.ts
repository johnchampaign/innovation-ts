// Tests for the ported Age-1 dogma handlers. Selectively re-ported from
// Innovation.Tests/Age1AutoHandlerTests.cs + Age1ChoiceHandlerTests.cs — only
// the cards currently in the registry (Writing, The Wheel, Sailing,
// Domestication, Agriculture, Pottery). Each test runs through the driver via
// startDogma so it exercises the real wiring, with a 1-player game so sharing
// targets reduce to [activator] (no opponent ⇒ no sharer noise).

import { describe, expect, it } from 'vitest';
import '../handlers';
import { startDogma, resumeDogma } from '../dogma';
import { ALL_CARDS, cardById, cardByTitle } from '../../card-data';
import type { InnovationState, PlayerData } from '../types';
import { COLORS } from '../types';

function newPlayer(): PlayerData {
  const piles = {} as PlayerData['piles'];
  for (const c of COLORS) piles[c] = { cards: [], splay: 'none' };
  return {
    hand: [], scorePile: [], piles,
    ageAchievements: [], specialAchievements: [],
    scoredThisTurn: 0, tuckedThisTurn: 0,
  };
}

function freshGame(numPlayers = 1): InnovationState {
  const g: InnovationState = {
    decks: Array.from({ length: 11 }, () => [] as number[]),
    players: {},
    availableAgeAchievements: [],
    availableSpecialAchievements: [],
    actionsRemaining: 2,
    pendingChoice: null,
    dogmaRun: null,
    endByDraw: false,
    log: [],
  };
  for (const c of ALL_CARDS) g.decks[c.age].push(c.id);
  for (let i = 0; i < numPlayers; i++) g.players[String(i)] = newPlayer();
  return g;
}

describe('Writing', () => {
  it('draws a 2 for the activator', () => {
    const g = freshGame();
    const expected = g.decks[2][0];
    startDogma(g, cardByTitle('Writing').id, '0');
    expect(g.players['0'].hand).toContain(expected);
  });
});

describe('The Wheel', () => {
  it('draws two 1s for the activator', () => {
    const g = freshGame();
    const first = g.decks[1][0];
    const second = g.decks[1][1];
    startDogma(g, cardByTitle('The Wheel').id, '0');
    expect(g.players['0'].hand).toContain(first);
    expect(g.players['0'].hand).toContain(second);
  });
});

describe('Sailing', () => {
  it('draws a 1 and melds it (no card lingers in hand)', () => {
    const g = freshGame();
    const drawn = g.decks[1][0];
    const color = cardById(drawn).color;
    startDogma(g, cardByTitle('Sailing').id, '0');
    expect(g.players['0'].hand).not.toContain(drawn);
    expect(g.players['0'].piles[color].cards[0]).toBe(drawn);
  });
});

describe('Domestication', () => {
  it('melds the lowest-age card from hand, then draws a 1', () => {
    const g = freshGame();
    // Hand: one age-1, one age-2 → lowest is age-1.
    const age1 = g.decks[1].shift()!;
    const age2 = g.decks[2].shift()!;
    g.players['0'].hand = [age2, age1];
    const nextDraw = g.decks[1][0];

    startDogma(g, cardByTitle('Domestication').id, '0');

    expect(g.players['0'].piles[cardById(age1).color].cards[0]).toBe(age1);
    expect(g.players['0'].hand).toContain(age2);   // age-2 untouched
    expect(g.players['0'].hand).toContain(nextDraw);
  });

  it('with an empty hand, still draws a 1', () => {
    const g = freshGame();
    const expected = g.decks[1][0];
    startDogma(g, cardByTitle('Domestication').id, '0');
    expect(g.players['0'].hand).toContain(expected);
  });
});

describe('Agriculture', () => {
  it('pauses with a hand-pick prompt on first invocation', () => {
    const g = freshGame();
    const a = g.decks[1].shift()!;
    g.players['0'].hand = [a];
    const done = startDogma(g, cardByTitle('Agriculture').id, '0');
    expect(done).toBe(false);
    expect(g.pendingChoice?.kind).toBe('select-hand-card');
    expect(g.pendingChoice?.playerId).toBe('0');
    expect(g.pendingChoice?.options).toContain(a);
    expect(g.pendingChoice?.optional).toBe(true);
  });

  it('on decline (null response): no-op, no shared bonus', () => {
    const g = freshGame();
    const a = g.decks[1].shift()!;
    g.players['0'].hand = [a];
    startDogma(g, cardByTitle('Agriculture').id, '0');
    const handBefore = g.players['0'].hand.length;
    const done = resumeDogma(g, null);
    expect(done).toBe(true);
    expect(g.players['0'].hand.length).toBe(handBefore); // unchanged
    expect(g.players['0'].scorePile.length).toBe(0);
  });

  it('on pick: returns the card and draws-and-scores one age higher', () => {
    const g = freshGame();
    const a1 = g.decks[1].shift()!;
    g.players['0'].hand = [a1];
    const nextAge2 = g.decks[2][0];
    startDogma(g, cardByTitle('Agriculture').id, '0');
    const done = resumeDogma(g, a1);
    expect(done).toBe(true);
    expect(g.players['0'].hand).not.toContain(a1);
    // The returned card lands at the bottom of its age deck.
    expect(g.decks[1].at(-1)).toBe(a1);
    expect(g.players['0'].scorePile).toContain(nextAge2);
  });

  it('empty hand: handler completes without pausing', () => {
    const g = freshGame();
    g.players['0'].hand = []; // explicit
    const done = startDogma(g, cardByTitle('Agriculture').id, '0');
    expect(done).toBe(true);
    expect(g.pendingChoice).toBeNull();
  });
});

describe('Archery (demand)', () => {
  /** Remove a card from its age deck (use when seeding hand/board directly so
   *  the same id can't be re-drawn). Mirrors what the real GameSetup does. */
  function takeFromDeck(g: InnovationState, cardId: number): number {
    const age = cardById(cardId).age;
    const i = g.decks[age].indexOf(cardId);
    if (i >= 0) g.decks[age].splice(i, 1);
    return cardId;
  }

  // Build a 2-player game where the activator has a castle advantage so the
  // demand actually hits player 1.
  function archeryGame(p1HandTitles: string[]): InnovationState {
    const g = freshGame(2);
    // Activator: Domestication (yellow) — 2 castles → outranks p1's 0 castles.
    const dom = takeFromDeck(g, cardByTitle('Domestication').id);
    g.players['0'].piles.yellow.cards = [dom];
    g.players['1'].hand = p1HandTitles.map((t) => takeFromDeck(g, cardByTitle(t).id));
    return g;
  }

  it('via engine: pauses on the demanded player with tied-highest options', () => {
    const g = archeryGame(['Agriculture']); // one age-1 in target's hand
    const drewExpected = g.decks[1][0];
    const done = startDogma(g, cardByTitle('Archery').id, '0');
    expect(done).toBe(false);
    expect(g.pendingChoice?.kind).toBe('select-hand-card');
    expect(g.pendingChoice?.playerId).toBe('1'); // owned by the target
    expect(g.pendingChoice?.optional).toBe(false);
    // Target drew the top 1 — hand is now 2 cards, both age 1, both tied-highest.
    expect(g.players['1'].hand).toContain(drewExpected);
    expect(g.pendingChoice?.options.length).toBe(2);
  });

  it('via engine: target picks tied-highest → transferred to activator', () => {
    const g = archeryGame(['Agriculture']);
    startDogma(g, cardByTitle('Archery').id, '0');
    const choice = g.pendingChoice!.options[0];
    const done = resumeDogma(g, choice);
    expect(done).toBe(true);
    expect(g.players['0'].hand).toContain(choice);
    expect(g.players['1'].hand).not.toContain(choice);
  });

  it('via engine: no demand target when activator has no icon advantage', () => {
    const g = freshGame(2); // both players: 0 castles
    const agri = takeFromDeck(g, cardByTitle('Agriculture').id);
    g.players['1'].hand = [agri];
    const done = startDogma(g, cardByTitle('Archery').id, '0');
    expect(done).toBe(true);
    expect(g.pendingChoice).toBeNull();
    expect(g.players['1'].hand).toContain(agri); // untouched
  });

  function takeFromDeck(g: InnovationState, cardId: number): number {
    const age = cardById(cardId).age;
    const i = g.decks[age].indexOf(cardId);
    if (i >= 0) g.decks[age].splice(i, 1);
    return cardId;
  }

  it('demand does NOT trigger the shared-bonus draw', () => {
    const g = archeryGame(['Agriculture']);
    const handBefore = g.players['0'].hand.length;
    startDogma(g, cardByTitle('Archery').id, '0');
    resumeDogma(g, g.pendingChoice!.options[0]);
    // Activator gained exactly the transferred card — no extra share-bonus draw.
    expect(g.players['0'].hand.length).toBe(handBefore + 1);
  });
});

describe('Pottery', () => {
  it('pauses with a subset prompt capped at three on first invocation', () => {
    const g = freshGame();
    g.players['0'].hand = [
      g.decks[1].shift()!, g.decks[1].shift()!, g.decks[1].shift()!, g.decks[1].shift()!,
    ];
    const done = startDogma(g, cardByTitle('Pottery').id, '0');
    expect(done).toBe(false);
    expect(g.pendingChoice?.kind).toBe('select-hand-card-subset');
    expect(g.pendingChoice?.maxCount).toBe(3); // capped even with 4 in hand
    expect(g.pendingChoice?.minCount).toBe(0);
    expect(g.pendingChoice?.optional).toBe(true);
  });

  it('returning two cards draws+scores an age-2 and then draws a 1', () => {
    const g = freshGame();
    const a = g.decks[1].shift()!;
    const b = g.decks[1].shift()!;
    g.players['0'].hand = [a, b];
    const expectedScored = g.decks[2][0];
    startDogma(g, cardByTitle('Pottery').id, '0');
    const expectedDrawn = g.decks[1][0];
    const done = resumeDogma(g, [a, b]);
    expect(done).toBe(true);
    expect(g.players['0'].scorePile).toContain(expectedScored);
    expect(g.players['0'].hand).toContain(expectedDrawn);
    expect(g.players['0'].hand).not.toContain(a);
    expect(g.players['0'].hand).not.toContain(b);
  });

  it('returning zero cards: no score, but still draws a 1', () => {
    const g = freshGame();
    const a = g.decks[1].shift()!;
    g.players['0'].hand = [a];
    startDogma(g, cardByTitle('Pottery').id, '0');
    const expectedDrawn = g.decks[1][0];
    const done = resumeDogma(g, []);
    expect(done).toBe(true);
    expect(g.players['0'].scorePile.length).toBe(0);
    expect(g.players['0'].hand).toContain(expectedDrawn);
    expect(g.players['0'].hand).toContain(a); // still in hand
  });
});
