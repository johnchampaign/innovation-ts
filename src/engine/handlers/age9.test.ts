// Age 9 dogma handler tests. Patterned after age1.test.ts: each test drives
// the real engine via startDogma/resumeDogma. Mostly 1-player games to keep
// sharing/demand bookkeeping focused on the card under test, with 2-player
// setups when demands or cross-player transfers are needed.

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

// Plant a clock-heavy board on the activator so demands fire on the target.
// Fission itself shows 3 clocks (top + left + middle + right exclude one).
function giveClockAdvantage(g: InnovationState, activatorId: string): void {
  g.players[activatorId].piles.red.cards = [
    takeFromDeck(g, cardByTitle('Fission').id),
  ];
}
function giveFactoryAdvantage(g: InnovationState, activatorId: string): void {
  g.players[activatorId].piles.red.cards = [
    takeFromDeck(g, cardByTitle('Composites').id),
  ];
}
function giveCrownAdvantage(g: InnovationState, activatorId: string): void {
  g.players[activatorId].piles.green.cards = [
    takeFromDeck(g, cardByTitle('Collaboration').id),
  ];
}
function giveLeafAdvantage(g: InnovationState, activatorId: string): void {
  g.players[activatorId].piles.purple.cards = [
    takeFromDeck(g, cardByTitle('Services').id),
  ];
}

describe('Collaboration', () => {
  it('demand: target draws two 9s; activator picks one to take, target melds the other', () => {
    const g = freshGame(2);
    giveCrownAdvantage(g, '0');
    // Pre-seed the age-9 deck so the two 9s drawn are known. Anything but
    // Collaboration itself (already on the board).
    const first = takeFromDeck(g, cardByTitle('Composites').id);
    const second = takeFromDeck(g, cardByTitle('Ecology').id);
    g.decks[9].unshift(first, second);

    const done = startDogma(g, cardByTitle('Collaboration').id, '0');
    expect(done).toBe(false);
    expect(g.pendingChoice?.kind).toBe('select-hand-card');
    expect(g.pendingChoice?.playerId).toBe('0'); // activator picks
    expect(g.pendingChoice?.options).toEqual([first, second]);

    resumeDogma(g, first); // activator takes the first
    // Activator's red pile now contains Composites (red), on top.
    expect(g.players['0'].piles.red.cards).toContain(first);
    // Target melded the other.
    expect(g.players['1'].piles[cardById(second).color].cards).toContain(second);
  });

  it('level 1: solo-win when target has ≥10 green cards on their board', () => {
    const g = freshGame(1);
    // Stack 10 green cards on player 0. Use Collaboration itself + 9 others.
    const greens = ALL_CARDS.filter((c) => c.color === 'green').slice(0, 10);
    g.players['0'].piles.green.cards = greens.map((c) => takeFromDeck(g, c.id));
    startDogma(g, cardByTitle('Collaboration').id, '0');
    expect(g.winnerOverride?.winners).toEqual(['0']);
  });

  it('level 1: no win when under 10 green', () => {
    const g = freshGame(1);
    // Empty green pile.
    const done = startDogma(g, cardByTitle('Collaboration').id, '0');
    expect(done).toBe(true);
    expect(g.winnerOverride).toBeNull();
  });
});

describe('Composites', () => {
  it("transfers all-but-one hand cards + tied-highest score to activator", () => {
    const g = freshGame(2);
    giveFactoryAdvantage(g, '0');
    // Target hand: 3 cards, target score: 1 highest.
    const h1 = takeFromDeck(g, cardByTitle('Agriculture').id);
    const h2 = takeFromDeck(g, cardByTitle('Pottery').id);
    const h3 = takeFromDeck(g, cardByTitle('Writing').id);
    g.players['1'].hand = [h1, h2, h3];
    const sp1 = takeFromDeck(g, cardByTitle('Sailing').id);
    g.players['1'].scorePile = [sp1];

    startDogma(g, cardByTitle('Composites').id, '0');
    expect(g.pendingChoice?.kind).toBe('select-hand-card');
    expect(g.pendingChoice?.playerId).toBe('1');

    // Target keeps h1.
    resumeDogma(g, h1);
    // h2 + h3 moved to activator's hand; h1 stays.
    expect(g.players['1'].hand).toEqual([h1]);
    expect(g.players['0'].hand).toContain(h2);
    expect(g.players['0'].hand).toContain(h3);
    // Score-pile single highest auto-moved (no pause for ties → done).
    expect(g.players['0'].scorePile).toContain(sp1);
    expect(g.players['1'].scorePile).toHaveLength(0);
  });

  it('pauses for tied highest score-pile picks', () => {
    const g = freshGame(2);
    giveFactoryAdvantage(g, '0');
    const a = takeFromDeck(g, cardByTitle('Agriculture').id); // age 1
    const b = takeFromDeck(g, cardByTitle('Pottery').id);     // age 1
    g.players['1'].scorePile = [a, b]; // both age 1 → tied
    g.players['1'].hand = []; // skip hand-pick stage entirely

    startDogma(g, cardByTitle('Composites').id, '0');
    expect(g.pendingChoice?.kind).toBe('select-score-card');
    expect(new Set(g.pendingChoice!.options)).toEqual(new Set([a, b]));
    resumeDogma(g, a);
    expect(g.players['0'].scorePile).toContain(a);
    expect(g.players['1'].scorePile).toEqual([b]);
  });
});

describe('Computers', () => {
  it('level 0: splay choice — picking a color splays it up', () => {
    const g = freshGame(1);
    // Two red cards on board, not yet splayed up.
    g.players['0'].piles.red.cards = [
      takeFromDeck(g, cardByTitle('Archery').id),
      takeFromDeck(g, cardByTitle('Metalworking').id),
    ];
    // No green eligible.
    startDogma(g, cardByTitle('Computers').id, '0');
    expect(g.pendingChoice?.kind).toBe('select-board-color');
    expect(g.pendingChoice?.options).toEqual([COLORS.indexOf('red')]);
    resumeDogma(g, COLORS.indexOf('red'));
    expect(g.players['0'].piles.red.splay).toBe('up');
  });

  it('level 1: draws and melds a 10, then executes its non-demand effects for self', () => {
    const g = freshGame(1);
    // No red/green ≥2 → level 0 no-ops, level 1 fires unconditionally.
    const ten = g.decks[10][0];
    startDogma(g, cardByTitle('Computers').id, '0');
    // The drawn-and-melded 10 is on its color pile.
    expect(g.players['0'].piles[cardById(ten).color].cards).toContain(ten);
  });
});

describe('Ecology', () => {
  it('return + score + draw two 10s', () => {
    const g = freshGame(1);
    const a = takeFromDeck(g, cardByTitle('Agriculture').id);
    const b = takeFromDeck(g, cardByTitle('Pottery').id);
    g.players['0'].hand = [a, b];
    const ten1 = g.decks[10][0];
    const ten2 = g.decks[10][1];

    expect(startDogma(g, cardByTitle('Ecology').id, '0')).toBe(false);
    // Return a.
    expect(resumeDogma(g, a)).toBe(false);
    expect(g.pendingChoice?.kind).toBe('select-hand-card');
    // Score b.
    expect(resumeDogma(g, b)).toBe(true);
    expect(g.players['0'].scorePile).toContain(b);
    expect(g.players['0'].hand).toContain(ten1);
    expect(g.players['0'].hand).toContain(ten2);
  });

  it('declining the optional return is a no-op', () => {
    const g = freshGame(1);
    g.players['0'].hand = [takeFromDeck(g, cardByTitle('Agriculture').id)];
    startDogma(g, cardByTitle('Ecology').id, '0');
    const done = resumeDogma(g, null);
    expect(done).toBe(true);
    expect(g.players['0'].hand).toHaveLength(1);
    expect(g.players['0'].scorePile).toHaveLength(0);
  });
});

describe('Fission', () => {
  it('demand: drawing a non-red 10 simply ends the effect (no wipe)', () => {
    const g = freshGame(2);
    giveClockAdvantage(g, '0');
    // Force the next age-10 draw to be a non-red 10.
    const nonRedTen = ALL_CARDS.find((c) => c.age === 10 && c.color !== 'red')!;
    g.decks[10] = [takeFromDeck(g, nonRedTen.id), ...g.decks[10]];

    startDogma(g, cardByTitle('Fission').id, '0');
    // Target got the 10 in hand.
    expect(g.players['1'].hand).toContain(nonRedTen.id);
    expect(g.dogmaRun).toBeNull(); // dogma finished
  });

  it('demand: drawing a red 10 wipes hands/boards/scores', () => {
    const g = freshGame(2);
    giveClockAdvantage(g, '0');
    const redTen = ALL_CARDS.find((c) => c.age === 10 && c.color === 'red')!;
    g.decks[10] = [takeFromDeck(g, redTen.id), ...g.decks[10]];

    // Plant some state to be wiped.
    g.players['0'].hand = [takeFromDeck(g, cardByTitle('Agriculture').id)];
    g.players['1'].scorePile = [takeFromDeck(g, cardByTitle('Pottery').id)];

    startDogma(g, cardByTitle('Fission').id, '0');

    expect(g.players['0'].hand).toEqual([]);
    expect(g.players['1'].scorePile).toEqual([]);
    expect(g.players['0'].piles.red.cards).toEqual([]); // Fission gone too
  });

  it('level 1: activator picks a top card (not Fission) from any board to return', () => {
    const g = freshGame(2);
    // No clock advantage → level 0 demand finds no targets.
    // Plant a non-Fission top on activator's blue.
    const lib = takeFromDeck(g, cardByTitle('Writing').id);
    g.players['0'].piles.blue.cards = [lib];

    startDogma(g, cardByTitle('Fission').id, '0');
    expect(g.pendingChoice?.kind).toBe('select-score-card');
    expect(g.pendingChoice?.options).toContain(lib);
    resumeDogma(g, lib);
    expect(g.players['0'].piles.blue.cards).not.toContain(lib);
    expect(g.decks[cardById(lib).age].at(-1)).toBe(lib);
  });
});

describe('Genetics', () => {
  it('draws+melds a 10 and scores all cards beneath it', () => {
    const g = freshGame(1);
    // Seed two cards in some color pile that match the upcoming 10's color so
    // they end up "beneath" the meld.
    const ten = g.decks[10][0];
    const color = cardById(ten).color;
    const a = takeFromDeck(g, ALL_CARDS.find((c) => c.color === color && c.age <= 8)!.id);
    const b = takeFromDeck(g, ALL_CARDS.find(
      (c) => c.color === color && c.age <= 8 && c.id !== a,
    )!.id);
    g.players['0'].piles[color].cards = [a, b];

    startDogma(g, cardByTitle('Genetics').id, '0');
    expect(g.players['0'].piles[color].cards[0]).toBe(ten);
    expect(g.players['0'].piles[color].cards).toHaveLength(1);
    expect(g.players['0'].scorePile).toContain(a);
    expect(g.players['0'].scorePile).toContain(b);
  });
});

describe('Satellites', () => {
  it('level 0: returns all hand cards and draws three 8s', () => {
    const g = freshGame(1);
    const a = takeFromDeck(g, cardByTitle('Agriculture').id);
    const b = takeFromDeck(g, cardByTitle('Pottery').id);
    g.players['0'].hand = [a, b];
    // Push level-1/2 prompts out of the way: empty purple, empty hand after.
    // After level 0, hand has three 8s; level 1 needs ≥2 purple to splay
    // (none), so it'll no-op; level 2 will pause on meld.
    startDogma(g, cardByTitle('Satellites').id, '0');
    expect(g.decks[cardById(a).age].at(-1) === a || g.decks[cardById(a).age].includes(a)).toBe(true);
    // Hand now has three 8s (or up-walked) AND will be at a level-2 meld pause.
    expect(g.players['0'].hand.length).toBeGreaterThanOrEqual(3);
    expect(g.pendingChoice?.kind).toBe('select-hand-card');
  });

  it('level 1: yes splays purple up when ≥2 purple', () => {
    const g = freshGame(1);
    // Two purple cards.
    g.players['0'].piles.purple.cards = [
      takeFromDeck(g, cardByTitle('Code of Laws').id),
      takeFromDeck(g, cardByTitle('Mysticism').id),
    ];
    // Empty hand → level 0 quietly skips its returns; the three-draws still
    // happen but we don't care. Then level 1 pauses on yes/no.
    startDogma(g, cardByTitle('Satellites').id, '0');
    // Level 1 (yes/no) is the SECOND pause; first is level-2 meld? No — level
    // 0 ran without pause. Level 1 pauses for yes/no.
    expect(g.pendingChoice?.kind).toBe('yes-no');
    resumeDogma(g, true);
    expect(g.players['0'].piles.purple.splay).toBe('up');
  });
});

describe('Services (demand)', () => {
  it("transfers all target's tied-highest score cards to activator's hand; lets target take a non-leaf top", () => {
    const g = freshGame(2);
    giveLeafAdvantage(g, '0');
    // Target score: one age-3.
    const high = takeFromDeck(g, ALL_CARDS.find((c) => c.age === 3)!.id);
    g.players['1'].scorePile = [high];
    // Activator board: a non-leaf top.
    const nonLeaf = ALL_CARDS.find((c) => !c.icons.includes('leaf') && c.color === 'blue')!;
    const nlid = takeFromDeck(g, nonLeaf.id);
    g.players['0'].piles.blue.cards = [nlid];

    startDogma(g, cardByTitle('Services').id, '0');
    // After transfer: activator has 'high' in hand; pause for target to pick
    // a non-leaf top from activator's board.
    expect(g.players['0'].hand).toContain(high);
    expect(g.pendingChoice?.kind).toBe('select-score-card');
    expect(g.pendingChoice?.options).toContain(nlid);

    resumeDogma(g, nlid);
    expect(g.players['1'].hand).toContain(nlid);
    expect(g.players['0'].piles.blue.cards).not.toContain(nlid);
  });

  it('no-op when target score pile is empty', () => {
    const g = freshGame(2);
    giveLeafAdvantage(g, '0');
    const done = startDogma(g, cardByTitle('Services').id, '0');
    expect(done).toBe(true);
    expect(g.pendingChoice).toBeNull();
  });
});

describe('Specialization', () => {
  it("level 0: revealing a card pulls that color's top from every other player", () => {
    const g = freshGame(2);
    // Target (p0): a yellow card in hand to reveal.
    const yellowInHand = takeFromDeck(g, cardByTitle('Agriculture').id); // yellow
    g.players['0'].hand = [yellowInHand];
    // Opponent: a yellow on their board.
    const oppYellow = takeFromDeck(g, cardByTitle('Domestication').id); // yellow
    g.players['1'].piles.yellow.cards = [oppYellow];

    startDogma(g, cardByTitle('Specialization').id, '0');
    expect(g.pendingChoice?.kind).toBe('select-hand-card');
    resumeDogma(g, yellowInHand);
    // Target now holds the opponent's yellow top as well.
    expect(g.players['0'].hand).toContain(oppYellow);
    expect(g.players['1'].piles.yellow.cards).not.toContain(oppYellow);
  });

  it('level 1: optional splay yellow/blue up', () => {
    const g = freshGame(1);
    g.players['0'].piles.yellow.cards = [
      takeFromDeck(g, cardByTitle('Agriculture').id),
      takeFromDeck(g, cardByTitle('Domestication').id),
    ];
    // Empty hand → level 0 no-ops.
    startDogma(g, cardByTitle('Specialization').id, '0');
    expect(g.pendingChoice?.kind).toBe('select-board-color');
    expect(g.pendingChoice?.options).toEqual([COLORS.indexOf('yellow')]);
    resumeDogma(g, COLORS.indexOf('yellow'));
    expect(g.players['0'].piles.yellow.splay).toBe('up');
  });
});

describe('Suburbia', () => {
  it('tucks the chosen subset and draws+scores a 1 for each', () => {
    const g = freshGame(1);
    const a = takeFromDeck(g, cardByTitle('Agriculture').id);
    const b = takeFromDeck(g, cardByTitle('Pottery').id);
    g.players['0'].hand = [a, b];

    expect(startDogma(g, cardByTitle('Suburbia').id, '0')).toBe(false);
    expect(g.pendingChoice?.kind).toBe('select-hand-card-subset');
    resumeDogma(g, [a, b]);
    // Tucked to bottoms of their respective color piles.
    expect(g.players['0'].piles[cardById(a).color].cards.at(-1)).toBe(a);
    expect(g.players['0'].piles[cardById(b).color].cards.at(-1)).toBe(b);
    // Two 1s scored.
    expect(g.players['0'].scorePile.length).toBe(2);
  });

  it('declining (empty subset) is a no-op', () => {
    const g = freshGame(1);
    g.players['0'].hand = [takeFromDeck(g, cardByTitle('Agriculture').id)];
    startDogma(g, cardByTitle('Suburbia').id, '0');
    const done = resumeDogma(g, []);
    expect(done).toBe(true);
    expect(g.players['0'].hand).toHaveLength(1);
    expect(g.players['0'].scorePile).toHaveLength(0);
  });
});
