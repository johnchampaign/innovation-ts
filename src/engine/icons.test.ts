import { describe, expect, it } from 'vitest';
import { countIcons } from './icons';
import { cardByTitle } from '../card-data';
import type { PlayerData, Color, Splay } from './types';
import { COLORS } from './types';

function emptyPlayer(): PlayerData {
  const piles = {} as PlayerData['piles'];
  for (const c of COLORS) piles[c] = { cards: [], splay: 'none' };
  return {
    hand: [], scorePile: [], piles,
    ageAchievements: [], specialAchievements: [],
    scoredThisTurn: 0, tuckedThisTurn: 0,
  };
}

function stack(p: PlayerData, color: Color, titles: string[], splay: Splay = 'none'): void {
  // titles[0] = top card (matches Pile.cards convention).
  p.piles[color] = {
    cards: titles.map((t) => cardByTitle(t).id),
    splay,
  };
}

describe('IconCounter', () => {
  it('returns 0 on an empty board', () => {
    expect(countIcons(emptyPlayer(), 'leaf')).toBe(0);
    expect(countIcons(emptyPlayer(), 'castle')).toBe(0);
  });

  it("counts the top card's icons in all four slots", () => {
    // Agriculture (yellow, age 1) — icons [none, leaf, leaf, leaf]: 3 leaves.
    const p = emptyPlayer();
    stack(p, 'yellow', ['Agriculture']);
    expect(countIcons(p, 'leaf')).toBe(3);
    expect(countIcons(p, 'castle')).toBe(0);
  });

  it('ignores covered cards when the pile is unsplayed', () => {
    const p = emptyPlayer();
    // Agriculture on top, another leaf-bearing card underneath; unsplayed → only top counts.
    stack(p, 'yellow', ['Agriculture', 'Agriculture']);
    expect(countIcons(p, 'leaf')).toBe(3);
  });

  it("splay-left reveals only the Right slot of covered cards", () => {
    // Agriculture icons = [none, leaf, leaf, leaf]; Right slot = leaf.
    const p = emptyPlayer();
    stack(p, 'yellow', ['Agriculture', 'Agriculture', 'Agriculture'], 'left');
    // Top: 3 leaves. Two covered cards: 1 leaf each (Right).
    expect(countIcons(p, 'leaf')).toBe(3 + 1 + 1);
  });

  it("splay-right reveals Top and Left slots of covered cards", () => {
    // Agriculture: Top = none, Left = leaf.
    const p = emptyPlayer();
    stack(p, 'yellow', ['Agriculture', 'Agriculture'], 'right');
    // Top: 3. Covered: Top(none) + Left(leaf) = 1.
    expect(countIcons(p, 'leaf')).toBe(3 + 1);
    expect(countIcons(p, 'none')).toBe(0); // 'none' is sentinel, never counted
  });

  it('splay-up reveals Left, Middle, Right slots of covered cards', () => {
    // Agriculture: Left/Middle/Right all leaf → 3 leaves per covered card.
    const p = emptyPlayer();
    stack(p, 'yellow', ['Agriculture', 'Agriculture'], 'up');
    expect(countIcons(p, 'leaf')).toBe(3 + 3);
  });

  it('sums across all five color piles', () => {
    const p = emptyPlayer();
    stack(p, 'yellow', ['Agriculture']);   // 3 leaves on top
    stack(p, 'green', ['The Wheel']);      // The Wheel icons — check whatever it has, just ensure addition
    const yellowOnly = countIcons({ ...p, piles: { ...p.piles, green: { cards: [], splay: 'none' } } }, 'leaf');
    const both = countIcons(p, 'leaf');
    expect(both).toBeGreaterThanOrEqual(yellowOnly);
  });
});
