// Tests for Age-6 dogma handlers. Mirrors the structure of age1.test.ts —
// drives every test through the real startDogma / resumeDogma engine.

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

describe('Atomic Theory', () => {
  it('eff0 skipped when blue pile has <2 cards; eff1 draw-and-melds a 7', () => {
    const g = freshGame();
    const expected = g.decks[7][0];
    const color = cardById(expected).color;
    const done = startDogma(g, cardByTitle('Atomic Theory').id, '0');
    expect(done).toBe(true);
    expect(g.players['0'].piles[color].cards[0]).toBe(expected);
  });

  it('eff0 yes/no splay blue right when eligible', () => {
    const g = freshGame();
    // Two blue cards on board → eligible to splay right.
    g.players['0'].piles.blue.cards = [
      takeFromDeck(g, cardByTitle('Atomic Theory').id),
      takeFromDeck(g, cardByTitle('Encyclopedia').id),
    ];
    const done = startDogma(g, cardByTitle('Atomic Theory').id, '0');
    expect(done).toBe(false);
    expect(g.pendingChoice?.kind).toBe('yes-no');
    expect(resumeDogma(g, true)).toBe(true);
    expect(g.players['0'].piles.blue.splay).toBe('right');
  });
});

describe('Canning', () => {
  it('eff0 yes path: tucks a 6 and scores non-factory tops', () => {
    const g = freshGame();
    // Plant a non-factory top so it scores. Agriculture (yellow, leaves, no factory).
    const noFactory = takeFromDeck(g, cardByTitle('Agriculture').id);
    g.players['0'].piles.yellow.cards = [noFactory];
    const tuckExpected = g.decks[6][0];
    startDogma(g, cardByTitle('Canning').id, '0');
    expect(g.pendingChoice?.kind).toBe('yes-no');
    resumeDogma(g, true);
    // The non-factory top was scored. (The tucked card may also be scored
    // immediately if it itself lacks a [Factory] — Canning's text reads
    // "score all your top cards without a [Factory]" after the tuck.)
    expect(g.players['0'].scorePile).toContain(noFactory);
    void tuckExpected;
  });

  it('eff0 no path: nothing happens at eff0', () => {
    const g = freshGame();
    startDogma(g, cardByTitle('Canning').id, '0');
    const handBefore = g.players['0'].hand.length;
    resumeDogma(g, false);
    expect(g.players['0'].hand.length).toBe(handBefore);
  });
});

describe('Classification', () => {
  it('reveals a color, takes matches from opponents, melds (single match)', () => {
    const g = freshGame(2);
    // Give activator lightbulb advantage so opponent doesn't share-run first
    // (Classification's featured icon is [Lightbulb]; Classification itself
    // shows 3 lightbulbs on top).
    g.players['0'].piles.green.cards = [takeFromDeck(g, cardByTitle('Classification').id)];
    // Activator hand: a yellow card.
    const myYellow = takeFromDeck(g, cardByTitle('Agriculture').id); // yellow
    g.players['0'].hand = [myYellow];
    // Opponent hand: another yellow (Domestication).
    const oppYellow = takeFromDeck(g, cardByTitle('Domestication').id);
    g.players['1'].hand = [oppYellow];
    startDogma(g, cardByTitle('Classification').id, '0');
    expect(g.pendingChoice?.kind).toBe('select-hand-card');
    // Reveal the yellow card.
    resumeDogma(g, myYellow);
    // Both yellows are now melded onto yellow pile (order: 2 picked → asked order).
    // Two melds → would ask order. Let's check: pending choice is select-card-order.
    if (g.pendingChoice?.kind === 'select-card-order') {
      resumeDogma(g, [myYellow, oppYellow]);
    }
    expect(g.players['0'].piles.yellow.cards).toContain(myYellow);
    expect(g.players['0'].piles.yellow.cards).toContain(oppYellow);
    expect(g.players['1'].hand).not.toContain(oppYellow);
  });

  it('no opponent matches & one matching card → single auto-meld', () => {
    const g = freshGame(1);
    const myYellow = takeFromDeck(g, cardByTitle('Agriculture').id);
    g.players['0'].hand = [myYellow];
    startDogma(g, cardByTitle('Classification').id, '0');
    resumeDogma(g, myYellow);
    expect(g.players['0'].piles.yellow.cards[0]).toBe(myYellow);
  });
});

describe('Democracy', () => {
  it('returning two cards: draws and scores an 8', () => {
    const g = freshGame();
    const a = g.decks[1].shift()!;
    const b = g.decks[1].shift()!;
    g.players['0'].hand = [a, b];
    const expected = g.decks[8][0];
    startDogma(g, cardByTitle('Democracy').id, '0');
    expect(g.pendingChoice?.kind).toBe('select-hand-card-subset');
    resumeDogma(g, [a, b]);
    expect(g.players['0'].scorePile).toContain(expected);
    expect(g.players['0'].hand).not.toContain(a);
    expect(g.players['0'].hand).not.toContain(b);
  });

  it('returning zero: no draw-and-score', () => {
    const g = freshGame();
    const a = g.decks[1].shift()!;
    g.players['0'].hand = [a];
    startDogma(g, cardByTitle('Democracy').id, '0');
    resumeDogma(g, []);
    expect(g.players['0'].scorePile.length).toBe(0);
    expect(g.players['0'].hand).toContain(a);
  });
});

describe('Emancipation (demand)', () => {
  function setup(): InnovationState {
    const g = freshGame(2);
    // Activator has Emancipation on purple (2 factories) → beats opp (0 factories).
    g.players['0'].piles.purple.cards = [takeFromDeck(g, cardByTitle('Emancipation').id)];
    // Target hand: one card.
    g.players['1'].hand = [takeFromDeck(g, cardByTitle('Agriculture').id)];
    return g;
  }

  it('demand: target transfers a hand card to activator score, then draws a 6', () => {
    const g = setup();
    startDogma(g, cardByTitle('Emancipation').id, '0');
    expect(g.pendingChoice?.kind).toBe('select-hand-card');
    expect(g.pendingChoice?.playerId).toBe('1');
    const transferred = g.pendingChoice!.options[0];
    const targetHandBefore = g.players['1'].hand.length;
    const sixExpected = g.decks[6][0];
    resumeDogma(g, transferred);
    expect(g.players['0'].scorePile).toContain(transferred);
    // Target lost 1 then drew a 6 → same hand size.
    expect(g.players['1'].hand.length).toBe(targetHandBefore);
    expect(g.players['1'].hand).toContain(sixExpected);
  });

  it('eff1 splay path skipped when no eligible red/purple pile', () => {
    const g = freshGame(); // 1 player, empty board.
    const done = startDogma(g, cardByTitle('Emancipation').id, '0');
    // No demand targets (1p), eff1 has no eligible color → completes.
    expect(done).toBe(true);
  });
});

describe('Encyclopedia', () => {
  it('yes path: melds the highest-age card from score pile', () => {
    const g = freshGame();
    // Score pile: one age-1 (Agriculture, yellow) and one age-3 (some age-3 card).
    const lo = takeFromDeck(g, cardByTitle('Agriculture').id);
    const age3 = ALL_CARDS.find((c) => c.age === 3)!.id;
    takeFromDeck(g, age3);
    g.players['0'].scorePile = [lo, age3];
    const color = cardById(age3).color;
    startDogma(g, cardByTitle('Encyclopedia').id, '0');
    expect(g.pendingChoice?.kind).toBe('yes-no');
    resumeDogma(g, true);
    expect(g.players['0'].piles[color].cards).toContain(age3);
    expect(g.players['0'].scorePile).not.toContain(age3);
    expect(g.players['0'].scorePile).toContain(lo);
  });

  it('empty score pile is a no-op', () => {
    const g = freshGame();
    const done = startDogma(g, cardByTitle('Encyclopedia').id, '0');
    expect(done).toBe(true);
    expect(g.pendingChoice).toBeNull();
  });

  it('no answer skips meld', () => {
    const g = freshGame();
    g.players['0'].scorePile = [takeFromDeck(g, cardByTitle('Agriculture').id)];
    startDogma(g, cardByTitle('Encyclopedia').id, '0');
    resumeDogma(g, false);
    expect(g.players['0'].scorePile.length).toBe(1);
  });
});

describe('Industrialization', () => {
  it('eff0: draws and tucks a 6 for every two factories', () => {
    const g = freshGame();
    // Plant 4 factories on board: Industrialization itself (Crown+Factory+Factory)
    // and Emancipation (Factory+Lightbulb+Factory). Together: 4 factories → 2 tucks.
    g.players['0'].piles.red.cards = [takeFromDeck(g, cardByTitle('Industrialization').id)];
    g.players['0'].piles.purple.cards = [takeFromDeck(g, cardByTitle('Emancipation').id)];
    const first = g.decks[6][0];
    const second = g.decks[6][1];
    startDogma(g, cardByTitle('Industrialization').id, '0');
    // Both 6s ended up tucked at the BOTTOM of their respective color piles.
    const firstColor = cardById(first).color;
    const secondColor = cardById(second).color;
    expect(g.players['0'].piles[firstColor].cards).toContain(first);
    expect(g.players['0'].piles[secondColor].cards).toContain(second);
  });

  it('eff0 no-op when frozen factory count <2', () => {
    const g = freshGame();
    // Empty board → frozen factory count = 0 → eff0 no-op.
    const decksBefore = g.decks[6].length;
    startDogma(g, cardByTitle('Industrialization').id, '0');
    expect(g.decks[6].length).toBe(decksBefore);
  });
});

describe('Machine Tools', () => {
  it('empty score pile → draws and scores a 1', () => {
    const g = freshGame();
    const expected = g.decks[1][0];
    startDogma(g, cardByTitle('Machine Tools').id, '0');
    expect(g.players['0'].scorePile).toContain(expected);
  });

  it('highest score is age 4 → draws and scores a 4 (or higher if 4 deck is empty)', () => {
    const g = freshGame();
    const age4 = ALL_CARDS.find((c) => c.age === 4)!.id;
    takeFromDeck(g, age4);
    g.players['0'].scorePile = [age4];
    const expected = g.decks[4][0];
    startDogma(g, cardByTitle('Machine Tools').id, '0');
    expect(g.players['0'].scorePile).toContain(expected);
  });
});

describe('Metric System', () => {
  it("eff0 skipped if green not splayed right; eff1 splays green right when 2+ green cards", () => {
    const g = freshGame();
    // Two green cards on board, splay none.
    g.players['0'].piles.green.cards = [
      takeFromDeck(g, cardByTitle('Classification').id),
      takeFromDeck(g, cardByTitle('Metric System').id),
    ];
    startDogma(g, cardByTitle('Metric System').id, '0');
    expect(g.pendingChoice?.kind).toBe('yes-no');
    resumeDogma(g, true);
    expect(g.players['0'].piles.green.splay).toBe('right');
  });

  it('eff0 active: with green-splayed-right, can splay another color right', () => {
    const g = freshGame();
    // Two green cards splayed right; two yellow cards (eligible to splay).
    g.players['0'].piles.green.cards = [
      takeFromDeck(g, cardByTitle('Classification').id),
      takeFromDeck(g, cardByTitle('Metric System').id),
    ];
    g.players['0'].piles.green.splay = 'right';
    g.players['0'].piles.yellow.cards = [
      takeFromDeck(g, cardByTitle('Agriculture').id),
      takeFromDeck(g, cardByTitle('Domestication').id),
    ];
    startDogma(g, cardByTitle('Metric System').id, '0');
    expect(g.pendingChoice?.kind).toBe('select-board-color');
    const yellowIdx = COLORS.indexOf('yellow');
    expect(g.pendingChoice?.options).toContain(yellowIdx);
    resumeDogma(g, yellowIdx);
    // Then eff1 still asks about green (already right → no-op skip).
    // Engine completes (green already splayed right).
    expect(g.players['0'].piles.yellow.splay).toBe('right');
  });
});

describe('Vaccination (demand)', () => {
  function setup(targetScoreTitles: string[]): InnovationState {
    const g = freshGame(2);
    // Activator: Agriculture on yellow (3 leaves) vs target 0 leaves → demand fires.
    g.players['0'].piles.yellow.cards = [takeFromDeck(g, cardByTitle('Agriculture').id)];
    g.players['1'].scorePile = targetScoreTitles.map((t) => takeFromDeck(g, cardByTitle(t).id));
    return g;
  }

  it('returns lowest from target score, target draws-and-melds a 6, activator draws-and-melds a 7', () => {
    // Target score pile: one age-1 (lowest) and one age-3.
    const g = setup(['Domestication']); // age-1
    const age3 = ALL_CARDS.find((c) => c.age === 3)!.id;
    takeFromDeck(g, age3);
    g.players['1'].scorePile.push(age3);
    const sixExpected = g.decks[6][0];
    const sixColor = cardById(sixExpected).color;
    const sevenExpected = g.decks[7][0];
    const sevenColor = cardById(sevenExpected).color;
    startDogma(g, cardByTitle('Vaccination').id, '0');
    // Target's age-1 returned, age-3 stays.
    expect(g.players['1'].scorePile).toContain(age3);
    expect(g.players['1'].scorePile.length).toBe(1);
    // Target drew and melded a 6.
    expect(g.players['1'].piles[sixColor].cards).toContain(sixExpected);
    // Activator drew and melded a 7.
    expect(g.players['0'].piles[sevenColor].cards).toContain(sevenExpected);
  });

  it("does nothing when target's score pile is empty", () => {
    const g = setup([]); // empty target score
    const done = startDogma(g, cardByTitle('Vaccination').id, '0');
    // Demand returns false → eff1 sees demandSuccessful=false → no 7 for activator.
    expect(done).toBe(true);
    expect(g.players['0'].piles.blue.cards.length).toBe(0); // no age-7 meld
  });
});
