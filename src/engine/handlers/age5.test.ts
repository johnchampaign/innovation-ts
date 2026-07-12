// Tests for Age-5 dogma handlers. One spec per card minimum, cherry-picked
// from Innovation.Tests/Age5*.cs to cover each card's main behaviour.

import { describe, expect, it } from 'vitest';
import '../handlers';
import './age5';
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
    availableSpecialAchievements: ['Monument', 'Empire', 'World', 'Wonder', 'Universe'],
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

describe('Astronomy', () => {
  it('effect 0: draws a 6; if non-green/blue, stops with card in hand', () => {
    const g = freshGame();
    // Force top of age-6 to be a yellow/red/purple card.
    const yellow6 = g.decks[6].find((id) => cardById(id).color === 'yellow')
      ?? g.decks[6].find((id) => cardById(id).color === 'red')
      ?? g.decks[6].find((id) => cardById(id).color === 'purple')!;
    takeFromDeck(g, yellow6);
    g.decks[6].unshift(yellow6);
    startDogma(g, cardByTitle('Astronomy').id, '0');
    expect(g.players['0'].hand).toContain(yellow6);
  });

  it('effect 1: claims Universe when all non-purple tops are >=6', () => {
    const g = freshGame();
    // Place a 6+ top on each non-purple color.
    for (const c of ['yellow', 'red', 'blue', 'green'] as const) {
      const id = g.decks[6].find((x) => cardById(x).color === c)!;
      takeFromDeck(g, id);
      g.players['0'].piles[c].cards = [id];
    }
    // Drive level 1 directly: set up dogmaRun then invoke with levelIndex via startDogma
    // Easier: stub the level-0 deck to a yellow/red/purple so the loop ends fast.
    const yellow6 = g.decks[6].find((x) => cardById(x).color === 'yellow');
    if (yellow6) { takeFromDeck(g, yellow6); g.decks[6].unshift(yellow6); }
    startDogma(g, cardByTitle('Astronomy').id, '0');
    expect(g.players['0'].specialAchievements).toContain('Universe');
  });

  it('effect 1: skipped when a non-purple color is empty', () => {
    const g = freshGame();
    // Only yellow has a top.
    const id = g.decks[6].find((x) => cardById(x).color === 'yellow')!;
    takeFromDeck(g, id);
    g.players['0'].piles.yellow.cards = [id];
    // Force eff0 to terminate immediately with non-green/blue.
    startDogma(g, cardByTitle('Astronomy').id, '0');
    expect(g.players['0'].specialAchievements).not.toContain('Universe');
  });
});

describe('Banking', () => {
  function setup() {
    const g = freshGame(2);
    // Activator: Banking on green → 1 crown beats 0.
    g.players['0'].piles.green.cards = [takeFromDeck(g, cardByTitle('Banking').id)];
    // Target has a non-green top with factory icon. Coal (red, factory) works.
    g.players['1'].piles.red.cards = [takeFromDeck(g, cardByTitle('Coal').id)];
    return g;
  }

  it('demand: pauses, then transfers and target draws+scores a 5', () => {
    const g = setup();
    const done = startDogma(g, cardByTitle('Banking').id, '0');
    expect(done).toBe(false);
    expect(g.pendingChoice?.kind).toBe('select-board-color');
    const colorIdx = g.pendingChoice!.options[0];
    const moved = g.players['1'].piles[COLORS[colorIdx]].cards[0];
    const targetScoreBefore = g.players['1'].scorePile.length;
    resumeDogma(g, colorIdx);
    expect(g.players['0'].piles[COLORS[colorIdx]].cards[0]).toBe(moved);
    expect(g.players['1'].scorePile.length).toBe(targetScoreBefore + 1);
  });

  it('eff 1: splay green right when ≥2 green cards', () => {
    const g = freshGame();
    g.players['0'].piles.green.cards = [
      takeFromDeck(g, cardByTitle('Banking').id),
      takeFromDeck(g, cardByTitle('Measurement').id),
    ];
    // No target for demand on 1-player game → eff 0 skipped, eff 1 fires.
    startDogma(g, cardByTitle('Banking').id, '0');
    expect(g.pendingChoice?.kind).toBe('yes-no');
    resumeDogma(g, true);
    expect(g.players['0'].piles.green.splay).toBe('right');
  });
});

describe('Chemistry', () => {
  it('eff 1: draws+scores (highestTop+1) and then prompts for a score-pile return', () => {
    const g = freshGame();
    // Highest top is age 2 → draws age 3.
    const seed = takeFromDeck(g, cardByTitle('Calendar').id);
    g.players['0'].piles[cardById(seed).color].cards = [seed];
    // Skip eff 0: no blue cards on board → splay-right eff 0 is no-op.
    startDogma(g, cardByTitle('Chemistry').id, '0');
    // After draw+score, pending choice asks return-from-score.
    expect(g.pendingChoice?.kind).toBe('select-score-card');
    const scored = g.players['0'].scorePile[0];
    expect(cardById(scored).age).toBe(3);
    // Return the scored card.
    resumeDogma(g, scored);
    expect(g.players['0'].scorePile).not.toContain(scored);
  });
});

describe('Coal', () => {
  it('eff 0: draws and tucks a 5', () => {
    const g = freshGame();
    const expected = g.decks[5][0];
    startDogma(g, cardByTitle('Coal').id, '0');
    const color = cardById(expected).color;
    // Tucked → at the bottom of its pile.
    expect(g.players['0'].piles[color].cards.at(-1)).toBe(expected);
  });

  it('eff 2: scores top + the card beneath', () => {
    const g = freshGame();
    // Set up a red pile with 2 cards, no other piles, no hand.
    const a = takeFromDeck(g, cardByTitle('Coal').id);
    const b = takeFromDeck(g, cardByTitle('Banking').id);
    // Banking is green; use two red cards instead.
    const red1 = takeFromDeck(g, cardByTitle('The Pirate Code').id); // red age 5
    const red2 = takeFromDeck(g, cardByTitle('Steam Engine').id);    // yellow — wrong
    // Re-pick: two red cards. Coal (red,5) and The Pirate Code (red,5).
    g.players['0'].piles.red.cards = [a, red1];
    // Clear age-5 deck of these already-taken cards: done by takeFromDeck.
    // Pre-resume past eff 0 (tucks a 5) — fine, that just adds a yellow.
    // Pre-resume past eff 1 — red has ≥2, will prompt yes/no. Decline.
    startDogma(g, cardByTitle('Coal').id, '0');
    // Step over eff 1 splay yes/no.
    if (g.pendingChoice?.kind === 'yes-no') resumeDogma(g, false);
    // Now eff 2 prompt.
    expect(g.pendingChoice?.kind).toBe('select-board-color');
    const redIdx = COLORS.indexOf('red');
    resumeDogma(g, redIdx);
    // Both red cards should be in score pile now.
    expect(g.players['0'].scorePile).toContain(a);
    expect(g.players['0'].scorePile).toContain(red1);
    expect(g.players['0'].piles.red.cards.length).toBe(0);
    // suppress unused
    expect(b).toBeDefined();
    expect(red2).toBeDefined();
  });
});

describe('Measurement', () => {
  it('return + splay+draw flow', () => {
    const g = freshGame();
    // Hand: one card to return.
    const h = takeFromDeck(g, cardByTitle('Writing').id);
    g.players['0'].hand = [h];
    // Yellow pile has 3 cards → eligible to splay; draw size = 3.
    g.players['0'].piles.yellow.cards = [
      takeFromDeck(g, cardByTitle('Agriculture').id),
      takeFromDeck(g, cardByTitle('Domestication').id),
      takeFromDeck(g, cardByTitle('The Wheel').id),
    ];
    startDogma(g, cardByTitle('Measurement').id, '0');
    expect(g.pendingChoice?.kind).toBe('select-hand-card');
    resumeDogma(g, h);
    expect(g.pendingChoice?.kind).toBe('select-board-color');
    const yidx = COLORS.indexOf('yellow');
    const expectedDraw = g.decks[3][0];
    resumeDogma(g, yidx);
    expect(g.players['0'].piles.yellow.splay).toBe('right');
    expect(g.players['0'].hand).toContain(expectedDraw);
  });

  it('decline the return → no-op', () => {
    const g = freshGame();
    g.players['0'].hand = [takeFromDeck(g, cardByTitle('Writing').id)];
    startDogma(g, cardByTitle('Measurement').id, '0');
    const done = resumeDogma(g, null);
    expect(done).toBe(true);
  });
});

describe('Physics', () => {
  it('all-different colors: keeps the three 6s in hand', () => {
    const g = freshGame();
    // Force first 3 of age 6 to be three distinct colors.
    const distinct: number[] = [];
    const seen = new Set<string>();
    for (const id of g.decks[6]) {
      const c = cardById(id).color;
      if (!seen.has(c)) { seen.add(c); distinct.push(id); }
      if (distinct.length === 3) break;
    }
    // Move them to the top.
    for (const id of distinct.slice().reverse()) {
      takeFromDeck(g, id);
      g.decks[6].unshift(id);
    }
    startDogma(g, cardByTitle('Physics').id, '0');
    for (const id of distinct) expect(g.players['0'].hand).toContain(id);
  });

  it('two-of-same color: returns entire hand', () => {
    const g = freshGame();
    // Force first 2 age-6 to share a color.
    const sameColor: number[] = [];
    const groups = new Map<string, number[]>();
    for (const id of g.decks[6]) {
      const c = cardById(id).color;
      if (!groups.has(c)) groups.set(c, []);
      groups.get(c)!.push(id);
    }
    let pair: number[] | null = null;
    for (const ids of groups.values()) if (ids.length >= 2) { pair = ids.slice(0, 2); break; }
    expect(pair).not.toBeNull();
    sameColor.push(pair![0], pair![1]);
    // Find a 3rd distinct-color age 6 to fill out the draw.
    let third = -1;
    for (const id of g.decks[6]) {
      if (sameColor.includes(id)) continue;
      if (cardById(id).color !== cardById(sameColor[0]).color) { third = id; break; }
    }
    // Re-order deck: [pair[0], pair[1], third, ...]
    for (const id of [third, sameColor[1], sameColor[0]]) {
      takeFromDeck(g, id);
      g.decks[6].unshift(id);
    }
    // Single existing hand card with unique age → no order prompt.
    const handCard = takeFromDeck(g, cardByTitle('Writing').id); // age 2
    g.players['0'].hand = [handCard];
    startDogma(g, cardByTitle('Physics').id, '0');
    expect(g.players['0'].hand.length).toBe(0);
  });
});

describe('The Pirate Code', () => {
  function setup() {
    const g = freshGame(2);
    // Activator: Pirate Code on red → 1 crown beats 0.
    g.players['0'].piles.red.cards = [takeFromDeck(g, cardByTitle('The Pirate Code').id)];
    // Target has 2 low-age cards in score pile.
    const s1 = takeFromDeck(g, cardByTitle('Agriculture').id); // age 1
    const s2 = takeFromDeck(g, cardByTitle('Domestication').id); // age 1
    g.players['1'].scorePile = [s1, s2];
    return { g, s1, s2 };
  }

  it('demand: two picks, both transferred to activator', () => {
    const { g, s1, s2 } = setup();
    startDogma(g, cardByTitle('The Pirate Code').id, '0');
    expect(g.pendingChoice?.kind).toBe('select-score-card');
    resumeDogma(g, s1);
    expect(g.pendingChoice?.kind).toBe('select-score-card');
    resumeDogma(g, s2);
    expect(g.players['0'].scorePile).toContain(s1);
    expect(g.players['0'].scorePile).toContain(s2);
    expect(g.players['1'].scorePile).toHaveLength(0);
  });

  it('demand skipped: no eligible cards (all >4)', () => {
    const g = freshGame(2);
    g.players['0'].piles.red.cards = [takeFromDeck(g, cardByTitle('The Pirate Code').id)];
    // Target: only an age-5 in score pile.
    const big = takeFromDeck(g, cardByTitle('Banking').id);
    g.players['1'].scorePile = [big];
    const done = startDogma(g, cardByTitle('The Pirate Code').id, '0');
    expect(done).toBe(true);
    expect(g.players['1'].scorePile).toContain(big);
  });
});

describe('Societies', () => {
  it('demand: transfers and target draws a 5', () => {
    const g = freshGame(2);
    // Activator: Societies (purple) → 1 crown.
    g.players['0'].piles.purple.cards = [takeFromDeck(g, cardByTitle('Societies').id)];
    // Target: a non-purple top with [Lightbulb]. Astronomy is purple — wrong.
    // Use Writing (blue, lightbulb).
    g.players['1'].piles.blue.cards = [takeFromDeck(g, cardByTitle('Writing').id)];
    const targetHandBefore = g.players['1'].hand.length;
    startDogma(g, cardByTitle('Societies').id, '0');
    expect(g.pendingChoice?.kind).toBe('select-board-color');
    const idx = g.pendingChoice!.options[0];
    resumeDogma(g, idx);
    expect(g.players['0'].piles[COLORS[idx]].cards.length).toBeGreaterThan(0);
    expect(g.players['1'].hand.length).toBe(targetHandBefore + 1);
  });
});

describe('Statistics', () => {
  it('demand: auto-pulls highest when uncontested', () => {
    const g = freshGame(2);
    // Activator: Statistics (yellow,leaf) — 1 leaf beats 0.
    g.players['0'].piles.yellow.cards = [takeFromDeck(g, cardByTitle('Statistics').id)];
    // Target: two distinct-age score cards.
    const low = takeFromDeck(g, cardByTitle('Agriculture').id); // age 1
    const high = takeFromDeck(g, cardByTitle('Calendar').id);   // age 2
    // Add an extra hand filler so post-transfer hand isn't size 1 (avoid loop).
    const filler = takeFromDeck(g, cardByTitle('Pottery').id);
    g.players['1'].scorePile = [low, high];
    g.players['1'].hand = [filler];
    startDogma(g, cardByTitle('Statistics').id, '0');
    expect(g.players['1'].hand).toContain(high);
    expect(g.players['1'].scorePile).not.toContain(high);
  });

  it('eff 1: splay yellow right', () => {
    const g = freshGame();
    g.players['0'].piles.yellow.cards = [
      takeFromDeck(g, cardByTitle('Statistics').id),
      takeFromDeck(g, cardByTitle('Agriculture').id),
    ];
    startDogma(g, cardByTitle('Statistics').id, '0');
    // 1-player: no demand target. Eff 1 yes/no.
    expect(g.pendingChoice?.kind).toBe('yes-no');
    resumeDogma(g, true);
    expect(g.players['0'].piles.yellow.splay).toBe('right');
  });
});

describe('Steam Engine', () => {
  it('draws+tucks two 4s, then scores bottom yellow', () => {
    const g = freshGame();
    // Seed a yellow pile with one card; after two tucks of age-4s, bottom may
    // be one of the tucked 4s OR the original (depending on color).
    const seed = takeFromDeck(g, cardByTitle('Statistics').id); // yellow age 5
    g.players['0'].piles.yellow.cards = [seed];
    startDogma(g, cardByTitle('Steam Engine').id, '0');
    // Score pile should contain whatever ended up at the bottom of yellow.
    expect(g.players['0'].scorePile.length).toBe(1);
  });
});
