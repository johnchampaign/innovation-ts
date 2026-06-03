// Tests for the Age-2 dogma handlers. Selectively re-ported from
// Innovation.Tests/Age2*HandlerTests.cs — at least one case per registered
// card. Mirrors the conventions in age1.test.ts.

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
    log: [],
  };
  for (const c of ALL_CARDS) g.decks[c.age].push(c.id);
  for (let i = 0; i < numPlayers; i++) g.players[String(i)] = newPlayer();
  return g;
}

describe('Calendar', () => {
  it('draws two 3s when score pile > hand', () => {
    const g = freshGame();
    g.players['0'].scorePile = [takeFromDeck(g, cardByTitle('Agriculture').id)];
    const a = g.decks[3][0];
    const b = g.decks[3][1];
    startDogma(g, cardByTitle('Calendar').id, '0');
    expect(g.players['0'].hand).toContain(a);
    expect(g.players['0'].hand).toContain(b);
  });

  it('no-op when score <= hand', () => {
    const g = freshGame();
    g.players['0'].hand = [takeFromDeck(g, cardByTitle('Agriculture').id)];
    const before = g.players['0'].hand.length;
    startDogma(g, cardByTitle('Calendar').id, '0');
    expect(g.players['0'].hand.length).toBe(before);
  });
});

describe('Canal Building', () => {
  it('on yes: highest hand <-> highest score swap', () => {
    const g = freshGame();
    // Hand: an age-2 (highest) and an age-1. Score: an age-3 (highest).
    const h2 = takeFromDeck(g, ALL_CARDS.find((c) => c.age === 2)!.id);
    const h1 = takeFromDeck(g, cardByTitle('Agriculture').id);
    const s3 = takeFromDeck(g, ALL_CARDS.find((c) => c.age === 3)!.id);
    g.players['0'].hand = [h2, h1];
    g.players['0'].scorePile = [s3];

    expect(startDogma(g, cardByTitle('Canal Building').id, '0')).toBe(false);
    expect(g.pendingChoice?.kind).toBe('yes-no');
    resumeDogma(g, true);

    expect(g.players['0'].hand).toContain(s3); // age-3 moved to hand
    expect(g.players['0'].hand).toContain(h1); // age-1 untouched (not highest)
    expect(g.players['0'].hand).not.toContain(h2); // age-2 moved to score
    expect(g.players['0'].scorePile).toContain(h2);
    expect(g.players['0'].scorePile).not.toContain(s3);
  });

  it('on no: nothing changes', () => {
    const g = freshGame();
    const h = takeFromDeck(g, cardByTitle('Agriculture').id);
    g.players['0'].hand = [h];
    startDogma(g, cardByTitle('Canal Building').id, '0');
    resumeDogma(g, false);
    expect(g.players['0'].hand).toContain(h);
  });
});

describe('Construction (demand + Empire)', () => {
  function setup(): InnovationState {
    const g = freshGame(2);
    // Activator: Construction itself on red (3 castles) beats target (0).
    g.players['0'].piles.red.cards = [takeFromDeck(g, cardByTitle('Construction').id)];
    // Target hand: two age-1 cards.
    g.players['1'].hand = [
      takeFromDeck(g, cardByTitle('Agriculture').id),
      takeFromDeck(g, cardByTitle('Archery').id),
    ];
    return g;
  }

  it('demand: target picks 2 cards, transfers to activator, then draws a 2', () => {
    const g = setup();
    const targetHand = [...g.players['1'].hand];
    const drawExpected = g.decks[2][0];
    expect(startDogma(g, cardByTitle('Construction').id, '0')).toBe(false);
    expect(g.pendingChoice?.kind).toBe('select-hand-card-subset');
    expect(g.pendingChoice?.minCount).toBe(2);
    expect(g.pendingChoice?.maxCount).toBe(2);
    resumeDogma(g, targetHand);
    for (const id of targetHand) expect(g.players['0'].hand).toContain(id);
    // Target drew a 2.
    expect(g.players['1'].hand).toContain(drawExpected);
  });

  it('demand does NOT trigger shared bonus draw', () => {
    const g = setup();
    const activatorHandBefore = g.players['0'].hand.length;
    startDogma(g, cardByTitle('Construction').id, '0');
    const picks = [...g.players['1'].hand];
    resumeDogma(g, picks);
    // Activator gained exactly 2 cards from transfer; no extra share-bonus draw
    // (Construction's level-1 doesn't fire because target also has 5 colors? no
    // - target has 0 colors. Activator only has red. So Empire shouldn't fire.).
    expect(g.players['0'].hand.length).toBe(activatorHandBefore + 2);
  });

  it('Empire effect: claims when activator alone has 5 top cards', () => {
    const g = freshGame(2);
    // Activator: 5 colors.
    for (const c of COLORS) {
      const id = takeFromDeck(g, ALL_CARDS.find((cd) => cd.color === c)!.id);
      g.players['0'].piles[c].cards = [id];
    }
    // Opponent has nothing.
    g.availableSpecialAchievements = ['Empire'];
    // Activator has 0 castles (none of those 5 chosen necessarily castle), so
    // demand won't fire on opponent regardless.
    startDogma(g, cardByTitle('Construction').id, '0');
    expect(g.players['0'].specialAchievements).toContain('Empire');
  });
});

describe('Currency', () => {
  it('returning two cards of two distinct ages → draws and scores two 2s', () => {
    const g = freshGame();
    const a1 = takeFromDeck(g, cardByTitle('Agriculture').id); // age 1
    const a2 = takeFromDeck(g, ALL_CARDS.find((c) => c.age === 2)!.id);
    g.players['0'].hand = [a1, a2];
    const score1 = g.decks[2][0];
    // After we remove a2 from deck order in the next-draw chain — careful: a2
    // is from age 2 deck. But we returned it: it goes to bottom of deck 2.
    expect(startDogma(g, cardByTitle('Currency').id, '0')).toBe(false);
    expect(g.pendingChoice?.kind).toBe('select-hand-card-subset');
    resumeDogma(g, [a1, a2]);
    // Two distinct ages → two age-2 scored.
    expect(g.players['0'].scorePile).toContain(score1);
    expect(g.players['0'].scorePile.length).toBe(2);
  });

  it('returning zero cards: no-op', () => {
    const g = freshGame();
    const a = takeFromDeck(g, cardByTitle('Agriculture').id);
    g.players['0'].hand = [a];
    startDogma(g, cardByTitle('Currency').id, '0');
    const done = resumeDogma(g, []);
    expect(done).toBe(true);
    expect(g.players['0'].scorePile.length).toBe(0);
    expect(g.players['0'].hand).toContain(a);
  });
});

describe('Fermenting', () => {
  it('2 leaves on board → 1 draw of a 2', () => {
    const g = freshGame();
    // Agriculture has 3 leaves, Fermenting has 2 leaves+1. Use Agriculture
    // for >=2 leaves cleanly.
    g.players['0'].piles.green.cards = [takeFromDeck(g, cardByTitle('Agriculture').id)];
    const drawExpected = g.decks[2][0];
    startDogma(g, cardByTitle('Fermenting').id, '0');
    expect(g.players['0'].hand).toContain(drawExpected);
  });

  it('no leaves → no-op', () => {
    const g = freshGame();
    const before = g.players['0'].hand.length;
    startDogma(g, cardByTitle('Fermenting').id, '0');
    expect(g.players['0'].hand.length).toBe(before);
  });
});

describe('Mapmaking (demand + conditional)', () => {
  function setup(): InnovationState {
    const g = freshGame(2);
    // Activator: Mapmaking on green (2 crowns) vs target 0 crowns.
    g.players['0'].piles.green.cards = [takeFromDeck(g, cardByTitle('Mapmaking').id)];
    // Target has age-1 in score.
    g.players['1'].scorePile = [takeFromDeck(g, cardByTitle('Agriculture').id)];
    return g;
  }

  it('transfers a 1 to activator score, then activator draws and scores a 1', () => {
    const g = setup();
    const moved = g.players['1'].scorePile[0];
    const activatorDraw = g.decks[1][0];
    startDogma(g, cardByTitle('Mapmaking').id, '0');
    expect(g.pendingChoice?.kind).toBe('select-score-card');
    expect(g.pendingChoice?.playerId).toBe('1');
    resumeDogma(g, moved);
    expect(g.players['0'].scorePile).toContain(moved);
    expect(g.players['1'].scorePile).not.toContain(moved);
    // Level 1 draw-and-score fires for activator.
    expect(g.players['0'].scorePile).toContain(activatorDraw);
  });

  it('no eligible 1s → no demand and no draw-score', () => {
    const g = freshGame(2);
    g.players['0'].piles.green.cards = [takeFromDeck(g, cardByTitle('Mapmaking').id)];
    // Target score empty.
    const activatorScoreBefore = g.players['0'].scorePile.length;
    startDogma(g, cardByTitle('Mapmaking').id, '0');
    expect(g.players['0'].scorePile.length).toBe(activatorScoreBefore);
  });
});

describe('Mathematics', () => {
  it('returning an age-1 → draw-and-meld an age-2', () => {
    const g = freshGame();
    const a1 = takeFromDeck(g, cardByTitle('Agriculture').id);
    g.players['0'].hand = [a1];
    const meldExpected = g.decks[2][0];
    const meldColor = cardById(meldExpected).color;
    startDogma(g, cardByTitle('Mathematics').id, '0');
    expect(g.pendingChoice?.kind).toBe('select-hand-card');
    expect(g.pendingChoice?.optional).toBe(true);
    resumeDogma(g, a1);
    expect(g.players['0'].hand).not.toContain(a1);
    expect(g.players['0'].piles[meldColor].cards[0]).toBe(meldExpected);
  });

  it('declining → no-op', () => {
    const g = freshGame();
    const a1 = takeFromDeck(g, cardByTitle('Agriculture').id);
    g.players['0'].hand = [a1];
    startDogma(g, cardByTitle('Mathematics').id, '0');
    resumeDogma(g, null);
    expect(g.players['0'].hand).toContain(a1);
  });
});

describe('Monotheism (demand + share)', () => {
  it("transfer eligible top color to activator score + target draws and tucks 1", () => {
    const g = freshGame(2);
    // Activator: Monotheism on purple (3 castles); only purple on board.
    g.players['0'].piles.purple.cards = [takeFromDeck(g, cardByTitle('Monotheism').id)];
    // Target: a yellow top card (color activator does not have).
    g.players['1'].piles.yellow.cards = [takeFromDeck(g, cardByTitle('Agriculture').id)];
    const moved = g.players['1'].piles.yellow.cards[0];
    const tuckExpected = g.decks[1][0];
    const tuckColor = cardById(tuckExpected).color;
    startDogma(g, cardByTitle('Monotheism').id, '0');
    expect(g.pendingChoice?.kind).toBe('select-board-color');
    const colorIdx = g.pendingChoice!.options[0];
    resumeDogma(g, colorIdx);
    expect(g.players['0'].scorePile).toContain(moved);
    // Target's tuck — bottom of the relevant pile.
    expect(g.players['1'].piles[tuckColor].cards.at(-1)).toBe(tuckExpected);
  });

  it('level-1 share: activator draws and tucks a 1 (1p)', () => {
    const g = freshGame(1);
    const tuckExpected = g.decks[1][0];
    const tuckColor = cardById(tuckExpected).color;
    startDogma(g, cardByTitle('Monotheism').id, '0');
    expect(g.players['0'].piles[tuckColor].cards.at(-1)).toBe(tuckExpected);
  });
});

describe('Philosophy', () => {
  it('level 0: splays selected color left', () => {
    const g = freshGame();
    g.players['0'].piles.yellow.cards = [
      takeFromDeck(g, cardByTitle('Agriculture').id),
      takeFromDeck(g, cardByTitle('Domestication').id),
    ];
    startDogma(g, cardByTitle('Philosophy').id, '0');
    expect(g.pendingChoice?.kind).toBe('select-board-color');
    const yellowIdx = COLORS.indexOf('yellow');
    expect(g.pendingChoice?.options).toContain(yellowIdx);
    resumeDogma(g, yellowIdx);
    expect(g.players['0'].piles.yellow.splay).toBe('left');
  });

  it('level 1: scoring a hand card moves it to the score pile', () => {
    const g = freshGame();
    // No splayable piles → level 0 no-ops; level 1 pauses for score pick.
    const a = takeFromDeck(g, cardByTitle('Agriculture').id);
    g.players['0'].hand = [a];
    startDogma(g, cardByTitle('Philosophy').id, '0');
    expect(g.pendingChoice?.kind).toBe('select-hand-card');
    resumeDogma(g, a);
    expect(g.players['0'].scorePile).toContain(a);
  });

  it('level 1: decline → no score', () => {
    const g = freshGame();
    const a = takeFromDeck(g, cardByTitle('Agriculture').id);
    g.players['0'].hand = [a];
    startDogma(g, cardByTitle('Philosophy').id, '0');
    resumeDogma(g, null);
    expect(g.players['0'].scorePile.length).toBe(0);
    expect(g.players['0'].hand).toContain(a);
  });
});

describe('Road Building', () => {
  it('melding one card: no exchange offered', () => {
    const g = freshGame();
    const a = takeFromDeck(g, cardByTitle('Agriculture').id);
    g.players['0'].hand = [a];
    startDogma(g, cardByTitle('Road Building').id, '0');
    expect(g.pendingChoice?.kind).toBe('select-hand-card-subset');
    const done = resumeDogma(g, [a]);
    expect(done).toBe(true);
    expect(g.players['0'].piles[cardById(a).color].cards[0]).toBe(a);
  });

  it('melding two: offers exchange (yes branch swaps red↔green)', () => {
    const g = freshGame(2);
    // Activator hand: two cards to meld (one red, one anything).
    const red = takeFromDeck(g, cardByTitle('Archery').id); // red
    const other = takeFromDeck(g, cardByTitle('Agriculture').id);
    g.players['0'].hand = [red, other];
    // Opponent: top green card to receive.
    const oppGreen = takeFromDeck(g, ALL_CARDS.find((c) => c.color === 'green' && c.age === 1)!.id);
    g.players['1'].piles.green.cards = [oppGreen];

    startDogma(g, cardByTitle('Road Building').id, '0');
    resumeDogma(g, [red, other]);
    // Now should pause yes/no for exchange.
    expect(g.pendingChoice?.kind).toBe('yes-no');
    resumeDogma(g, true);
    // Red moved to opponent's red pile.
    expect(g.players['1'].piles.red.cards[0]).toBe(red);
    // Green moved to activator's green pile.
    expect(g.players['0'].piles.green.cards[0]).toBe(oppGreen);
  });

  it('melding two with no top red: exchange not offered, done after meld', () => {
    const g = freshGame(2);
    // Both cards non-red so no red on top after meld.
    const a = takeFromDeck(g, cardByTitle('Agriculture').id); // green
    const b = takeFromDeck(g, cardByTitle('Domestication').id); // yellow
    g.players['0'].hand = [a, b];
    startDogma(g, cardByTitle('Road Building').id, '0');
    const done = resumeDogma(g, [a, b]);
    expect(done).toBe(true);
  });
});
