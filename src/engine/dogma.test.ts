// Ported from Innovation.Tests/DogmaEngineTests.cs.
// Drives the TS dogma driver via real cards from the catalog, swapping in
// recording handlers via overrideDogmaForTest. Setup mirrors the C# helper:
// stock every age deck, force featured-icon counts by directly placing
// known-icon cards on the yellow pile.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '../engine/handlers'; // ensure default registrations exist
import { startDogma } from './dogma';
import { overrideDogmaForTest } from './registry';
import { ALL_CARDS, cardByTitle } from '../card-data';
import { countIcons } from './icons';
import type { InnovationState, PlayerData } from './types';
import type { DogmaHandler } from './registry';
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

/** Fresh game with every card stocked into its age deck and N empty players. */
function freshGame(numPlayers: number): InnovationState {
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

/** Force a player's leaf count to 0 or 3 by placing Agriculture (3 leaves
 *  in its top corners) on yellow. Mirrors C# SetLeafCount. */
function setLeafCount(g: InnovationState, playerId: string, leaves: 0 | 3): void {
  const p = g.players[playerId];
  p.piles.yellow = { cards: [], splay: 'none' };
  if (leaves === 0) return;
  // Agriculture: icons [none, leaf, leaf, leaf] → 3 leaves on top.
  p.piles.yellow.cards = [cardByTitle('Agriculture').id];
}

/** Build a recording handler that logs each target it was called against. */
function recording(progressed: boolean): { handler: DogmaHandler; calledOn: string[] } {
  const calledOn: string[] = [];
  const handler: DogmaHandler = (_g: InnovationState, targetId: string) => {
    calledOn.push(targetId);
    return progressed;
  };
  return { handler, calledOn };
}

let restoreFns: (() => void)[] = [];
beforeEach(() => { restoreFns = []; });
afterEach(() => { for (const r of restoreFns) r(); });

function patchHandler(title: string, h: DogmaHandler): void {
  restoreFns.push(overrideDogmaForTest(title, h));
}

describe('Dogma driver — share targeting', () => {
  it("includes the active player and players with ≥ featured icons (sharers first)", () => {
    const g = freshGame(3);
    setLeafCount(g, '0', 3); // activator
    setLeafCount(g, '1', 3); // sharer
    setLeafCount(g, '2', 0); // ineligible
    // Force the featured icon to leaf by hijacking a card whose dogmaIcon is leaf.
    // Agriculture's dogmaIcon is leaf — use it as our share-test card.
    const { handler, calledOn } = recording(false);
    patchHandler('Agriculture', handler);
    startDogma(g, cardByTitle('Agriculture').id, '0');
    expect(calledOn).toEqual(['1', '0']); // sharer first, active last
  });

  it("excludes players with strictly fewer featured icons", () => {
    const g = freshGame(3);
    setLeafCount(g, '0', 3);
    setLeafCount(g, '1', 0);
    setLeafCount(g, '2', 0);
    const { handler, calledOn } = recording(false);
    patchHandler('Agriculture', handler);
    startDogma(g, cardByTitle('Agriculture').id, '0');
    expect(calledOn).toEqual(['0']); // only the activator
  });

  it('iterates from the activator\'s left, clockwise, then activator last', () => {
    const g = freshGame(4);
    for (const pid of ['0', '1', '2', '3']) setLeafCount(g, pid, 3);
    const { handler, calledOn } = recording(false);
    patchHandler('Agriculture', handler);
    startDogma(g, cardByTitle('Agriculture').id, '1');
    expect(calledOn).toEqual(['2', '3', '0', '1']);
  });
});

// Demand routing is exercised via computeTargets below (kept as a unit test
// to avoid needing a leaf-featured demand card in Age 1, which doesn't exist).
describe('computeTargets', () => {
  it('share: sharers clockwise from left of activator, activator last', async () => {
    const { computeTargets } = await import('./dogma');
    const t = computeTargets(
      ['0', '1', '2', '3'],
      '1',
      false,
      { '0': 3, '1': 3, '2': 3, '3': 3 },
    );
    expect(t).toEqual(['2', '3', '0', '1']);
  });

  it('share: excludes players with fewer featured icons', async () => {
    const { computeTargets } = await import('./dogma');
    const t = computeTargets(
      ['0', '1', '2'],
      '0',
      false,
      { '0': 3, '1': 0, '2': 0 },
    );
    expect(t).toEqual(['0']); // only activator
  });

  it('demand: only opponents with strictly fewer featured icons', async () => {
    const { computeTargets } = await import('./dogma');
    const t = computeTargets(
      ['0', '1', '2'],
      '0',
      true,
      { '0': 3, '1': 3, '2': 0 },
    );
    expect(t).toEqual(['2']); // tied opponent skipped, fewer hit; activator not included
  });

  it('demand: never includes the activator', async () => {
    const { computeTargets } = await import('./dogma');
    const t = computeTargets(
      ['0', '1', '2'],
      '0',
      true,
      { '0': 3, '1': 0, '2': 0 },
    );
    expect(t).not.toContain('0');
  });
});

describe('Dogma driver — shared-bonus draw', () => {
  // Use Agriculture (leaf-featured) for these so setLeafCount actually drives
  // sharer eligibility. The Wheel is castle-featured — wrong for this test.
  it('fires when a non-active player progresses a non-demand effect', () => {
    const g = freshGame(2);
    setLeafCount(g, '0', 3);
    setLeafCount(g, '1', 3); // tied → sharer
    const handBefore = g.players['0'].hand.length;
    patchHandler('Agriculture', recording(true).handler);
    startDogma(g, cardByTitle('Agriculture').id, '0');
    expect(g.players['0'].hand.length).toBe(handBefore + 1); // bonus drew 1
  });

  it('does not fire when only the activator progressed', () => {
    const g = freshGame(2);
    setLeafCount(g, '0', 3);
    setLeafCount(g, '1', 0); // fewer leaves → not a share target
    const handBefore = g.players['0'].hand.length;
    patchHandler('Agriculture', recording(true).handler);
    startDogma(g, cardByTitle('Agriculture').id, '0');
    expect(g.players['0'].hand.length).toBe(handBefore); // no bonus
  });
});

describe('Dogma driver — placeholder cards', () => {
  it('resolve as no-op with no shared bonus', () => {
    const g = freshGame(2);
    setLeafCount(g, '0', 3);
    setLeafCount(g, '1', 3);
    // Pick any title NOT in the registry. 'Tools' (Age 1) is unported.
    const tools = cardByTitle('Tools');
    const handBefore = g.players['0'].hand.length;
    const done = startDogma(g, tools.id, '0');
    expect(done).toBe(true);
    expect(g.dogmaRun).toBe(null);
    expect(g.players['0'].hand.length).toBe(handBefore); // no shared-bonus draw
  });
});

describe('Dogma driver — frozen icon counts', () => {
  it('snapshots counts at activation and reuses them across levels', () => {
    const g = freshGame(2);
    setLeafCount(g, '0', 3);
    setLeafCount(g, '1', 3);
    // Sanity: live counts match what we set.
    expect(countIcons(g.players['0'], 'leaf')).toBe(3);
    expect(countIcons(g.players['1'], 'leaf')).toBe(3);

    const seen: { target: string; sharerLeafCount: number }[] = [];
    patchHandler('Agriculture', ((gg: InnovationState, target: string) => {
      seen.push({ target, sharerLeafCount: countIcons(gg.players['1'], 'leaf') });
      // Mid-effect, wipe player 1's pile — but the driver should NOT recompute
      // eligibility (icon counts are frozen for the duration of the dogma).
      if (target === '1') gg.players['1'].piles.yellow = { cards: [], splay: 'none' };
      return true;
    }) as DogmaHandler);

    startDogma(g, cardByTitle('Agriculture').id, '0');
    // Sharer was called first while still having 3 leaves; activator second.
    // Both must appear despite the mid-dogma board wipe — frozen counts.
    expect(seen.map((s) => s.target)).toEqual(['1', '0']);
  });
});
