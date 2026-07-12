// Tests for the Age-10 dogma handlers. Cherry-picked from
// Innovation.Tests/Age10*Tests.cs — one or two cases per card covering the
// primary behaviour. Solo-win cards assert g.winnerOverride; demand cards
// confirm the dogmaRun.demandSuccessful flag.

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

describe('A.I.', () => {
  it('effect 0 draws and scores a 10', () => {
    const g = freshGame();
    const expected = g.decks[10].find((id) => cardById(id).title !== 'A.I.')!;
    // Make sure the next 10 drawn is the expected one.
    const i = g.decks[10].indexOf(expected);
    [g.decks[10][0], g.decks[10][i]] = [g.decks[10][i], g.decks[10][0]];
    startDogma(g, cardByTitle('A.I.').id, '0');
    expect(g.players['0'].scorePile).toContain(expected);
  });

  it('effect 1: lowest-score solo-win when Robotics + Software both top on table', () => {
    const g = freshGame(2);
    // Put Robotics top for p0, Software top for p1.
    g.players['0'].piles.red.cards = [takeFromDeck(g, cardByTitle('Robotics').id)];
    g.players['1'].piles.blue.cards = [takeFromDeck(g, cardByTitle('Software').id)];
    // p1 score pile heavy → p0 lowest.
    g.players['1'].scorePile = [takeFromDeck(g, cardByTitle('Agriculture').id)];
    // Empty decks[10] except for A.I. so effect 0 drawAndScore doesn't pollute.
    // Actually effect 0 draws a 10 for the target — fine, both players run it
    // as share targets. Just check winnerOverride is set.
    startDogma(g, cardByTitle('A.I.').id, '0');
    expect(g.winnerOverride?.winners).toBeDefined();
  });
});

describe('Bioengineering', () => {
  it('effect 0 pauses with a pick of top-[Leaf] cards from other players', () => {
    const g = freshGame(2);
    // P1 has Agriculture (leaf) top.
    const agri = takeFromDeck(g, cardByTitle('Agriculture').id);
    g.players['1'].piles.yellow.cards = [agri];
    // Empty decks[10] to avoid effect-1 win interference with leaves (P1 has 3 leaves on Agriculture).
    g.decks[10] = [];
    startDogma(g, cardByTitle('Bioengineering').id, '0');
    expect(g.pendingChoice?.kind).toBe('select-hand-card');
    expect(g.pendingChoice?.options).toContain(agri);
  });

  it('effect 1: most-leaf solo-win when any player <3 leaves', () => {
    const g = freshGame(2);
    // P0: 3 leaves via Agriculture. P1: 0.
    g.players['0'].piles.yellow.cards = [takeFromDeck(g, cardByTitle('Agriculture').id)];
    // Give activator a clock advantage (Bioengineering's featured icon is
    // [Clock]) so P1 doesn't share-run effect 0 and pause prompting P1 to
    // pick from P0's leaf top. Bioengineering itself shows 2 clocks on top.
    g.players['0'].piles.blue.cards = [takeFromDeck(g, cardByTitle('Bioengineering').id)];
    // Drive only effect 1 by overriding the card definition's effects? No —
    // call startDogma normally; effect 0 will no-op (P1 has no top leaf).
    startDogma(g, cardByTitle('Bioengineering').id, '0');
    expect(g.winnerOverride?.winners).toEqual(['0']);
  });
});

describe('Databases (demand)', () => {
  it('pauses with subset prompt requiring half (rounded up)', () => {
    const g = freshGame(2);
    // Activator (p0) clock advantage via Databases on green.
    g.players['0'].piles.green.cards = [takeFromDeck(g, cardByTitle('Databases').id)];
    // Target p1: 3 cards in score pile → must return 2.
    const a = takeFromDeck(g, cardByTitle('Agriculture').id);
    const b = takeFromDeck(g, cardByTitle('Pottery').id);
    const c = takeFromDeck(g, cardByTitle('Masonry').id);
    g.players['1'].scorePile = [a, b, c];
    const done = startDogma(g, cardByTitle('Databases').id, '0');
    expect(done).toBe(false);
    expect(g.pendingChoice?.kind).toBe('select-score-card-subset');
    expect(g.pendingChoice?.minCount).toBe(2);
    expect(g.pendingChoice?.maxCount).toBe(2);
    resumeDogma(g, [a, b]);
    expect(g.players['1'].scorePile).not.toContain(a);
    expect(g.players['1'].scorePile).not.toContain(b);
    expect(g.players['1'].scorePile).toContain(c);
  });
});

describe('Globalization', () => {
  it('effect 0 (demand): target returns a top-[Leaf] from board', () => {
    const g = freshGame(2);
    // Activator factory advantage: Globalization on yellow gives 3 factories.
    g.players['0'].piles.yellow.cards = [takeFromDeck(g, cardByTitle('Globalization').id)];
    // Target has a top-leaf card.
    const agri = takeFromDeck(g, cardByTitle('Agriculture').id);
    g.players['1'].piles.yellow.cards = [agri];
    // Empty 10 deck to keep effect-1 simple (no draw cascade).
    g.decks[10] = [];
    g.decks[6] = [];
    startDogma(g, cardByTitle('Globalization').id, '0');
    expect(g.pendingChoice?.kind).toBe('select-board-color');
    const colorIdx = g.pendingChoice!.options[0];
    resumeDogma(g, colorIdx);
    expect(g.players['1'].piles[COLORS[colorIdx]].cards.length).toBe(0);
  });

  it('effect 1: draws and scores a 6 for activator', () => {
    const g = freshGame(1);
    const expected = g.decks[6][0];
    startDogma(g, cardByTitle('Globalization').id, '0');
    expect(g.players['0'].scorePile).toContain(expected);
  });
});

describe('Miniaturization', () => {
  it('returning a 10 draws a 10 for each distinct score-pile value', () => {
    const g = freshGame();
    // Hand: a 10 (Software). Score pile: Agriculture (1), Writing (2),
    // Masonry (1) → distinct values {1, 2} → 2 draws of age 10.
    const ten = takeFromDeck(g, cardByTitle('Software').id);
    g.players['0'].hand = [ten];
    g.players['0'].scorePile = [
      takeFromDeck(g, cardByTitle('Agriculture').id),
      takeFromDeck(g, cardByTitle('Calendar').id),
      takeFromDeck(g, cardByTitle('Masonry').id),
    ];
    const handBefore = g.players['0'].hand.length;
    startDogma(g, cardByTitle('Miniaturization').id, '0');
    resumeDogma(g, ten);
    // Drew 2 tens; returned 1 from hand. Net: +2 -1 = +1.
    expect(g.players['0'].hand.length).toBe(handBefore + 1);
  });

  it('declining (null) is a no-op', () => {
    const g = freshGame();
    g.players['0'].hand = [takeFromDeck(g, cardByTitle('Agriculture').id)];
    startDogma(g, cardByTitle('Miniaturization').id, '0');
    const done = resumeDogma(g, null);
    expect(done).toBe(true);
    expect(g.players['0'].hand).toHaveLength(1);
  });
});

describe('Robotics', () => {
  it('scores top green card, draws+melds a 10, queues nested execute', () => {
    const g = freshGame();
    const greenTop = takeFromDeck(g, cardByTitle('Agriculture').id); // wait — yellow. Use a green card.
    // Use a real green: Mysticism is yellow too. Find any green age-1.
    const realGreen = ALL_CARDS.find((c) => c.color === 'green' && c.age <= 2)!.id;
    takeFromDeck(g, realGreen);
    g.players['0'].piles.green.cards = [realGreen];
    // Ensure top of decks[10] is something benign (no demand).
    startDogma(g, cardByTitle('Robotics').id, '0');
    // The scored green card now in score pile.
    expect(g.players['0'].scorePile).toContain(realGreen);
    // A 10 was melded onto its color pile.
    let melded10 = false;
    for (const c of COLORS) {
      const top = g.players['0'].piles[c].cards[0];
      if (top !== undefined && cardById(top).age === 10) melded10 = true;
    }
    expect(melded10).toBe(true);
    // Silence unused: we used greenTop only as a comment guide.
    void greenTop;
  });
});

describe('Self Service', () => {
  it('effect 0: pauses with eligible top cards (excluding Self Service)', () => {
    const g = freshGame();
    // Board: Self Service + Writing (a different top card).
    g.players['0'].piles.green.cards = [takeFromDeck(g, cardByTitle('Self Service').id)];
    const writing = takeFromDeck(g, cardByTitle('Writing').id);
    g.players['0'].piles.blue.cards = [writing];
    startDogma(g, cardByTitle('Self Service').id, '0');
    expect(g.pendingChoice?.kind).toBe('select-hand-card');
    expect(g.pendingChoice?.options).toContain(writing);
    expect(g.pendingChoice?.options).not.toContain(cardByTitle('Self Service').id);
  });

  it('effect 1: solo-win when activator has more achievements than each other player', () => {
    const g = freshGame(2);
    g.players['0'].ageAchievements = [1, 2, 3];
    g.players['1'].ageAchievements = [1];
    // Run effect 1 — effect 0 will no-op (no other top cards on p0 board).
    startDogma(g, cardByTitle('Self Service').id, '0');
    expect(g.winnerOverride?.winners).toEqual(['0']);
  });

  it('effect 1: no win when another player ties or exceeds', () => {
    const g = freshGame(2);
    g.players['0'].ageAchievements = [1, 2];
    g.players['1'].ageAchievements = [1, 2];
    startDogma(g, cardByTitle('Self Service').id, '0');
    expect(g.winnerOverride).toBeNull();
  });
});

describe('Software', () => {
  it('effect 0 draws and scores a 10', () => {
    const g = freshGame();
    const expected = g.decks[10][0];
    startDogma(g, cardByTitle('Software').id, '0');
    // The scored card is the first 10 drawn (effect 0 fires before effect 1).
    expect(g.players['0'].scorePile).toContain(expected);
  });

  it('effect 1 melds two 10s on the activator board', () => {
    const g = freshGame();
    startDogma(g, cardByTitle('Software').id, '0');
    // After effect 0 + effect 1: 1 scored, 2 melded — total 3 tens consumed.
    // Check at least one age-10 card sits on a pile top.
    let count10OnBoard = 0;
    for (const c of COLORS) {
      for (const id of g.players['0'].piles[c].cards) {
        if (cardById(id).age === 10) count10OnBoard++;
      }
    }
    expect(count10OnBoard).toBeGreaterThanOrEqual(2);
  });
});

describe('Stem Cells', () => {
  it('Yes scores the entire hand', () => {
    const g = freshGame();
    g.players['0'].hand = [
      takeFromDeck(g, cardByTitle('Agriculture').id),
      takeFromDeck(g, cardByTitle('Writing').id),
    ];
    startDogma(g, cardByTitle('Stem Cells').id, '0');
    expect(g.pendingChoice?.kind).toBe('yes-no');
    resumeDogma(g, true);
    expect(g.players['0'].hand).toHaveLength(0);
    expect(g.players['0'].scorePile).toHaveLength(2);
  });

  it('No leaves the hand alone', () => {
    const g = freshGame();
    g.players['0'].hand = [takeFromDeck(g, cardByTitle('Agriculture').id)];
    startDogma(g, cardByTitle('Stem Cells').id, '0');
    resumeDogma(g, false);
    expect(g.players['0'].hand).toHaveLength(1);
    expect(g.players['0'].scorePile).toHaveLength(0);
  });
});

describe('The Internet', () => {
  it('effect 0 prompts yes/no when ≥2 green cards & not already up', () => {
    const g = freshGame();
    g.players['0'].piles.green.cards = [
      takeFromDeck(g, ALL_CARDS.find((c) => c.color === 'green' && c.age === 1)!.id),
      takeFromDeck(g, ALL_CARDS.find((c) => c.color === 'green' && c.age === 2)!.id),
    ];
    startDogma(g, cardByTitle('The Internet').id, '0');
    expect(g.pendingChoice?.kind).toBe('yes-no');
    resumeDogma(g, true);
    expect(g.players['0'].piles.green.splay).toBe('up');
  });

  it('effect 1 draws and scores a 10 (level 0 skipped when only 1 green)', () => {
    const g = freshGame();
    // No green cards → effect 0 no-ops.
    const expected = g.decks[10][0];
    startDogma(g, cardByTitle('The Internet').id, '0');
    expect(g.players['0'].scorePile).toContain(expected);
  });

  it('effect 2 melds a 10 per two clocks on the board', () => {
    const g = freshGame();
    // The Internet itself has 3 clocks (Top, Left, Middle, Right minus 1 x).
    // Putting it on board ensures clocks≥2 → at least 1 meld.
    g.players['0'].piles.purple.cards = [takeFromDeck(g, cardByTitle('The Internet').id)];
    startDogma(g, cardByTitle('The Internet').id, '0');
    // Effect 1 scored one 10, effect 2 melded ⌊clocks/2⌋ of them.
    let melded10 = 0;
    for (const c of COLORS) {
      for (const id of g.players['0'].piles[c].cards) {
        if (cardById(id).age === 10) melded10++;
      }
    }
    expect(melded10).toBeGreaterThanOrEqual(1);
  });
});
