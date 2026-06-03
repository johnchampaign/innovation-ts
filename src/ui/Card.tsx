// Card chip variants:
//   • tile    — top-of-pile size (180x130ish). Header: top-icon + title +
//               age + dogma symbol. Footer: 3 icons. Matches C# CardTileView.
//   • summary — single-line strip "N-Title  icon" with colored background.
//               The hand list and opponent-board cards use this.

import type { CSSProperties } from 'react';
import { cardById } from '../card-data';
import { colorBg, colorBgDark, textColor, cardBorder } from './colors';
import { IconBadge } from './Icon';

interface Props {
  cardId: number;
  selected?: boolean;
  size?: 'tile' | 'summary';
  onClick?: () => void;
  onHover?: () => void;
  style?: CSSProperties;
}

export function CardChip({
  cardId, selected, size = 'tile', onClick, onHover, style,
}: Props) {
  if (cardId < 0) {
    return (
      <div style={{ ...frame(size, selected), background: '#dcd6bc', color: '#7c7866', ...style }}>
        <span style={{ fontSize: 11, opacity: 0.8, padding: 8 }}>hidden</span>
      </div>
    );
  }
  const card = cardById(cardId);
  const interactive = !!onClick;

  if (size === 'summary') {
    // C# "CardSummaryView": one-line colored strip with title + dogma icon
    // on the right.
    return (
      <div
        role={interactive ? 'button' : undefined}
        tabIndex={interactive ? 0 : undefined}
        onClick={onClick}
        onMouseEnter={onHover}
        style={{
          ...summaryFrame(selected),
          background: colorBg[card.color],
          cursor: interactive ? 'pointer' : 'default',
          ...style,
        }}
      >
        <span style={{
          padding: '4px 8px',
          fontFamily: '"Segoe UI", system-ui, sans-serif',
          fontWeight: 600, fontSize: 12,
          color: textColor,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          flex: 1, minWidth: 0,
        }}>
          {card.age}-{card.title}
        </span>
        <span style={{ paddingRight: 6, display: 'flex', alignItems: 'center' }}>
          <IconBadge icon={card.dogmaIcon} size={16} />
        </span>
      </div>
    );
  }

  // TILE -----------------------------------------------------------------
  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onMouseEnter={onHover}
      onKeyDown={interactive ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } } : undefined}
      style={{ ...frame(size, selected), cursor: interactive ? 'pointer' : 'default', ...style }}
    >
      {/* HEADER */}
      <div style={{
        background: colorBg[card.color],
        padding: '5px 7px 5px',
        display: 'grid',
        gridTemplateColumns: '26px 1fr',
        columnGap: 6,
        alignItems: 'start',
      }}>
        <IconBadge icon={card.icons[0]} size={24} />
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontFamily: '"Segoe UI", system-ui, sans-serif',
            fontWeight: 700, fontSize: 13, lineHeight: 1.15,
            color: textColor, overflow: 'hidden', textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>{card.title}</div>
          <div style={{
            marginTop: 2, fontSize: 10, color: textColor,
            display: 'flex', gap: 5, alignItems: 'center', whiteSpace: 'nowrap',
          }}>
            <span>{card.age}</span>
            <span style={{ opacity: 0.65 }}>·</span>
            <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              <span style={{ fontSize: 10 }}>Dogma</span>
              <IconBadge icon={card.dogmaIcon} size={14} />
            </span>
          </div>
        </div>
      </div>
      {/* FOOTER */}
      <div style={{
        background: colorBgDark[card.color],
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 4,
        padding: '5px 8px',
        justifyItems: 'center',
      }}>
        {[1, 2, 3].map((s) => (
          <IconBadge key={s} icon={card.icons[s as 1 | 2 | 3]} size={22} />
        ))}
      </div>
    </div>
  );
}

function frame(size: 'tile' | 'summary', selected?: boolean): CSSProperties {
  if (size === 'summary') return summaryFrame(selected);
  return {
    width: 180,
    borderRadius: 3,
    border: `1px solid ${cardBorder}`,
    outline: selected ? '3px solid #d4a017' : 'none',
    outlineOffset: selected ? -3 : 0,
    overflow: 'hidden',
    background: '#fff',
    fontFamily: '"Segoe UI", system-ui, sans-serif',
    userSelect: 'none',
    flexShrink: 0,
  };
}

function summaryFrame(selected?: boolean): CSSProperties {
  return {
    display: 'flex', alignItems: 'center',
    minWidth: 180, height: 24,
    borderRadius: 3,
    border: `1px solid ${cardBorder}`,
    outline: selected ? '2px solid #d4a017' : 'none',
    outlineOffset: selected ? -2 : 0,
    overflow: 'hidden',
    fontFamily: '"Segoe UI", system-ui, sans-serif',
    userSelect: 'none',
    flexShrink: 0,
  };
}
