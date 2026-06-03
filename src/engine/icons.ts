// Featured-icon counting with splay-visibility rules.
// Ported from Innovation.Core/IconCounter.cs (which itself mirrors the VB6
// update_icon_total logic, main.frm line 7062).
//
// Top card always contributes all four corner slots. Covered cards contribute
// only the slots that peek out past the top card given the pile's splay:
//   left  → [Right]
//   right → [Top, Left]
//   up    → [Left, Middle, Right]
//   none  → []  (covered cards show nothing)

import type { PlayerData, IconName, Splay } from './types';
import { cardById } from '../card-data';
import { COLORS } from './types';

type Slot = 0 | 1 | 2 | 3; // Top, Left, Middle, Right (matches CardDef.icons order)

const ALL_SLOTS: Slot[] = [0, 1, 2, 3];

function visibleSlots(splay: Splay): Slot[] {
  switch (splay) {
    case 'left':  return [3];
    case 'right': return [0, 1];
    case 'up':    return [1, 2, 3];
    default:      return [];
  }
}

function countOnCard(cardId: number, icon: IconName, slots: Slot[]): number {
  const icons = cardById(cardId).icons;
  let n = 0;
  for (const s of slots) if (icons[s] === icon) n++;
  return n;
}

/** Count the featured icon visible on a player's board (top + splay-revealed). */
export function countIcons(p: PlayerData, icon: IconName): number {
  if (icon === 'none') return 0;
  let total = 0;
  for (const color of COLORS) {
    const pile = p.piles[color];
    if (pile.cards.length === 0) continue;

    // Top card: all four slots.
    total += countOnCard(pile.cards[0], icon, ALL_SLOTS);

    // Covered cards: only slots revealed by splay.
    const visible = visibleSlots(pile.splay);
    if (visible.length === 0) continue;
    for (let i = 1; i < pile.cards.length; i++) {
      total += countOnCard(pile.cards[i], icon, visible);
    }
  }
  return total;
}
