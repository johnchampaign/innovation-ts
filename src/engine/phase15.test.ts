// Phase 1.5 driver/primitive tests — exercise the infrastructure that the
// upcoming Age 2-10 fan-out will rely on. Each test stands alone via
// overrideDogmaForTest, since none of the cards that need these features are
// ported yet.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '../engine/handlers';
import { startDogma, resumeDogma, executeSelfOnly } from './dogma';
import { overrideDogmaForTest } from './registry';
import type { DogmaHandler } from './registry';
import { ALL_CARDS, cardByTitle } from '../card-data';
import {
  claimSpecialAchievement, hasIcon, meldFromScore, purgeValueFromAllScorePiles,
  reorderPile, returnFromBoard, returnFromScore, scoreFromBoard,
  transferBoardToScore, transferHandToBoard, transferScoreToHand,
  transferScoreToScore, transferTopCardToHand, winSolo,
} from './mechanics';
import type { InnovationState, PlayerData } from './types';
import { COLORS } from './types';

function newPlayer(): PlayerData {
  const piles = {} as PlayerData['piles'];
  for (const c of COLORS) piles[c] = { cards: [], splay: 'none' };
  return {
    hand: [], scorePile: [], piles,
    ageAchievements: [], specialAchievements: [],
    scoredThisTurn: 0, tuckedThisTurn: 0,
  };
}

function freshGame(numPlayers = 2): InnovationState {
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

function takeFromDeck(g: InnovationState, cardId: number): number {
  const age = ALL_CARDS.find((c) => c.id === cardId)!.age;
  const i = g.decks[age].indexOf(cardId);
  if (i >= 0) g.decks[age].splice(i, 1);
  return cardId;
}

let restoreFns: (() => void)[] = [];
beforeEach(() => { restoreFns = []; });
afterEach(() => { for (const r of restoreFns) r(); });
function patchHandler(title: string, h: DogmaHandler): void {
  restoreFns.push(overrideDogmaForTest(title, h));
}

// ============================================================================
// Mechanics primitives — focused unit tests, no driver involvement.
// ============================================================================

describe('hasIcon', () => {
  it('detects icons in any corner slot', () => {
    // Agriculture: [none, leaf, leaf, leaf]
    expect(hasIcon(cardByTitle('Agriculture').id, 'leaf')).toBe(true);
    expect(hasIcon(cardByTitle('Agriculture').id, 'castle')).toBe(false);
  });
});

describe('returnFromScore', () => {
  it('moves a score-pile card to the bottom of its age deck', () => {
    const g = freshGame(1);
    const c = takeFromDeck(g, cardByTitle('Agriculture').id);
    g.players['0'].scorePile = [c];
    returnFromScore(g, '0', c);
    expect(g.players['0'].scorePile).not.toContain(c);
    expect(g.decks[1].at(-1)).toBe(c);
  });
});

describe('transferScoreToScore / transferScoreToHand', () => {
  it('score→score moves the card between players\' score piles', () => {
    const g = freshGame(2);
    const c = takeFromDeck(g, cardByTitle('Agriculture').id);
    g.players['1'].scorePile = [c];
    transferScoreToScore(g, '1', '0', c);
    expect(g.players['0'].scorePile).toContain(c);
    expect(g.players['1'].scorePile).not.toContain(c);
  });

  it('score→hand stays within one player', () => {
    const g = freshGame(1);
    const c = takeFromDeck(g, cardByTitle('Agriculture').id);
    g.players['0'].scorePile = [c];
    transferScoreToHand(g, '0', c);
    expect(g.players['0'].hand).toContain(c);
    expect(g.players['0'].scorePile).not.toContain(c);
  });
});

describe('transferBoardToScore / transferHandToBoard / transferTopCardToHand', () => {
  it('board→score moves the pile\'s top card to recipient\'s score pile', () => {
    const g = freshGame(2);
    const c = takeFromDeck(g, cardByTitle('Agriculture').id);
    g.players['1'].piles.yellow.cards = [c];
    const moved = transferBoardToScore(g, '1', '0', 'yellow');
    expect(moved).toBe(c);
    expect(g.players['0'].scorePile).toContain(c);
    expect(g.players['1'].piles.yellow.cards.length).toBe(0);
  });

  it('hand→board melds the hand card on the recipient\'s pile (top)', () => {
    const g = freshGame(2);
    const c = takeFromDeck(g, cardByTitle('Agriculture').id);
    g.players['1'].hand = [c];
    transferHandToBoard(g, '1', '0', c);
    expect(g.players['0'].piles.yellow.cards[0]).toBe(c);
    expect(g.players['1'].hand).not.toContain(c);
  });

  it('top-card→hand moves the pile\'s top to recipient\'s hand', () => {
    const g = freshGame(2);
    const c = takeFromDeck(g, cardByTitle('Agriculture').id);
    g.players['1'].piles.yellow.cards = [c];
    const moved = transferTopCardToHand(g, '1', '0', 'yellow');
    expect(moved).toBe(c);
    expect(g.players['0'].hand).toContain(c);
  });
});

describe('scoreFromBoard / returnFromBoard', () => {
  it('scoreFromBoard pulls a covered card to the score pile and unsplay if <2 left', () => {
    const g = freshGame(1);
    const top = takeFromDeck(g, cardByTitle('Agriculture').id);
    const cov = takeFromDeck(g, cardByTitle('Pottery').id);
    g.players['0'].piles.yellow.cards = [top, cov];
    g.players['0'].piles.yellow.splay = 'left';
    scoreFromBoard(g, '0', 'yellow', cov);
    expect(g.players['0'].piles.yellow.cards).toEqual([top]);
    expect(g.players['0'].piles.yellow.splay).toBe('none'); // dropped below 2
    expect(g.players['0'].scorePile).toContain(cov);
    expect(g.players['0'].scoredThisTurn).toBe(1);
  });

  it('returnFromBoard returns a covered card to its age deck', () => {
    const g = freshGame(1);
    const top = takeFromDeck(g, cardByTitle('Agriculture').id);
    const cov = takeFromDeck(g, cardByTitle('Pottery').id);
    g.players['0'].piles.yellow.cards = [top, cov];
    returnFromBoard(g, '0', 'yellow', cov);
    expect(g.decks[1].at(-1)).toBe(cov);
    expect(g.players['0'].piles.yellow.cards).toEqual([top]);
  });
});

describe('meldFromScore', () => {
  it('moves a score-pile card to the top of its color pile', () => {
    const g = freshGame(1);
    const c = takeFromDeck(g, cardByTitle('Agriculture').id);
    g.players['0'].scorePile = [c];
    meldFromScore(g, '0', c);
    expect(g.players['0'].scorePile).not.toContain(c);
    expect(g.players['0'].piles.yellow.cards[0]).toBe(c);
  });
});

describe('reorderPile', () => {
  it('reorders the pile to the given top-first permutation', () => {
    const g = freshGame(1);
    const a = takeFromDeck(g, cardByTitle('Agriculture').id);
    const b = takeFromDeck(g, cardByTitle('Pottery').id);
    g.players['0'].piles.yellow.cards = [a, b];
    reorderPile(g, '0', 'yellow', [b, a]);
    expect(g.players['0'].piles.yellow.cards).toEqual([b, a]);
  });
});

describe('purgeValueFromAllScorePiles', () => {
  it('returns every score-pile card of the target age from every player', () => {
    const g = freshGame(2);
    const a = takeFromDeck(g, cardByTitle('Agriculture').id);
    const b = takeFromDeck(g, cardByTitle('Pottery').id);
    g.players['0'].scorePile = [a];
    g.players['1'].scorePile = [b];
    purgeValueFromAllScorePiles(g, 1);
    expect(g.players['0'].scorePile).not.toContain(a);
    expect(g.players['1'].scorePile).not.toContain(b);
    expect(g.decks[1].at(-2)).toBe(a);
    expect(g.decks[1].at(-1)).toBe(b);
  });
});

describe('claimSpecialAchievement', () => {
  it('moves the tile from supply to player', () => {
    const g = freshGame(1);
    expect(claimSpecialAchievement(g, '0', 'Monument')).toBe(true);
    expect(g.players['0'].specialAchievements).toContain('Monument');
    expect(g.availableSpecialAchievements).not.toContain('Monument');
  });

  it('returns false if already claimed', () => {
    const g = freshGame(1);
    claimSpecialAchievement(g, '0', 'Monument');
    expect(claimSpecialAchievement(g, '0', 'Monument')).toBe(false);
  });
});

// ============================================================================
// Solo-win endgame hook.
// ============================================================================

describe('winSolo + endIf', () => {
  it('a handler that calls winSolo sets winnerOverride; driver ends the dogma', () => {
    const g = freshGame(2);
    // winSolo on the activator specifically (not whichever target ran). The
    // first target Agriculture hits is the sharer (P1), so address by
    // activatingPlayerId — same pattern Empiricism/Collaboration etc. use.
    patchHandler('Agriculture', ((gg: InnovationState) => {
      winSolo(gg, gg.dogmaRun!.activatingPlayerId, 'test-condition');
      return true;
    }) as DogmaHandler);
    const done = startDogma(g, cardByTitle('Agriculture').id, '0');
    expect(done).toBe(true);
    expect(g.winnerOverride).toEqual({ winners: ['0'], reason: 'test-condition' });
    expect(g.dogmaRun).toBeNull();
  });
});

// ============================================================================
// Nested execute-for-self frames.
// ============================================================================

describe('nested executeSelfOnly frames', () => {
  it('runs a queued frame against the specified target after the main handler returns', () => {
    const g = freshGame(2);
    setLeafCount(g, '0', 3); // activator
    setLeafCount(g, '1', 0); // not a sharer

    const nestedCalls: string[] = [];
    // The card whose nested invocation we'll queue. Use Writing (single
    // effect, lightbulb-featured) — overriding its handler so we know what
    // runs in the nested frame.
    patchHandler('Writing', ((_g: InnovationState, target: string) => {
      nestedCalls.push(target);
      return true;
    }) as DogmaHandler);

    // The "host" card whose handler pushes the nested frame.
    patchHandler('Agriculture', ((gg: InnovationState, _target: string) => {
      executeSelfOnly(gg, cardByTitle('Writing').id, '1'); // queue nested for player 1
      return true;
    }) as DogmaHandler);

    startDogma(g, cardByTitle('Agriculture').id, '0');
    // Nested Writing ran against player 1 exactly once, even though player 1
    // wasn't a top-level target.
    expect(nestedCalls).toEqual(['1']);
  });

  it('nested handler can pause; resume routes the response to the nested frame', () => {
    const g = freshGame(1);

    // Nested Writing pauses on first call, completes on resume.
    let nestedStep = 0;
    let receivedResponse: unknown = undefined;
    patchHandler('Writing', ((_g: InnovationState, _target: string, ctx) => {
      nestedStep++;
      if (nestedStep === 1) {
        ctx.pendingChoice = {
          kind: 'yes-no', prompt: 'nested?', playerId: '0',
          options: [], optional: false,
        };
        return;
      }
      receivedResponse = ctx.response;
      return true;
    }) as DogmaHandler);

    patchHandler('Agriculture', ((gg: InnovationState, _t: string) => {
      executeSelfOnly(gg, cardByTitle('Writing').id, '0');
      return true;
    }) as DogmaHandler);

    expect(startDogma(g, cardByTitle('Agriculture').id, '0')).toBe(false);
    expect(g.pendingChoice?.prompt).toBe('nested?');
    expect(resumeDogma(g, true)).toBe(true);
    expect(receivedResponse).toBe(true);
    expect(g.dogmaRun).toBeNull();
  });
});

// Helper used by the nested-frames tests above.
function setLeafCount(g: InnovationState, playerId: string, leaves: 0 | 3): void {
  const p = g.players[playerId];
  p.piles.yellow = { cards: [], splay: 'none' };
  if (leaves === 0) return;
  p.piles.yellow.cards = [cardByTitle('Agriculture').id];
}

// ============================================================================
// Choice-validator regressions for the new kinds.
// ============================================================================

describe('isValidResponse — new choice kinds via select-card-order', () => {
  it('accepts a permutation of the options; rejects wrong-length / wrong-multiset', () => {
    const g = freshGame(1);
    // Drive via a handler that pauses on a select-card-order, then check
    // resumeDogma's validator behaviour by trying valid + invalid responses.
    let resumeResp: unknown = undefined;
    patchHandler('Agriculture', ((_g: InnovationState, _t: string, ctx) => {
      if (!ctx.handlerState.asked) {
        ctx.handlerState.asked = true;
        ctx.pendingChoice = {
          kind: 'select-card-order',
          prompt: 'order',
          playerId: '0',
          options: [10, 20, 30],
          optional: false,
        };
        return;
      }
      resumeResp = ctx.response;
      return true;
    }) as DogmaHandler);

    startDogma(g, cardByTitle('Agriculture').id, '0');
    expect(g.pendingChoice?.kind).toBe('select-card-order');
    // Valid permutation:
    const done = resumeDogma(g, [30, 10, 20]);
    expect(done).toBe(true);
    expect(resumeResp).toEqual([30, 10, 20]);
  });
});
