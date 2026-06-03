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

  it('demand does NOT trigger the shared-bonus draw', () => {
    const g = archeryGame(['Agriculture']);
    const handBefore = g.players['0'].hand.length;
    startDogma(g, cardByTitle('Archery').id, '0');
    resumeDogma(g, g.pendingChoice!.options[0]);
    // Activator gained exactly the transferred card — no extra share-bonus draw.
    expect(g.players['0'].hand.length).toBe(handBefore + 1);
  });
});

describe('City States (demand)', () => {
  // City States needs ≥4 castles on the target + a top card with castle.
  // Stack four Masonry on yellow (each: 3 castles, total 12 → easily ≥4) and
  // a top-castle card. Activator needs MORE crowns (featured) than target.
  function setup(): InnovationState {
    const g = freshGame(2);
    // Activator: City States itself on purple gives 2 crowns; that beats
    // a target with no crowns.
    g.players['0'].piles.purple.cards = [takeFromDeck(g, cardByTitle('City States').id)];
    // Target: 4 castle-bearing cards on yellow pile (top has castle).
    const castleCards = ['Masonry', 'Domestication', 'Metalworking', 'Mysticism']
      .map((t) => takeFromDeck(g, cardByTitle(t).id));
    g.players['1'].piles.yellow.cards = [castleCards[0]];
    g.players['1'].piles.red.cards = [castleCards[1]];
    // The other two on different colors so each is a top with castle.
    g.players['1'].piles.green.cards = [];
    return g;
  }

  it('pauses on the demanded player to pick a top-castle color', () => {
    const g = setup();
    const done = startDogma(g, cardByTitle('City States').id, '0');
    expect(done).toBe(false);
    expect(g.pendingChoice?.kind).toBe('select-board-color');
    expect(g.pendingChoice?.playerId).toBe('1');
  });

  it("on pick: top card moves to activator's matching pile, target draws a 1", () => {
    const g = setup();
    startDogma(g, cardByTitle('City States').id, '0');
    const colorIdx = g.pendingChoice!.options[0];
    const color = COLORS[colorIdx];
    const movedCard = g.players['1'].piles[color].cards[0];
    const targetHandBefore = g.players['1'].hand.length;
    resumeDogma(g, colorIdx);
    expect(g.players['0'].piles[color].cards[0]).toBe(movedCard);
    expect(g.players['1'].piles[color].cards.length).toBe(0);
    expect(g.players['1'].hand.length).toBe(targetHandBefore + 1); // draw a 1
  });

  it('skips target with fewer than 4 castles', () => {
    const g = freshGame(2);
    g.players['0'].piles.purple.cards = [takeFromDeck(g, cardByTitle('City States').id)];
    // Target: only 2 castles via one Masonry → below 4 threshold.
    g.players['1'].piles.yellow.cards = [takeFromDeck(g, cardByTitle('Masonry').id)];
    const done = startDogma(g, cardByTitle('City States').id, '0');
    expect(done).toBe(true);
    expect(g.pendingChoice).toBeNull();
  });
});

describe('Oars (demand + conditional share)', () => {
  // Activator: castle advantage. Target: a crown-bearing hand card.
  function setup(targetHandTitles: string[]): InnovationState {
    const g = freshGame(2);
    // Domestication on yellow → 2 castles vs target's 0.
    g.players['0'].piles.yellow.cards = [takeFromDeck(g, cardByTitle('Domestication').id)];
    g.players['1'].hand = targetHandTitles.map((t) => takeFromDeck(g, cardByTitle(t).id));
    return g;
  }

  it("transferred crown card lands in activator's score pile; target draws a 1", () => {
    // Sailing has a Crown icon.
    const g = setup(['Sailing']);
    startDogma(g, cardByTitle('Oars').id, '0');
    expect(g.pendingChoice?.kind).toBe('select-hand-card');
    const card = g.pendingChoice!.options[0];
    const targetHandBefore = g.players['1'].hand.length;
    resumeDogma(g, card);
    expect(g.players['0'].scorePile).toContain(card);
    expect(g.players['1'].hand).not.toContain(card);
    // Net: target lost 1, drew 1 → same size.
    expect(g.players['1'].hand.length).toBe(targetHandBefore);
  });

  it('level-1 draw fires for activator when nobody transferred (1p — no sharers)', () => {
    // 1 player → no demand targets at level 0, no sharers at level 1 either.
    // Activator-only at level 1: demandSuccessful=false → draw a 1. Exactly one
    // card lands in hand, no shared-bonus draw piling on.
    const g = freshGame(1);
    const activatorHandBefore = g.players['0'].hand.length;
    startDogma(g, cardByTitle('Oars').id, '0');
    expect(g.players['0'].hand.length).toBe(activatorHandBefore + 1);
  });

  it('level-1 draw is skipped when the demand fired', () => {
    const g = setup(['Sailing']);
    const activatorHandBefore = g.players['0'].hand.length;
    startDogma(g, cardByTitle('Oars').id, '0');
    resumeDogma(g, g.pendingChoice!.options[0]);
    // Activator gained the transferred Sailing in their SCORE pile, not hand.
    // No level-1 draw → hand unchanged.
    expect(g.players['0'].hand.length).toBe(activatorHandBefore);
  });
});

describe('Metalworking', () => {
  it('keeps drawing castle-bearing 1s into the score pile until a non-castle 1', () => {
    const g = freshGame();
    // Empty age-1 deck and re-seed in known order: 2 castle-bearing then a
    // non-castle stops the loop. Masonry, Domestication (castle), Agriculture (no castle).
    g.decks[1] = [
      cardByTitle('Masonry').id,
      cardByTitle('Domestication').id,
      cardByTitle('Agriculture').id,
    ];
    startDogma(g, cardByTitle('Metalworking').id, '0');
    expect(g.players['0'].scorePile).toEqual([
      cardByTitle('Masonry').id, cardByTitle('Domestication').id,
    ]);
    expect(g.players['0'].hand).toEqual([cardByTitle('Agriculture').id]);
  });
});

describe('Mysticism', () => {
  it('match-color draw melds and triggers a second draw', () => {
    const g = freshGame();
    // Plant a yellow card on the board so the drawn yellow card melds.
    g.players['0'].piles.yellow.cards = [takeFromDeck(g, cardByTitle('Domestication').id)];
    // Force first draw to be a yellow age-1 (Agriculture).
    g.decks[1] = [takeFromDeck(g, cardByTitle('Agriculture').id), ...g.decks[1]];
    const secondExpected = g.decks[1][1];
    startDogma(g, cardByTitle('Mysticism').id, '0');
    // Agriculture melded on yellow (now top); second draw landed in hand.
    expect(g.players['0'].piles.yellow.cards[0]).toBe(cardByTitle('Agriculture').id);
    expect(g.players['0'].hand).toContain(secondExpected);
  });

  it('non-match draw stays in hand, no second draw', () => {
    const g = freshGame();
    // Empty board → no color matches → drawn card stays in hand.
    const drewExpected = g.decks[1][0];
    startDogma(g, cardByTitle('Mysticism').id, '0');
    expect(g.players['0'].hand).toContain(drewExpected);
    // Exactly one draw — second deck index should still be there.
    expect(g.players['0'].hand.length).toBe(1);
  });
});

describe('Clothing', () => {
  it('level 0: pauses on a meld pick of a different-color hand card', () => {
    const g = freshGame();
    // Hand: a yellow card; board: empty → eligible (color pile yellow empty).
    g.players['0'].hand = [takeFromDeck(g, cardByTitle('Agriculture').id)];
    const done = startDogma(g, cardByTitle('Clothing').id, '0');
    expect(done).toBe(false);
    expect(g.pendingChoice?.kind).toBe('select-hand-card');
    expect(g.pendingChoice?.optional).toBe(false);
  });

  it('level 1: scores one 1 per color unique to this player', () => {
    const g = freshGame(2);
    // Target (p0) has yellow and red; opponent (p1) has red.
    // → Yellow is unique to p0 → one draw+score. Red shared → no score.
    g.players['0'].piles.yellow.cards = [takeFromDeck(g, cardByTitle('Agriculture').id)];
    g.players['0'].piles.red.cards = [takeFromDeck(g, cardByTitle('Archery').id)];
    g.players['1'].piles.red.cards = [takeFromDeck(g, cardByTitle('Metalworking').id)];
    // Force p0's hand to have no Clothing-eligible meld (red & yellow piles
    // non-empty → no different-color picks needed). Level 0 will no-op.
    g.players['0'].hand = []; // no level-0 work
    const scoreBefore = g.players['0'].scorePile.length;
    startDogma(g, cardByTitle('Clothing').id, '0');
    expect(g.players['0'].scorePile.length).toBe(scoreBefore + 1);
  });
});

describe('Code of Laws', () => {
  it('tuck + splay-left flow: two pauses, then splays the tucked color', () => {
    const g = freshGame();
    // Board: two yellow cards so splay-left has effect.
    g.players['0'].piles.yellow.cards = [
      takeFromDeck(g, cardByTitle('Agriculture').id),
      takeFromDeck(g, cardByTitle('Domestication').id),
    ];
    // Hand: a yellow card to tuck.
    g.players['0'].hand = [takeFromDeck(g, cardByTitle('Masonry').id)];
    const tuckCard = g.players['0'].hand[0];

    // Pause 1: tuck pick.
    expect(startDogma(g, cardByTitle('Code of Laws').id, '0')).toBe(false);
    expect(g.pendingChoice?.kind).toBe('select-hand-card');
    expect(g.pendingChoice?.optional).toBe(true);

    // Pick: tuck the card. Pause 2: yes/no splay.
    expect(resumeDogma(g, tuckCard)).toBe(false);
    expect(g.pendingChoice?.kind).toBe('yes-no');

    // Yes → splay left.
    expect(resumeDogma(g, true)).toBe(true);
    expect(g.players['0'].piles.yellow.splay).toBe('left');
    // Tucked card is at the BOTTOM.
    expect(g.players['0'].piles.yellow.cards.at(-1)).toBe(tuckCard);
  });

  it('declining the tuck is a no-op', () => {
    const g = freshGame();
    g.players['0'].piles.yellow.cards = [takeFromDeck(g, cardByTitle('Agriculture').id)];
    g.players['0'].hand = [takeFromDeck(g, cardByTitle('Masonry').id)];
    startDogma(g, cardByTitle('Code of Laws').id, '0');
    const done = resumeDogma(g, null);
    expect(done).toBe(true);
    expect(g.players['0'].hand).toHaveLength(1); // not tucked
  });
});

describe('Masonry', () => {
  it('melding two castle-bearing cards puts them onto their color piles', () => {
    const g = freshGame();
    const a = takeFromDeck(g, cardByTitle('Domestication').id); // yellow, castle
    const b = takeFromDeck(g, cardByTitle('Archery').id);       // red, castle
    g.players['0'].hand = [a, b, takeFromDeck(g, cardByTitle('Agriculture').id)];
    startDogma(g, cardByTitle('Masonry').id, '0');
    // Only castle-bearing cards are eligible → 2 options.
    expect(g.pendingChoice?.options.length).toBe(2);
    const done = resumeDogma(g, [a, b]);
    expect(done).toBe(true);
    expect(g.players['0'].piles.yellow.cards).toContain(a);
    expect(g.players['0'].piles.red.cards).toContain(b);
  });

  it('declining (empty subset) is a no-op', () => {
    const g = freshGame();
    g.players['0'].hand = [takeFromDeck(g, cardByTitle('Domestication').id)];
    startDogma(g, cardByTitle('Masonry').id, '0');
    const done = resumeDogma(g, []);
    expect(done).toBe(true);
    expect(g.players['0'].hand).toHaveLength(1); // untouched
  });
});

describe('Tools', () => {
  it('level 0: return-three, draw-and-meld a 3', () => {
    const g = freshGame();
    const hand = [
      takeFromDeck(g, cardByTitle('Agriculture').id),
      takeFromDeck(g, cardByTitle('Domestication').id),
      takeFromDeck(g, cardByTitle('Masonry').id),
    ];
    g.players['0'].hand = [...hand];
    const meldExpected = g.decks[3][0];
    const meldColor = cardById(meldExpected).color;
    startDogma(g, cardByTitle('Tools').id, '0');
    expect(g.pendingChoice?.minCount).toBe(3);
    expect(g.pendingChoice?.maxCount).toBe(3);
    resumeDogma(g, hand);
    expect(g.players['0'].piles[meldColor].cards[0]).toBe(meldExpected);
    for (const id of hand) expect(g.players['0'].hand).not.toContain(id);
  });

  it('declining level 0 (null) skips and level 1 still runs', () => {
    const g = freshGame();
    // Three age-1 in hand for level-0 pause; one age-3 for level-1 pause.
    const age3 = takeFromDeck(g, ALL_CARDS.find((c) => c.age === 3)!.id);
    g.players['0'].hand = [
      takeFromDeck(g, cardByTitle('Agriculture').id),
      takeFromDeck(g, cardByTitle('Domestication').id),
      takeFromDeck(g, cardByTitle('Masonry').id),
      age3,
    ];
    expect(startDogma(g, cardByTitle('Tools').id, '0')).toBe(false);
    // Decline level 0.
    expect(resumeDogma(g, null)).toBe(false);
    // Level 1 should now be paused for the age-3 return choice.
    expect(g.pendingChoice?.kind).toBe('select-hand-card');
    expect(g.pendingChoice?.options).toContain(age3);
    // Decline level 1 too.
    expect(resumeDogma(g, null)).toBe(true);
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
