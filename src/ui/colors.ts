// Palette + icon glyphs. Hotseat UI uses CSS-in-JS via style props; this is
// the single source of truth for the color tokens and the icon characters.

import type { Color, IconName, Splay } from '../engine/types';

/** Background color for cards / piles of a given Innovation color. */
export const colorBg: Record<Color, string> = {
  yellow: '#d6b35a',
  red: '#c45b4e',
  purple: '#8c5db5',
  blue: '#5680c7',
  green: '#5fa86b',
};

/** Foreground (text) color over the corresponding colorBg. */
export const colorFg: Record<Color, string> = {
  yellow: '#1f1a08',
  red: '#fff1ee',
  purple: '#fef3ff',
  blue: '#eff4ff',
  green: '#0c2010',
};

/** Single-character glyph for each icon. The hexagon (`none`) renders as a
 *  blank slot so 4-corner layouts stay aligned. */
export const iconGlyph: Record<IconName, string> = {
  none:      '·',
  leaf:      '🍃',
  castle:    '🏰',
  lightbulb: '💡',
  crown:     '👑',
  factory:   '🏭',
  clock:     '🕒',
};

/** Short arrow for the four splay states. */
export const splayArrow: Record<Splay, string> = {
  none:  '',
  left:  '◀',
  right: '▶',
  up:    '▲',
};
