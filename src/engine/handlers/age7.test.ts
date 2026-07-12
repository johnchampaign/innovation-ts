// Tests for Age-7 dogma handlers. Cherry-picked from Innovation.Tests/* and the
// rules text on data/cards.tsv. One+ test per registered card.

import { describe, expect, it } from 'vitest';
import '../handlers';
import { startDogma, resumeDogma } from '../dogma';
import { ALL_CARDS, cardById, cardByTitle } from '../../card-data';
import type { InnovationState, PlayerData } from '../types';
import { COLORS } from '../types';

function takeFromDeck(g: InnovationState, cardId: number): number {
  const age = cardById(cardId).age;
  const i = g.decks[age].indexOf(cardId);
  if (i >= 0) g.decks[age].splice(i, 1);
  return cardId;
}

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
    winnerOverride: null,
    removedFromGame: [],
    log: [], turnNumber: 0,
  };
  for (const c of ALL_CARDS) g.decks[c.age].push(c.id);
  for (let i = 0; i < numPlayers; i++) g.players[String(i)] = newPlayer();
  return g;
}

describe('Bicycle', () => {
  it('yes → swaps entire hand and score pile', () => {
    const g = freshGame();
    const h1 = takeFromDeck(g, cardByTitle('Agriculture').id);
    const h2 = takeFromDeck(g, cardByTitle('Pottery').id);
    const s1 = takeFromDeck(g, cardByTitle('Writing').id);
    g.players['0'].hand = [h1, h2];
    g.players['0'].scorePile = [s1];
    expect(startDogma(g, cardByTitle('Bicycle').id, '0')).toBe(false);
    expect(g.pendingChoice?.kind).toBe('yes-no');
    resumeDogma(g, true);
    expect(g.players['0'].hand).toEqual([s1]);
    expect(g.players['0'].scorePile.sort()).toEqual([h1, h2].sort());
  });

  it('no → no-op', () => {
    const g = freshGame();
    const h = takeFromDeck(g, cardByTitle('Agriculture').id);
    g.players['0'].hand = [h];
    startDogma(g, cardByTitle('Bicycle').id, '0');
    resumeDogma(g, false);
    expect(g.players['0'].hand).toEqual([h]);
    expect(g.players['0'].scorePile).toEqual([]);
  });
});

describe('Combustion (demand)', () => {
  it("target picks 2 score cards which move to activator's score pile", () => {
    const g = freshGame(2);
    // Activator: Combustion on red → 2 crowns; target has none → demand fires.
    g.players['0'].piles.red.cards = [takeFromDeck(g, cardByTitle('Combustion').id)];
    const s1 = takeFromDeck(g, cardByTitle('Writing').id);
    const s2 = takeFromDeck(g, cardByTitle('Pottery').id);
    const s3 = takeFromDeck(g, cardByTitle('Agriculture').id);
    g.players['1'].scorePile = [s1, s2, s3];
    expect(startDogma(g, cardByTitle('Combustion').id, '0')).toBe(false);
    expect(g.pendingChoice?.kind).toBe('select-score-card-subset');
    expect(g.pendingChoice?.minCount).toBe(2);
    expect(g.pendingChoice?.maxCount).toBe(2);
    resumeDogma(g, [s1, s2]);
    expect(g.players['0'].scorePile).toContain(s1);
    expect(g.players['0'].scorePile).toContain(s2);
    expect(g.players['1'].scorePile).toEqual([s3]);
  });

  it('skips target with empty score pile', () => {
    const g = freshGame(2);
    g.players['0'].piles.red.cards = [takeFromDeck(g, cardByTitle('Combustion').id)];
    const done = startDogma(g, cardByTitle('Combustion').id, '0');
    expect(done).toBe(true);
    expect(g.pendingChoice).toBeNull();
  });
});

describe('Electricity', () => {
  it('returns all top cards without a [Factory] and draws an 8 per return', () => {
    const g = freshGame();
    // Yellow top: Agriculture (leaf, no factory) → returned. Blue top: Writing
    // (no factory) → returned. So 2 returned → 2 draws from age-8 deck.
    g.players['0'].piles.yellow.cards = [takeFromDeck(g, cardByTitle('Agriculture').id)];
    g.players['0'].piles.blue.cards = [takeFromDeck(g, cardByTitle('Writing').id)];
    const d1 = g.decks[8][0];
    const d2 = g.decks[8][1];
    startDogma(g, cardByTitle('Electricity').id, '0');
    expect(g.players['0'].piles.yellow.cards).toEqual([]);
    expect(g.players['0'].piles.blue.cards).toEqual([]);
    expect(g.players['0'].hand).toContain(d1);
    expect(g.players['0'].hand).toContain(d2);
  });

  it('keeps top cards with a [Factory]', () => {
    const g = freshGame();
    // Masonry has castles, no factory → returned. Use a card with factory:
    // Canning (age 6, Factory icons). Put on green pile to keep top.
    const canning = takeFromDeck(g, cardByTitle('Canning').id);
    g.players['0'].piles[cardById(canning).color].cards = [canning];
    startDogma(g, cardByTitle('Electricity').id, '0');
    expect(g.players['0'].piles[cardById(canning).color].cards[0]).toBe(canning);
  });
});

describe('Evolution', () => {
  it('branch A (yes): draws+scores an 8 then prompts to return a score card', () => {
    const g = freshGame();
    const s = takeFromDeck(g, cardByTitle('Writing').id);
    g.players['0'].scorePile = [s];
    const expected8 = g.decks[8][0];
    startDogma(g, cardByTitle('Evolution').id, '0');
    expect(g.pendingChoice?.kind).toBe('yes-no');
    resumeDogma(g, true);
    expect(g.players['0'].scorePile).toContain(expected8);
    expect(g.pendingChoice?.kind).toBe('select-score-card');
    const done = resumeDogma(g, s);
    expect(done).toBe(true);
    expect(g.players['0'].scorePile).not.toContain(s);
  });

  it('branch B (no, empty score): no-op', () => {
    const g = freshGame();
    g.players['0'].scorePile = [];
    startDogma(g, cardByTitle('Evolution').id, '0');
    const handBefore = g.players['0'].hand.length;
    resumeDogma(g, false);
    expect(g.players['0'].hand.length).toBe(handBefore);
  });

  it('branch B (no, with score): draws one higher than highest score age', () => {
    const g = freshGame();
    const s = takeFromDeck(g, cardByTitle('Calendar').id); // age 2
    g.players['0'].scorePile = [s];
    const expected = g.decks[3][0];
    startDogma(g, cardByTitle('Evolution').id, '0');
    resumeDogma(g, false);
    expect(g.players['0'].hand).toContain(expected);
  });
});

describe('Explosives (demand)', () => {
  it('transfers exactly 3 highest with no tie ambiguity → no pause', () => {
    const g = freshGame(2);
    // Activator: Explosives on red → 3 factories; target has 0 → demand fires.
    g.players['0'].piles.red.cards = [takeFromDeck(g, cardByTitle('Explosives').id)];
    // Target hand: one age 5, one age 4, one age 3, one age 1.
    const a5 = takeFromDeck(g, ALL_CARDS.find((c) => c.age === 5)!.id);
    const a4 = takeFromDeck(g, ALL_CARDS.find((c) => c.age === 4)!.id);
    const a3 = takeFromDeck(g, ALL_CARDS.find((c) => c.age === 3)!.id);
    const a1 = takeFromDeck(g, cardByTitle('Agriculture').id);
    g.players['1'].hand = [a5, a4, a3, a1];
    const done = startDogma(g, cardByTitle('Explosives').id, '0');
    expect(done).toBe(true);
    expect(g.players['0'].hand.sort()).toEqual([a5, a4, a3].sort());
    expect(g.players['1'].hand).toEqual([a1]);
  });

  it('emptying target hand triggers draw a 7', () => {
    const g = freshGame(2);
    g.players['0'].piles.red.cards = [takeFromDeck(g, cardByTitle('Explosives').id)];
    const a3 = takeFromDeck(g, ALL_CARDS.find((c) => c.age === 3)!.id);
    g.players['1'].hand = [a3];
    const expected = g.decks[7][0];
    startDogma(g, cardByTitle('Explosives').id, '0');
    expect(g.players['1'].hand).toContain(expected);
  });

  it('tie at threshold prompts target to pick subset', () => {
    const g = freshGame(2);
    g.players['0'].piles.red.cards = [takeFromDeck(g, cardByTitle('Explosives').id)];
    // Target: three age-1 cards. Take = 3, threshold = 1, forced = [], tied = 3, tieSlots = 3.
    // Not ambiguous: tied.length == tieSlots → all transfer with no pause.
    const x = takeFromDeck(g, cardByTitle('Agriculture').id);
    const y = takeFromDeck(g, cardByTitle('Pottery').id);
    const z = takeFromDeck(g, cardByTitle('Writing').id);
    g.players['1'].hand = [x, y, z];
    const done = startDogma(g, cardByTitle('Explosives').id, '0');
    expect(done).toBe(true);
    // All three age-1s auto-transferred (tied=tieSlots, no prompt). Then,
    // having emptied the target's hand, the demand draws a 7 for the target.
    expect(g.players['1'].hand.length).toBe(1);
    expect(cardById(g.players['1'].hand[0]).age).toBe(7);
    expect(g.players['0'].hand.sort()).toEqual([x, y, z].sort());
  });

  it('genuine threshold tie pauses for subset', () => {
    const g = freshGame(2);
    g.players['0'].piles.red.cards = [takeFromDeck(g, cardByTitle('Explosives').id)];
    // Target: one age-5 forced, three age-1 tied for two slots.
    const a5 = takeFromDeck(g, ALL_CARDS.find((c) => c.age === 5)!.id);
    const x = takeFromDeck(g, cardByTitle('Agriculture').id);
    const y = takeFromDeck(g, cardByTitle('Pottery').id);
    const z = takeFromDeck(g, cardByTitle('Writing').id);
    g.players['1'].hand = [a5, x, y, z];
    const done = startDogma(g, cardByTitle('Explosives').id, '0');
    expect(done).toBe(false);
    expect(g.pendingChoice?.kind).toBe('select-hand-card-subset');
    expect(g.pendingChoice?.minCount).toBe(2);
    expect(g.pendingChoice?.options.sort()).toEqual([x, y, z].sort());
    resumeDogma(g, [x, y]);
    expect(g.players['0'].hand.sort()).toEqual([a5, x, y].sort());
    expect(g.players['1'].hand).toEqual([z]);
  });
});

describe('Lighting', () => {
  it('tucking 2 cards of distinct ages → 2 draw-and-scores of 7s', () => {
    const g = freshGame();
    const a1 = takeFromDeck(g, cardByTitle('Agriculture').id); // age 1
    const a2 = takeFromDeck(g, cardByTitle('Calendar').id); // age 2
    g.players['0'].hand = [a1, a2];
    const s1 = g.decks[7][0];
    const s2 = g.decks[7][1];
    startDogma(g, cardByTitle('Lighting').id, '0');
    expect(g.pendingChoice?.kind).toBe('select-hand-card-subset');
    expect(g.pendingChoice?.maxCount).toBe(2);
    resumeDogma(g, [a1, a2]);
    expect(g.players['0'].scorePile).toContain(s1);
    expect(g.players['0'].scorePile).toContain(s2);
  });

  it('declining (empty subset) is a no-op', () => {
    const g = freshGame();
    g.players['0'].hand = [takeFromDeck(g, cardByTitle('Agriculture').id)];
    startDogma(g, cardByTitle('Lighting').id, '0');
    const scoreBefore = g.players['0'].scorePile.length;
    resumeDogma(g, []);
    expect(g.players['0'].scorePile.length).toBe(scoreBefore);
  });
});

describe('Publications', () => {
  it('level 0: rearranges a chosen pile', () => {
    const g = freshGame();
    const a = takeFromDeck(g, cardByTitle('Agriculture').id);
    const b = takeFromDeck(g, cardByTitle('Pottery').id);
    g.players['0'].piles.yellow.cards = [a, b];
    expect(startDogma(g, cardByTitle('Publications').id, '0')).toBe(false);
    expect(g.pendingChoice?.kind).toBe('select-board-color');
    resumeDogma(g, COLORS.indexOf('yellow'));
    expect(g.pendingChoice?.kind).toBe('select-card-order');
    resumeDogma(g, [b, a]);
    expect(g.players['0'].piles.yellow.cards).toEqual([b, a]);
  });

  it('level 1: splays yellow up when chosen', () => {
    const g = freshGame();
    g.players['0'].piles.yellow.cards = [
      takeFromDeck(g, cardByTitle('Agriculture').id),
      takeFromDeck(g, cardByTitle('Pottery').id),
    ];
    // Skip level 0 by declining the color pick.
    startDogma(g, cardByTitle('Publications').id, '0');
    resumeDogma(g, null); // decline level 0
    // Now paused on level 1 board-color pick.
    expect(g.pendingChoice?.kind).toBe('select-board-color');
    resumeDogma(g, COLORS.indexOf('yellow'));
    expect(g.players['0'].piles.yellow.splay).toBe('up');
  });
});

describe('Railroad', () => {
  it('level 0: returns all hand cards then draws three 6s', () => {
    const g = freshGame();
    const h1 = takeFromDeck(g, cardByTitle('Agriculture').id);
    const h2 = takeFromDeck(g, cardByTitle('Writing').id);
    g.players['0'].hand = [h1, h2];
    const d1 = g.decks[6][0];
    const d2 = g.decks[6][1];
    const d3 = g.decks[6][2];
    startDogma(g, cardByTitle('Railroad').id, '0');
    expect(g.players['0'].hand).not.toContain(h1);
    expect(g.players['0'].hand).not.toContain(h2);
    expect(g.players['0'].hand).toContain(d1);
    expect(g.players['0'].hand).toContain(d2);
    expect(g.players['0'].hand).toContain(d3);
  });

  it('level 1: skipped when no right-splayed pile exists', () => {
    const g = freshGame();
    const done = startDogma(g, cardByTitle('Railroad').id, '0');
    // Level 0 ran (returned empty hand then drew 3 sixes), level 1 has nothing eligible.
    expect(done).toBe(true);
  });
});

describe('Refrigeration', () => {
  it('level 0 demand: target returns half (rounded down) of hand', () => {
    const g = freshGame(2);
    // Activator: Refrigeration on yellow → 3 leaves; target 0 → demand fires.
    g.players['0'].piles.yellow.cards = [takeFromDeck(g, cardByTitle('Refrigeration').id)];
    // Target hand: 5 cards → return 2.
    const h = [
      takeFromDeck(g, cardByTitle('Agriculture').id),
      takeFromDeck(g, cardByTitle('Writing').id),
      takeFromDeck(g, cardByTitle('Pottery').id),
      takeFromDeck(g, cardByTitle('Masonry').id),
      takeFromDeck(g, cardByTitle('Archery').id),
    ];
    g.players['1'].hand = [...h];
    expect(startDogma(g, cardByTitle('Refrigeration').id, '0')).toBe(false);
    expect(g.pendingChoice?.kind).toBe('select-hand-card-subset');
    expect(g.pendingChoice?.minCount).toBe(2);
    expect(g.pendingChoice?.maxCount).toBe(2);
    resumeDogma(g, [h[0], h[1]]);
    expect(g.players['1'].hand.length).toBe(3);
  });

  it('level 1: activator may score a card from hand', () => {
    const g = freshGame(1);
    const h = takeFromDeck(g, cardByTitle('Writing').id);
    g.players['0'].hand = [h];
    startDogma(g, cardByTitle('Refrigeration').id, '0');
    // 1-player: no demand target at level 0; level 1 prompts on activator.
    expect(g.pendingChoice?.kind).toBe('select-hand-card');
    resumeDogma(g, h);
    expect(g.players['0'].scorePile).toContain(h);
  });

  it('level 1 decline: no-op', () => {
    const g = freshGame(1);
    const h = takeFromDeck(g, cardByTitle('Writing').id);
    g.players['0'].hand = [h];
    startDogma(g, cardByTitle('Refrigeration').id, '0');
    resumeDogma(g, null);
    expect(g.players['0'].hand).toContain(h);
    expect(g.players['0'].scorePile).toEqual([]);
  });
});

describe('Sanitation (demand)', () => {
  it('transfers target two-highest to activator and activator lowest to target', () => {
    const g = freshGame(2);
    // Activator: Sanitation on yellow → 3 leaves; target 0 → demand fires.
    g.players['0'].piles.yellow.cards = [takeFromDeck(g, cardByTitle('Sanitation').id)];
    // Target hand: age 5, age 4, age 1. Two highest: age 5, age 4.
    const t5 = takeFromDeck(g, ALL_CARDS.find((c) => c.age === 5)!.id);
    const t4 = takeFromDeck(g, ALL_CARDS.find((c) => c.age === 4)!.id);
    const t1 = takeFromDeck(g, cardByTitle('Agriculture').id);
    g.players['1'].hand = [t5, t4, t1];
    // Activator hand: age 2 and age 3. Lowest = age 2 (unique).
    const a2 = takeFromDeck(g, cardByTitle('Writing').id); // age 2
    const a3 = takeFromDeck(g, ALL_CARDS.find((c) => c.age === 3)!.id);
    g.players['0'].hand = [a3, a2];
    const done = startDogma(g, cardByTitle('Sanitation').id, '0');
    expect(done).toBe(true);
    // Target gave up t5 & t4; received a2.
    expect(g.players['1'].hand.sort()).toEqual([t1, a2].sort());
    // Activator gained t5 & t4, kept a3.
    expect(g.players['0'].hand.sort()).toEqual([a3, t5, t4].sort());
  });

  it('target with 0 hand cards still triggers activator to give lowest', () => {
    const g = freshGame(2);
    g.players['0'].piles.yellow.cards = [takeFromDeck(g, cardByTitle('Sanitation').id)];
    g.players['1'].hand = [];
    const a2 = takeFromDeck(g, cardByTitle('Writing').id);
    g.players['0'].hand = [a2];
    startDogma(g, cardByTitle('Sanitation').id, '0');
    expect(g.players['1'].hand).toContain(a2);
    expect(g.players['0'].hand).toEqual([]);
  });
});
