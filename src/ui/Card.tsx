// Card chip — the smallest visual unit. Renders one card as a colored tile
// with title, age, and the four corner icons. Used in piles, hand, and choice
// prompts.

import type { CSSProperties } from 'react';
import { cardById } from '../card-data';
import { colorBg, colorFg, iconGlyph } from './colors';

interface Props {
  cardId: number;
  /** Visible icons override: if provided, only these corner indices are
   *  rendered (rest are blanks). Used when rendering a splay-covered card. */
  visibleSlots?: ReadonlyArray<0 | 1 | 2 | 3>;
  selected?: boolean;
  /** Compact mode for the choice prompt + hand grids. */
  compact?: boolean;
  onClick?: () => void;
  style?: CSSProperties;
}

const ALL_SLOTS: ReadonlyArray<0 | 1 | 2 | 3> = [0, 1, 2, 3];

export function CardChip({
  cardId, visibleSlots = ALL_SLOTS, selected, compact, onClick, style,
}: Props) {
  if (cardId < 0) {
    return (
      <div style={{
        ...baseStyle(compact),
        background: '#33363d',
        color: '#9aa0aa',
        cursor: 'default',
        ...(style ?? {}),
      }}>
        <span style={{ fontSize: compact ? 10 : 12, opacity: 0.7 }}>hidden</span>
      </div>
    );
  }
  const card = cardById(cardId);
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      style={{
        ...baseStyle(compact),
        background: colorBg[card.color],
        color: colorFg[card.color],
        cursor: onClick ? 'pointer' : 'default',
        outline: selected ? '3px solid #ffd95b' : 'none',
        outlineOffset: selected ? -3 : 0,
        ...(style ?? {}),
      }}
    >
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        fontSize: compact ? 10 : 11, opacity: 0.85,
      }}>
        <span style={{ fontWeight: 700 }}>{card.age}</span>
      </div>
      <div style={{
        fontWeight: 600, fontSize: compact ? 11 : 13, lineHeight: 1.15,
        marginTop: 1, marginBottom: 'auto',
      }}>
        {card.title}
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2,
        fontSize: compact ? 13 : 16, marginTop: 2, lineHeight: 1,
      }}>
        {ALL_SLOTS.map((slot) => (
          <span key={slot} style={{ textAlign: 'center', opacity: visibleSlots.includes(slot) ? 1 : 0.15 }}>
            {iconGlyph[card.icons[slot]]}
          </span>
        ))}
      </div>
    </div>
  );
}

function baseStyle(compact?: boolean): CSSProperties {
  return {
    display: 'flex', flexDirection: 'column',
    width: compact ? 110 : 130,
    minHeight: compact ? 62 : 80,
    padding: compact ? '4px 6px' : '6px 8px',
    borderRadius: 6,
    boxSizing: 'border-box',
    fontFamily: 'system-ui, sans-serif',
    boxShadow: '0 1px 0 rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.07)',
    userSelect: 'none',
  };
}
