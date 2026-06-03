// Card chip — matches the C# CardTileView shape:
//   • Colored HEADER  : top-icon slot (upper-left) + title + age + dogma icon
//   • Colored FOOTER  : the three bottom icons (Left, Middle, Right)
//   • The slot matching the card's hexagon ('none') renders as a translucent
//     square so the four slots stay aligned.

import type { CSSProperties } from 'react';
import { cardById } from '../card-data';
import { colorBg, colorBgDark, textColor, cardBorder, iconGlyph } from './colors';

interface Props {
  cardId: number;
  /** Visible icons override: render only these corner indices. Used for the
   *  splay-revealed strips behind a top tile. */
  visibleSlots?: ReadonlyArray<0 | 1 | 2 | 3>;
  selected?: boolean;
  /** Compact: hand strip width, no footer if explicitly compact-summary. */
  size?: 'tile' | 'summary';
  onClick?: () => void;
  style?: CSSProperties;
}

const ALL_SLOTS: ReadonlyArray<0 | 1 | 2 | 3> = [0, 1, 2, 3];

export function CardChip({
  cardId, visibleSlots = ALL_SLOTS, selected, size = 'tile', onClick, style,
}: Props) {
  if (cardId < 0) {
    return (
      <div style={{
        ...frame(size, selected),
        background: '#d6d3bf',
        color: '#7c7866',
        ...(style ?? {}),
      }}>
        <span style={{ fontSize: 11, opacity: 0.8 }}>hidden</span>
      </div>
    );
  }
  const card = cardById(cardId);
  const interactive = !!onClick;

  if (size === 'summary') {
    // One-line strip: color block (color name short) + title + 3 footer icons.
    return (
      <div
        role={interactive ? 'button' : undefined}
        tabIndex={interactive ? 0 : undefined}
        onClick={onClick}
        style={{
          ...summaryFrame(selected),
          cursor: interactive ? 'pointer' : 'default',
          ...(style ?? {}),
        }}
      >
        <div style={{
          width: 8, background: colorBg[card.color], flexShrink: 0,
        }} />
        <div style={{
          flex: 1, padding: '4px 8px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          gap: 8, color: textColor,
        }}>
          <span style={{ fontWeight: 600, fontSize: 12 }}>{card.title}</span>
          <span style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 11 }}>
            <span style={{ opacity: 0.7 }}>Age {card.age}</span>
            <span style={{ display: 'flex', gap: 2 }}>
              {[1, 2, 3].map((s) => (
                <IconCell key={s} icon={card.icons[s as 0 | 1 | 2 | 3]} size="tiny" />
              ))}
            </span>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={interactive ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } } : undefined}
      style={{
        ...frame(size, selected),
        cursor: interactive ? 'pointer' : 'default',
        ...(style ?? {}),
      }}
    >
      {/* HEADER ---------------------------------------------------------- */}
      <div style={{
        background: colorBg[card.color],
        padding: '5px 6px 4px',
        display: 'grid',
        gridTemplateColumns: '28px 1fr',
        columnGap: 6,
        alignItems: 'start',
      }}>
        <IconCell icon={card.icons[0]} size="small" visible={visibleSlots.includes(0)} />
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontFamily: '"Segoe UI", system-ui, sans-serif',
            fontWeight: 700, fontSize: 13, lineHeight: 1.15,
            color: textColor, overflow: 'hidden', textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {card.title}
          </div>
          <div style={{
            marginTop: 2, fontSize: 10, color: textColor,
            display: 'flex', gap: 6, alignItems: 'center', whiteSpace: 'nowrap',
          }}>
            <span>Age {card.age}</span>
            <span>·</span>
            <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}>
              Dogma <IconCell icon={card.dogmaIcon} size="tiny" />
            </span>
          </div>
        </div>
      </div>

      {/* FOOTER ---------------------------------------------------------- */}
      <div style={{
        background: colorBgDark[card.color],
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 4,
        padding: '4px 6px',
      }}>
        {[1, 2, 3].map((s) => (
          <IconCell
            key={s}
            icon={card.icons[s as 0 | 1 | 2 | 3]}
            size="small"
            visible={visibleSlots.includes(s as 0 | 1 | 2 | 3)}
          />
        ))}
      </div>
    </div>
  );
}

/** A single icon slot. Renders the glyph centred; hexagon slot ('none') is a
 *  translucent placeholder so the slot grid stays aligned. */
function IconCell({
  icon, size, visible = true,
}: {
  icon: import('../engine/types').IconName;
  size: 'tiny' | 'small';
  visible?: boolean;
}) {
  const px = size === 'tiny' ? 14 : 22;
  const fontSize = size === 'tiny' ? 11 : 16;
  if (!visible) {
    return <span style={{ width: px, height: px, display: 'inline-block' }} />;
  }
  if (icon === 'none') {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: px, height: px,
        background: 'rgba(0,0,0,0.10)', borderRadius: 3,
        fontSize: fontSize, color: textColor, lineHeight: 1,
      }}>·</span>
    );
  }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: px, height: px,
      fontSize: fontSize, lineHeight: 1,
    }}>{iconGlyph[icon]}</span>
  );
}

function frame(size: 'tile' | 'summary', selected?: boolean): CSSProperties {
  if (size === 'tile') {
    return {
      width: 138,
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
  return summaryFrame(selected);
}

function summaryFrame(selected?: boolean): CSSProperties {
  return {
    display: 'flex',
    minWidth: 180,
    borderRadius: 3,
    border: `1px solid ${cardBorder}`,
    outline: selected ? '2px solid #d4a017' : 'none',
    outlineOffset: selected ? -2 : 0,
    overflow: 'hidden',
    background: '#fff',
    fontFamily: '"Segoe UI", system-ui, sans-serif',
    userSelect: 'none',
    flexShrink: 0,
  };
}
