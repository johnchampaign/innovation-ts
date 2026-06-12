// Visual tokens. Palette is the C# WPF reference (CardVisuals.cs):
// medium-saturation card colors over a cream page so dark text reads
// cleanly everywhere.

import type { Color, IconName, Splay } from '../engine/types';

/** Card color → fill (matches WPF BrushForCardColor exactly). */
export const colorBg: Record<Color, string> = {
  yellow: '#F1DB6F',
  red:    '#E48282',
  purple: '#B694C9',
  blue:   '#8CB4DB',
  green:  '#8EC085',
};

/** Slightly darker variant for the card FOOTER strip (3 icons row). */
export const colorBgDark: Record<Color, string> = {
  yellow: '#D9C25C',
  red:    '#CC6E6E',
  purple: '#A07FBE',
  blue:   '#7AA0CB',
  green:  '#7AAE72',
};

/** Standard slate text the C# version uses for every body label. */
export const textColor = '#1F2937';
/** Page background — cream. */
export const pageBg = '#F3EFD3';
/** Inner panel bg (one shade lighter than page). */
export const panelBg = '#FBF7DA';
/** Translucent border the WPF uses for card outlines. */
export const cardBorder = 'rgba(0,0,0,0.33)';

/** Single-character glyph per icon. None renders as a hexagon-ish marker. */
export const iconGlyph: Record<IconName, string> = {
  none:      '⬡',
  leaf:      '🍃',
  castle:    '🏰',
  lightbulb: '💡',
  crown:     '👑',
  factory:   '🏭',
  clock:     '🕒',
};

/** Splay arrow next to "Splay X:" labels. */
export const splayArrow: Record<Splay, string> = {
  none:  '',
  left:  '◀',
  right: '▶',
  up:    '▲',
};

/** Human-readable splay name. */
export const splayName: Record<Splay, string> = {
  none:  'No',
  left:  'Left',
  right: 'Right',
  up:    'Up',
};

/** Internal player ids are 0-indexed strings ('0'..'3') because that's what
 *  boardgame.io hands us — every state key, every comparison (pid === actor),
 *  every G.players[id] lookup uses that form. But humans count from 1, so
 *  ALL user-facing player labels go through this helper. Never display the
 *  raw id directly. */
export function displayPid(internalId: string | null | undefined): string {
  if (internalId == null) return '?';
  const n = parseInt(internalId, 10);
  if (Number.isNaN(n)) return internalId;
  return String(n + 1);
}
