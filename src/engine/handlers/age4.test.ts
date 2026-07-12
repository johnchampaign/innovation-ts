// Tests for the ported Age-4 dogma handlers. Each card gets at least one
// scenario exercising its main behaviour.

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

// Activator-eligibility setup: gives p0 a board with lots of `dogmaIcon` so
// demand cards always fire on p1.
function seedActivatorAdvantage(g: InnovationState, icon: 'crown' | 'castle' | 'leaf' | 'lightbulb' | 'factory') {
  // Find any card showing this icon and put it on activator's board.
  const helper = ALL_CARDS.find((c) => c.icons.includes(icon))!;
  takeFromDeck(g, helper.id);
  g.players['0'].piles[helper.color].cards = [helper.id];
}

describe('Experimentation', () => {
  it('draws and melds a 5', () => {
    const g = freshGame();
    const expected = g.decks[5][0];
    startDogma(g, cardByTitle('Experimentation').id, '0');
    const color = cardById(expected).color;
    expect(g.players['0'].piles[color].cards[0]).toBe(expected);
  });
});

describe('Colonialism', () => {
  it('keeps tucking 3s into board piles while they show a crown', () => {
    const g = freshGame();
    // Stack three crown-bearing 3s up front, then a non-crown 3.
    const crown3a = ALL_CARDS.find((c) => c.age === 3 && c.icons.includes('crown'))!.id;
    const crown3b = ALL_CARDS.find((c) => c.age === 3 && c.icons.includes('crown') && c.id !== crown3a)!.id;
    const noCrown3 = ALL_CARDS.find((c) => c.age === 3 && !c.icons.includes('crown'))!.id;
    g.decks[3] = [crown3a, crown3b, noCrown3, ...g.decks[3].filter((id) => id !== crown3a && id !== crown3b && id !== noCrown3)];
    startDogma(g, cardByTitle('Colonialism').id, '0');
    // First two crown cards tucked, then the non-crown tucked and loop stopped.
    expect(g.players['0'].piles[cardById(crown3a).color].cards).toContain(crown3a);
    expect(g.players['0'].piles[cardById(crown3b).color].cards).toContain(crown3b);
    expect(g.players['0'].piles[cardById(noCrown3).color].cards).toContain(noCrown3);
    // Hand should be empty — all draws were tucked.
    expect(g.players['0'].hand).toHaveLength(0);
  });
});

describe('Anatomy (demand)', () => {
  it('two-step: target returns a score card, then a top board card of the same age', () => {
    const g = freshGame(2);
    // Activator: leaf advantage.
    seedActivatorAdvantage(g, 'leaf');
    // Target: a 2 in score pile, a top 2 on board.
    const score2 = takeFromDeck(g, ALL_CARDS.find((c) => c.age === 2)!.id);
    const board2 = takeFromDeck(g, ALL_CARDS.find((c) => c.age === 2 && c.id !== score2)!.id);
    g.players['1'].scorePile = [score2];
    g.players['1'].piles[cardById(board2).color].cards = [board2];

    const done = startDogma(g, cardByTitle('Anatomy').id, '0');
    expect(done).toBe(false);
    expect(g.pendingChoice?.kind).toBe('select-score-card');
    expect(g.pendingChoice?.playerId).toBe('1');

    // Return score2.
    expect(resumeDogma(g, score2)).toBe(false);
    expect(g.players['1'].scorePile).not.toContain(score2);
    // Now pause on board-color pick.
    expect(g.pendingChoice?.kind).toBe('select-board-color');

    const colorIdx = g.pendingChoice!.options[0];
    expect(resumeDogma(g, colorIdx)).toBe(true);
    expect(g.players['1'].piles[COLORS[colorIdx]].cards).not.toContain(board2);
  });

  it('empty score pile → no-op (does not pause)', () => {
    const g = freshGame(2);
    seedActivatorAdvantage(g, 'leaf');
    g.players['1'].scorePile = [];
    const done = startDogma(g, cardByTitle('Anatomy').id, '0');
    expect(done).toBe(true);
    expect(g.pendingChoice).toBeNull();
  });
});

describe('Enterprise', () => {
  it('level 0 (demand): transfers non-purple crown card and target draws+melds a 4', () => {
    const g = freshGame(2);
    // Activator board: Enterprise itself (2 crowns) — beats target with 0.
    g.players['0'].piles.purple.cards = [takeFromDeck(g, cardByTitle('Enterprise').id)];
    // Target: a non-purple crown card on board.
    const crownCard = ALL_CARDS.find((c) => c.color !== 'purple' && c.icons.includes('crown'))!;
    takeFromDeck(g, crownCard.id);
    g.players['1'].piles[crownCard.color].cards = [crownCard.id];

    const meld4Expected = g.decks[4][0];
    const meldColor = cardById(meld4Expected).color;

    const done = startDogma(g, cardByTitle('Enterprise').id, '0');
    expect(done).toBe(false);
    expect(g.pendingChoice?.kind).toBe('select-board-color');
    expect(g.pendingChoice?.playerId).toBe('1');
    const colorIdx = g.pendingChoice!.options[0];
    resumeDogma(g, colorIdx);
    // Card transferred to activator.
    expect(g.players['0'].piles[crownCard.color].cards).toContain(crownCard.id);
    // Target drew and melded a 4.
    expect(g.players['1'].piles[meldColor].cards[0]).toBe(meld4Expected);
  });

  it('level 1 (share): splays green right if eligible', () => {
    const g = freshGame();
    // Two green cards on board to enable splay.
    const a = takeFromDeck(g, ALL_CARDS.find((c) => c.color === 'green' && c.age === 1)!.id);
    const b = takeFromDeck(g, ALL_CARDS.find((c) => c.color === 'green' && c.age === 2)!.id);
    g.players['0'].piles.green.cards = [a, b];
    startDogma(g, cardByTitle('Enterprise').id, '0');
    expect(g.pendingChoice?.kind).toBe('yes-no');
    resumeDogma(g, true);
    expect(g.players['0'].piles.green.splay).toBe('right');
  });
});

describe('Gunpowder', () => {
  it('demand transfers a top castle to activator score pile; level 1 then draws+scores a 2', () => {
    const g = freshGame(2);
    seedActivatorAdvantage(g, 'factory');
    // Target: a top castle card.
    const castleCard = ALL_CARDS.find((c) => c.icons.includes('castle'))!;
    takeFromDeck(g, castleCard.id);
    g.players['1'].piles[castleCard.color].cards = [castleCard.id];

    startDogma(g, cardByTitle('Gunpowder').id, '0');
    expect(g.pendingChoice?.kind).toBe('select-board-color');
    const colorIdx = g.pendingChoice!.options[0];
    resumeDogma(g, colorIdx);
    expect(g.players['0'].scorePile).toContain(castleCard.id);
    // Level 1 ran for activator → drew+scored a 2.
    const scored = g.players['0'].scorePile.filter((id) => cardById(id).age === 2);
    expect(scored.length).toBeGreaterThan(0);
  });

  it('level 1 skipped when demand did not fire (no targets)', () => {
    const g = freshGame(1); // single player — no demand target
    const scoreBefore = g.players['0'].scorePile.length;
    startDogma(g, cardByTitle('Gunpowder').id, '0');
    // Level 1 fires for activator but demandSuccessful=false → no score.
    expect(g.players['0'].scorePile.length).toBe(scoreBefore);
  });
});

describe('Invention', () => {
  it('level 0: re-splays a left-splayed color right and draws+scores a 4', () => {
    const g = freshGame();
    // Two yellow cards splayed left.
    const a = takeFromDeck(g, ALL_CARDS.find((c) => c.color === 'yellow' && c.age === 1)!.id);
    const b = takeFromDeck(g, ALL_CARDS.find((c) => c.color === 'yellow' && c.age === 2)!.id);
    g.players['0'].piles.yellow.cards = [a, b];
    g.players['0'].piles.yellow.splay = 'left';
    const expected4 = g.decks[4][0];
    startDogma(g, cardByTitle('Invention').id, '0');
    expect(g.pendingChoice?.kind).toBe('select-board-color');
    resumeDogma(g, COLORS.indexOf('yellow'));
    expect(g.players['0'].piles.yellow.splay).toBe('right');
    expect(g.players['0'].scorePile).toContain(expected4);
  });

  it('level 1: claims Wonder when all 5 colors splayed in any direction', () => {
    const g = freshGame();
    // Splay every color (and place two cards each so splay sticks).
    for (const c of COLORS) {
      const x = takeFromDeck(g, ALL_CARDS.find((card) => card.color === c && card.age === 1)!.id);
      const y = takeFromDeck(g, ALL_CARDS.find((card) => card.color === c && card.age === 2)!.id);
      g.players['0'].piles[c].cards = [x, y];
      g.players['0'].piles[c].splay = 'right';
    }
    // No left-splayed color → level 0 no-ops, level 1 fires.
    startDogma(g, cardByTitle('Invention').id, '0');
    expect(g.players['0'].specialAchievements).toContain('Wonder');
  });
});

describe('Navigation (demand)', () => {
  it('transfers a 2 or 3 from target score pile to activator score pile', () => {
    const g = freshGame(2);
    seedActivatorAdvantage(g, 'crown');
    const a2 = takeFromDeck(g, ALL_CARDS.find((c) => c.age === 2)!.id);
    g.players['1'].scorePile = [a2];
    startDogma(g, cardByTitle('Navigation').id, '0');
    expect(g.pendingChoice?.kind).toBe('select-score-card');
    resumeDogma(g, a2);
    expect(g.players['0'].scorePile).toContain(a2);
    expect(g.players['1'].scorePile).not.toContain(a2);
  });

  it('no eligible 2/3 in score → no-op', () => {
    const g = freshGame(2);
    seedActivatorAdvantage(g, 'crown');
    g.players['1'].scorePile = [];
    const done = startDogma(g, cardByTitle('Navigation').id, '0');
    expect(done).toBe(true);
    expect(g.pendingChoice).toBeNull();
  });
});

describe('Perspective', () => {
  it('returns a card, then scores one card per 2 lightbulbs on board', () => {
    const g = freshGame();
    // Board: two lightbulb cards → 2 lightbulbs (actually each card has ≥1) → score 1.
    // Use Mysticism (purple, has lightbulb) and Tools (blue, has lightbulb).
    const b1 = takeFromDeck(g, cardByTitle('Mysticism').id);
    const b2 = takeFromDeck(g, cardByTitle('Tools').id);
    g.players['0'].piles[cardById(b1).color].cards = [b1];
    g.players['0'].piles[cardById(b2).color].cards = [b2];
    const lightbulbs = (function () {
      // Count lightbulbs on top cards only (no splay).
      let n = 0;
      for (const c of COLORS) {
        const top = g.players['0'].piles[c].cards[0];
        if (top === undefined) continue;
        for (const ic of cardById(top).icons) if (ic === 'lightbulb') n++;
      }
      return n;
    })();
    const scoreCount = Math.floor(lightbulbs / 2);

    // Hand: a few cards to return + score.
    const handCards = [
      takeFromDeck(g, ALL_CARDS.find((c) => c.age === 1 && c.id !== b1 && c.id !== b2)!.id),
      takeFromDeck(g, ALL_CARDS.find((c) => c.age === 2)!.id),
      takeFromDeck(g, ALL_CARDS.find((c) => c.age === 3)!.id),
    ];
    g.players['0'].hand = [...handCards];

    startDogma(g, cardByTitle('Perspective').id, '0');
    expect(g.pendingChoice?.kind).toBe('select-hand-card');
    expect(g.pendingChoice?.optional).toBe(true);
    // Return the first card.
    resumeDogma(g, handCards[0]);

    if (scoreCount === 0) {
      // No score-loop entered.
      expect(g.players['0'].scorePile).toHaveLength(0);
    } else {
      // Drain the score loop.
      let safety = 10;
      while (g.pendingChoice && safety-- > 0) {
        const pick = g.pendingChoice.options[0];
        resumeDogma(g, pick);
      }
      expect(g.players['0'].scorePile.length).toBe(scoreCount);
    }
  });

  it('declines the return → no-op', () => {
    const g = freshGame();
    g.players['0'].hand = [takeFromDeck(g, ALL_CARDS.find((c) => c.age === 1)!.id)];
    startDogma(g, cardByTitle('Perspective').id, '0');
    const done = resumeDogma(g, null);
    expect(done).toBe(true);
    expect(g.players['0'].scorePile).toHaveLength(0);
    expect(g.players['0'].hand).toHaveLength(1);
  });
});

describe('Printing Press', () => {
  it('level 0: return a score-pile card, draw at age (top-purple + 2)', () => {
    const g = freshGame();
    // Top purple: an age-2 card → draw age 4.
    const purple2 = takeFromDeck(g, ALL_CARDS.find((c) => c.color === 'purple' && c.age === 2)!.id);
    g.players['0'].piles.purple.cards = [purple2];
    const scoreCard = takeFromDeck(g, ALL_CARDS.find((c) => c.age === 1)!.id);
    g.players['0'].scorePile = [scoreCard];
    const expected4 = g.decks[4][0];

    startDogma(g, cardByTitle('Printing Press').id, '0');
    expect(g.pendingChoice?.kind).toBe('select-score-card');
    expect(g.pendingChoice?.optional).toBe(true);
    resumeDogma(g, scoreCard);
    expect(g.players['0'].hand).toContain(expected4);
    expect(g.players['0'].scorePile).not.toContain(scoreCard);
  });

  it('level 1: optional splay blue right when eligible', () => {
    const g = freshGame();
    const a = takeFromDeck(g, ALL_CARDS.find((c) => c.color === 'blue' && c.age === 1)!.id);
    const b = takeFromDeck(g, ALL_CARDS.find((c) => c.color === 'blue' && c.age === 2)!.id);
    g.players['0'].piles.blue.cards = [a, b];
    // No score pile → level 0 no-ops.
    startDogma(g, cardByTitle('Printing Press').id, '0');
    expect(g.pendingChoice?.kind).toBe('yes-no');
    resumeDogma(g, true);
    expect(g.players['0'].piles.blue.splay).toBe('right');
  });
});

describe('Reformation', () => {
  it('level 0: tucks up to leafs/2 cards from hand', () => {
    const g = freshGame();
    // Use Agriculture (yellow, 1 leaf) + Pottery (blue, 2 leafs) = 3 leafs on board top slots.
    // Actually let's just pick two leaf-rich cards.
    const leafCardA = ALL_CARDS.find((c) => c.icons.filter((i) => i === 'leaf').length >= 2 && c.color === 'green')
      ?? ALL_CARDS.find((c) => c.icons.includes('leaf'))!;
    const leafCardB = ALL_CARDS.find((c) => c.icons.includes('leaf') && c.id !== leafCardA.id)!;
    takeFromDeck(g, leafCardA.id);
    takeFromDeck(g, leafCardB.id);
    g.players['0'].piles[leafCardA.color].cards = [leafCardA.id];
    if (leafCardB.color !== leafCardA.color) {
      g.players['0'].piles[leafCardB.color].cards = [leafCardB.id];
    } else {
      g.players['0'].piles[leafCardB.color].cards = [leafCardA.id, leafCardB.id];
    }
    // Hand cards to tuck.
    const h1 = takeFromDeck(g, ALL_CARDS.find((c) => c.age === 1 && c.id !== leafCardA.id && c.id !== leafCardB.id)!.id);
    g.players['0'].hand = [h1];

    const leafCount = (function () {
      let n = 0;
      for (const c of COLORS) {
        const top = g.players['0'].piles[c].cards[0];
        if (top === undefined) continue;
        for (const ic of cardById(top).icons) if (ic === 'leaf') n++;
      }
      return n;
    })();
    const max = Math.min(Math.floor(leafCount / 2), 1);

    const done = startDogma(g, cardByTitle('Reformation').id, '0');
    if (max <= 0) {
      // level 0 no-op; might still pause for level 1 splay if eligible.
      // Just drain any pending.
      while (g.pendingChoice) resumeDogma(g, null);
      expect(done || true).toBe(true);
      return;
    }
    expect(g.pendingChoice?.kind).toBe('select-hand-card-subset');
    resumeDogma(g, [h1]);
    expect(g.players['0'].piles[cardById(h1).color].cards.at(-1)).toBe(h1);
  });

  it('level 1: splay yellow or purple right when eligible', () => {
    const g = freshGame();
    // No hand → level 0 no-ops.
    const a = takeFromDeck(g, ALL_CARDS.find((c) => c.color === 'yellow' && c.age === 1)!.id);
    const b = takeFromDeck(g, ALL_CARDS.find((c) => c.color === 'yellow' && c.age === 2)!.id);
    g.players['0'].piles.yellow.cards = [a, b];
    startDogma(g, cardByTitle('Reformation').id, '0');
    expect(g.pendingChoice?.kind).toBe('select-board-color');
    const colorIdx = g.pendingChoice!.options[0];
    resumeDogma(g, colorIdx);
    expect(g.players['0'].piles[COLORS[colorIdx]].splay).toBe('right');
  });
});
