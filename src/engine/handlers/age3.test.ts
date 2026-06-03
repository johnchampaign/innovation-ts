// Tests for Age-3 dogma handlers. Mirrors the structure of age1.test.ts.

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
    log: [],
  };
  for (const c of ALL_CARDS) g.decks[c.age].push(c.id);
  for (let i = 0; i < numPlayers; i++) g.players[String(i)] = newPlayer();
  return g;
}

describe('Alchemy', () => {
  it('level 0: with 3 castles, draws one 4; if non-red, keeps it', () => {
    const g = freshGame();
    // Masonry has 3 castles → meld it to get 3 castles on board.
    const masonry = takeFromDeck(g, cardByTitle('Masonry').id);
    g.players['0'].piles.yellow.cards = [masonry];
    // Stack age-4 deck so first draw is a known non-red card.
    // Find any non-red age-4 card.
    const nonRed4 = ALL_CARDS.find((c) => c.age === 4 && c.color !== 'red')!;
    takeFromDeck(g, nonRed4.id);
    g.decks[4].unshift(nonRed4.id);
    startDogma(g, cardByTitle('Alchemy').id, '0');
    expect(g.players['0'].hand).toContain(nonRed4.id);
  });

  it('level 0: with no castles, no-op', () => {
    const g = freshGame();
    const handBefore = g.players['0'].hand.length;
    startDogma(g, cardByTitle('Alchemy').id, '0');
    // No level-0 progression; level-1 still asks to meld since hand has stuff?
    // Actually fresh hand is empty → level 1 also no-ops.
    expect(g.players['0'].hand.length).toBe(handBefore);
  });

  it('level 0: red drawn → return drawn + entire hand', () => {
    const g = freshGame();
    const masonry = takeFromDeck(g, cardByTitle('Masonry').id);
    g.players['0'].piles.yellow.cards = [masonry];
    const red4 = ALL_CARDS.find((c) => c.age === 4 && c.color === 'red')!;
    takeFromDeck(g, red4.id);
    g.decks[4].unshift(red4.id);
    // Seed hand with an existing card.
    const handCard = takeFromDeck(g, cardByTitle('Agriculture').id);
    g.players['0'].hand = [handCard];
    startDogma(g, cardByTitle('Alchemy').id, '0');
    expect(g.players['0'].hand).not.toContain(red4.id);
    expect(g.players['0'].hand).not.toContain(handCard);
  });

  it('level 1: melds then scores', () => {
    const g = freshGame();
    const a = takeFromDeck(g, cardByTitle('Agriculture').id);
    const b = takeFromDeck(g, cardByTitle('Pottery').id);
    g.players['0'].hand = [a, b];
    // Skip level 0 by ensuring 0 castles; first level returns false → driver
    // advances to level 1 which pauses.
    expect(startDogma(g, cardByTitle('Alchemy').id, '0')).toBe(false);
    expect(g.pendingChoice?.kind).toBe('select-hand-card');
    resumeDogma(g, a); // meld a
    expect(g.pendingChoice?.kind).toBe('select-hand-card');
    const done = resumeDogma(g, b); // score b
    expect(done).toBe(true);
    expect(g.players['0'].scorePile).toContain(b);
    expect(g.players['0'].piles[cardById(a).color].cards).toContain(a);
  });
});

describe('Compass (demand)', () => {
  function setup(): InnovationState {
    const g = freshGame(2);
    // Activator: Compass on green → 3 crowns → outranks p1's 0 crowns.
    g.players['0'].piles.green.cards = [takeFromDeck(g, cardByTitle('Compass').id)];
    // Target: a non-green pile with a Leaf-iconed top card (Agriculture is yellow + leaf).
    g.players['1'].piles.yellow.cards = [takeFromDeck(g, cardByTitle('Agriculture').id)];
    return g;
  }

  it('leg 1: transfers target non-green leaf top to activator', () => {
    const g = setup();
    const card = g.players['1'].piles.yellow.cards[0];
    startDogma(g, cardByTitle('Compass').id, '0');
    expect(g.pendingChoice?.kind).toBe('select-board-color');
    expect(g.pendingChoice?.playerId).toBe('1');
    const colorIdx = g.pendingChoice!.options[0];
    resumeDogma(g, colorIdx);
    expect(g.players['0'].piles[COLORS[colorIdx]].cards).toContain(card);
  });

  it('no eligible non-green leaf → no-op', () => {
    const g = freshGame(2);
    g.players['0'].piles.green.cards = [takeFromDeck(g, cardByTitle('Compass').id)];
    // Target: empty board.
    const done = startDogma(g, cardByTitle('Compass').id, '0');
    expect(done).toBe(true);
  });
});

describe('Education', () => {
  it('empty score pile: no-op', () => {
    const g = freshGame();
    const done = startDogma(g, cardByTitle('Education').id, '0');
    expect(done).toBe(true);
  });

  it('returns highest score-pile card and draws value=highest+2', () => {
    const g = freshGame();
    const age2 = takeFromDeck(g, ALL_CARDS.find((c) => c.age === 2)!.id);
    const age1 = takeFromDeck(g, ALL_CARDS.find((c) => c.age === 1)!.id);
    g.players['0'].scorePile = [age1, age2];
    startDogma(g, cardByTitle('Education').id, '0');
    expect(g.pendingChoice?.kind).toBe('yes-no');
    // After returning age 2, remaining highest is age 1 → draw age 3.
    const expectedDraw = g.decks[3][0];
    const done = resumeDogma(g, true);
    expect(done).toBe(true);
    expect(g.players['0'].scorePile).not.toContain(age2);
    expect(g.players['0'].hand).toContain(expectedDraw);
  });

  it('declining yes/no is no-op', () => {
    const g = freshGame();
    const age2 = takeFromDeck(g, ALL_CARDS.find((c) => c.age === 2)!.id);
    g.players['0'].scorePile = [age2];
    startDogma(g, cardByTitle('Education').id, '0');
    const done = resumeDogma(g, false);
    expect(done).toBe(true);
    expect(g.players['0'].scorePile).toContain(age2);
  });
});

describe('Engineering (demand + splay)', () => {
  it('level 0: transfers all top-castle cards to activator score pile', () => {
    const g = freshGame(2);
    // Activator: Engineering itself on red → 2 castles. Target: 0 castles board.
    // We need the activator to outrank the target on castles (featured).
    g.players['0'].piles.red.cards = [takeFromDeck(g, cardByTitle('Engineering').id)];
    // Target has top cards with castle on multiple colors.
    const a = takeFromDeck(g, cardByTitle('Tools').id); // blue, top castle
    g.players['1'].piles.blue.cards = [a];
    const done = startDogma(g, cardByTitle('Engineering').id, '0');
    expect(g.players['0'].scorePile).toContain(a);
    expect(g.players['1'].piles.blue.cards).not.toContain(a);
    // Level 1: activator's red pile has only 1 card → splay no-op → done.
    expect(done).toBe(true);
  });

  it('level 1: optional red splay on activator with ≥2 red cards', () => {
    const g = freshGame(1);
    // Stack 2 red cards in activator's red pile.
    g.players['0'].piles.red.cards = [
      takeFromDeck(g, cardByTitle('Archery').id),
      takeFromDeck(g, cardByTitle('Engineering').id),
    ];
    expect(startDogma(g, cardByTitle('Engineering').id, '0')).toBe(false);
    expect(g.pendingChoice?.kind).toBe('yes-no');
    resumeDogma(g, true);
    expect(g.players['0'].piles.red.splay).toBe('left');
  });
});

describe('Feudalism (demand + splay)', () => {
  it('demand: transfers a castle card from hand to activator', () => {
    const g = freshGame(2);
    g.players['0'].piles.purple.cards = [takeFromDeck(g, cardByTitle('Feudalism').id)];
    // Target: castle-bearing hand card.
    const dom = takeFromDeck(g, cardByTitle('Domestication').id); // 2 castles
    g.players['1'].hand = [dom];
    startDogma(g, cardByTitle('Feudalism').id, '0');
    expect(g.pendingChoice?.kind).toBe('select-hand-card');
    expect(g.pendingChoice?.options).toContain(dom);
    resumeDogma(g, dom);
    expect(g.players['0'].hand).toContain(dom);
  });

  it('demand: no castle in hand → no-op', () => {
    const g = freshGame(2);
    g.players['0'].piles.purple.cards = [takeFromDeck(g, cardByTitle('Feudalism').id)];
    // Target hand: only non-castle card.
    const ag = takeFromDeck(g, cardByTitle('Agriculture').id);
    g.players['1'].hand = [ag];
    const done = startDogma(g, cardByTitle('Feudalism').id, '0');
    expect(done).toBe(true);
    expect(g.players['1'].hand).toContain(ag);
  });
});

describe('Machinery (demand + score/splay)', () => {
  it('demand: exchanges target hand with activator highest', () => {
    const g = freshGame(2);
    // Activator: 3 leaves on yellow Agriculture → outranks target.
    g.players['0'].piles.yellow.cards = [takeFromDeck(g, cardByTitle('Agriculture').id)];
    const aHigh = takeFromDeck(g, ALL_CARDS.find((c) => c.age === 2)!.id);
    const aLow = takeFromDeck(g, ALL_CARDS.find((c) => c.age === 1)!.id);
    g.players['0'].hand = [aHigh, aLow];
    const tCard = takeFromDeck(g, cardByTitle('Pottery').id);
    g.players['1'].hand = [tCard];
    startDogma(g, cardByTitle('Machinery').id, '0');
    expect(g.players['1'].hand).toContain(aHigh);
    expect(g.players['0'].hand).toContain(tCard);
    expect(g.players['0'].hand).toContain(aLow); // not highest, not exchanged
  });

  it('level 1: score castle from hand, then splay pause', () => {
    const g = freshGame(1);
    const dom = takeFromDeck(g, cardByTitle('Domestication').id);
    g.players['0'].hand = [dom];
    // Build a 2-card red pile for splay step.
    g.players['0'].piles.red.cards = [
      takeFromDeck(g, cardByTitle('Archery').id),
      takeFromDeck(g, cardByTitle('Tools').id),
    ];
    expect(startDogma(g, cardByTitle('Machinery').id, '0')).toBe(false);
    expect(g.pendingChoice?.kind).toBe('select-hand-card');
    expect(resumeDogma(g, dom)).toBe(false);
    expect(g.pendingChoice?.kind).toBe('yes-no');
    resumeDogma(g, true);
    expect(g.players['0'].piles.red.splay).toBe('left');
    expect(g.players['0'].scorePile).toContain(dom);
  });
});

describe('Medicine (demand)', () => {
  it('exchanges target highest with activator lowest', () => {
    const g = freshGame(2);
    // Activator: 3 leaves on Agriculture → outranks target.
    g.players['0'].piles.yellow.cards = [takeFromDeck(g, cardByTitle('Agriculture').id)];
    const aLow = takeFromDeck(g, ALL_CARDS.find((c) => c.age === 1)!.id);
    g.players['0'].scorePile = [aLow];
    const tHi = takeFromDeck(g, ALL_CARDS.find((c) => c.age === 3 && c.id !== cardByTitle('Medicine').id)!.id);
    g.players['1'].scorePile = [tHi];
    startDogma(g, cardByTitle('Medicine').id, '0');
    expect(g.players['0'].scorePile).toContain(tHi);
    expect(g.players['1'].scorePile).toContain(aLow);
  });

  it('target empty score pile: only activator → target leg fires', () => {
    const g = freshGame(2);
    g.players['0'].piles.yellow.cards = [takeFromDeck(g, cardByTitle('Agriculture').id)];
    const aLow = takeFromDeck(g, ALL_CARDS.find((c) => c.age === 1)!.id);
    g.players['0'].scorePile = [aLow];
    startDogma(g, cardByTitle('Medicine').id, '0');
    expect(g.players['1'].scorePile).toContain(aLow);
    expect(g.players['0'].scorePile).not.toContain(aLow);
  });
});

describe('Optics', () => {
  it('crown branch: melds a 3 with crown → draws and scores a 4', () => {
    const g = freshGame(1);
    // Force top of age-3 deck to be a crown-bearing card.
    const crown3 = ALL_CARDS.find((c) => c.age === 3 && c.icons.includes('crown'))!;
    takeFromDeck(g, crown3.id);
    g.decks[3].unshift(crown3.id);
    const expectScored = g.decks[4][0];
    startDogma(g, cardByTitle('Optics').id, '0');
    expect(g.players['0'].piles[crown3.color].cards).toContain(crown3.id);
    expect(g.players['0'].scorePile).toContain(expectScored);
  });

  it('non-crown branch with no poorer opponent (1p): just melds, no transfer', () => {
    const g = freshGame(1);
    // Force a non-crown age 3 to top of deck.
    const noCrown3 = ALL_CARDS.find((c) => c.age === 3 && !c.icons.includes('crown'))!;
    takeFromDeck(g, noCrown3.id);
    g.decks[3].unshift(noCrown3.id);
    const done = startDogma(g, cardByTitle('Optics').id, '0');
    expect(done).toBe(true);
    expect(g.players['0'].piles[noCrown3.color].cards).toContain(noCrown3.id);
  });

  it('3p with multiple poorer opponents: prompts activator to pick which', () => {
    const g = freshGame(3);
    // Activator needs a lightbulb advantage or else sharers run first and
    // eat the forced deck-top. Writing (blue, 3 lightbulbs) on the board
    // gives '0' 3 lightbulbs vs 0 — opponents excluded from level 0.
    g.players['0'].piles.blue.cards = [takeFromDeck(g, cardByTitle('Writing').id)];
    // Force non-crown 3 to top so we go to the transfer branch.
    const noCrown3 = ALL_CARDS.find((c) => c.age === 3 && !c.icons.includes('crown'))!;
    takeFromDeck(g, noCrown3.id);
    g.decks[3].unshift(noCrown3.id);
    // Activator with a score-pile card to transfer.
    const scoreCard = takeFromDeck(g, cardByTitle('Calendar').id);
    g.players['0'].scorePile = [scoreCard];
    // Both opponents have 0 score → both eligible.

    startDogma(g, cardByTitle('Optics').id, '0');
    expect(g.pendingChoice?.kind).toBe('select-player');
    expect(g.pendingChoice?.playerOptions).toEqual(['1', '2']);
    resumeDogma(g, 2); // pick opponent 2
    // Now should pause on select-score-card.
    expect(g.pendingChoice?.kind).toBe('select-score-card');
    expect(g.pendingChoice?.playerId).toBe('0'); // activator picks the card
    resumeDogma(g, scoreCard);
    expect(g.players['2'].scorePile).toContain(scoreCard);
    expect(g.players['1'].scorePile.length).toBe(0); // untouched
  });
});

describe('Paper', () => {
  it('level 0: declining splay is no-op; level 1 fires if any color splayed left', () => {
    const g = freshGame(1);
    // Pre-splay green left.
    g.players['0'].piles.green.cards = [
      takeFromDeck(g, cardByTitle('Tools').id), // not green actually — use a green
    ];
    // Reset: use actual green cards.
    g.players['0'].piles.green.cards = [];
    const greenA = ALL_CARDS.find((c) => c.color === 'green' && c.age === 1)!;
    const greenB = ALL_CARDS.find((c) => c.color === 'green' && c.age === 1 && c.id !== greenA.id)!;
    g.players['0'].piles.green.cards = [
      takeFromDeck(g, greenA.id), takeFromDeck(g, greenB.id),
    ];
    g.players['0'].piles.green.splay = 'left';
    // Now no other eligible colors → level 0 no-op since green already left.
    const handBefore = g.players['0'].hand.length;
    startDogma(g, cardByTitle('Paper').id, '0');
    // Level 1 draws one 4 for the single left-splayed color.
    expect(g.players['0'].hand.length).toBe(handBefore + 1);
  });

  it('level 0: pauses to ask splay color when eligible', () => {
    const g = freshGame(1);
    const greenA = ALL_CARDS.find((c) => c.color === 'green' && c.age === 1)!;
    const greenB = ALL_CARDS.find((c) => c.color === 'green' && c.age === 1 && c.id !== greenA.id)!;
    g.players['0'].piles.green.cards = [
      takeFromDeck(g, greenA.id), takeFromDeck(g, greenB.id),
    ];
    const done = startDogma(g, cardByTitle('Paper').id, '0');
    expect(done).toBe(false);
    expect(g.pendingChoice?.kind).toBe('select-board-color');
  });
});

describe('Translation', () => {
  it('declining yes/no is no-op for level 0; level 1 may still claim World', () => {
    const g = freshGame(1);
    // Make every top card crown-bearing for World check. Use just Compass (3 crowns top).
    const compass = takeFromDeck(g, cardByTitle('Compass').id);
    g.players['0'].piles.green.cards = [compass];
    // Score pile non-empty → level 0 pauses with yes/no.
    const age1 = takeFromDeck(g, ALL_CARDS.find((c) => c.age === 1)!.id);
    g.players['0'].scorePile = [age1];
    expect(startDogma(g, cardByTitle('Translation').id, '0')).toBe(false);
    expect(g.pendingChoice?.kind).toBe('yes-no');
    // Decline level 0.
    expect(resumeDogma(g, false)).toBe(true);
    // Level 1 claimed World (Compass top has Crown).
    expect(g.players['0'].specialAchievements).toContain('World');
  });

  it('level 0: yes → melds every score-pile card via one-at-a-time picks', () => {
    const g = freshGame(1);
    const a = takeFromDeck(g, cardByTitle('Agriculture').id);
    const b = takeFromDeck(g, cardByTitle('Pottery').id);
    g.players['0'].scorePile = [a, b];
    startDogma(g, cardByTitle('Translation').id, '0');
    resumeDogma(g, true); // yes
    expect(g.pendingChoice?.kind).toBe('select-score-card');
    resumeDogma(g, a);
    expect(g.pendingChoice?.kind).toBe('select-score-card');
    const done = resumeDogma(g, b);
    expect(done).toBe(true);
    expect(g.players['0'].scorePile).toHaveLength(0);
    expect(g.players['0'].piles[cardById(a).color].cards).toContain(a);
    expect(g.players['0'].piles[cardById(b).color].cards).toContain(b);
  });

  it('level 1: not every top has crown → World not claimed', () => {
    const g = freshGame(1);
    // A non-crown top card.
    const nonCrownTop = ALL_CARDS.find((c) => !c.icons.includes('crown'))!;
    g.players['0'].piles[nonCrownTop.color].cards = [takeFromDeck(g, nonCrownTop.id)];
    startDogma(g, cardByTitle('Translation').id, '0');
    expect(g.players['0'].specialAchievements).not.toContain('World');
  });
});
