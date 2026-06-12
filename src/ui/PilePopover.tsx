// Hover-popover that lists every card in a color pile. Pile contents are
// public knowledge in Innovation (face-up on the table), so this works for
// your own piles AND opponents'.
//
// Positioned absolutely relative to its parent — wrap the anchor in a
// `position: relative` container. Pops below the anchor by default; flips
// up if it would clip the viewport. Mouse-leave is handled by the parent
// (whichever element wraps both the trigger and the popover).

import { useEffect, useRef, useState } from 'react';
import { cardById } from '../card-data';
import type { Color, Splay } from '../engine/types';
import { CardChip } from './Card';
import { panelBg, textColor, cardBorder, splayArrow, splayName, colorBg } from './colors';

interface Props {
  color: Color;
  cards: number[];
  splay: Splay;
}

export function PilePopover({ color, cards, splay }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  // Default below; flip up if the bottom edge would clip the viewport.
  const [placement, setPlacement] = useState<'below' | 'above'>('below');
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.bottom > window.innerHeight - 8) setPlacement('above');
  }, [cards.length]);

  if (cards.length === 0) return null;
  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        left: '50%',
        transform: 'translateX(-50%)',
        [placement === 'below' ? 'top' : 'bottom']: '100%',
        marginTop: placement === 'below' ? 6 : undefined,
        marginBottom: placement === 'above' ? 6 : undefined,
        zIndex: 60,
        background: panelBg,
        border: `1px solid ${cardBorder}`,
        borderRadius: 6,
        boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
        padding: '8px 10px',
        minWidth: 200,
        maxWidth: 240,
        color: textColor,
        fontFamily: '"Segoe UI", system-ui, sans-serif',
        cursor: 'default',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6,
        paddingBottom: 4, borderBottom: '1px solid rgba(0,0,0,0.12)',
        fontSize: 11,
      }}>
        <span style={{
          display: 'inline-block', width: 10, height: 10, borderRadius: 2,
          background: colorBg[color],
        }} />
        <strong style={{ textTransform: 'capitalize' }}>{color}</strong>
        <span style={{ opacity: 0.75 }}>
          · {cards.length} card{cards.length === 1 ? '' : 's'}
          {splay !== 'none' && ` · splay ${splayName[splay]} ${splayArrow[splay]}`}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {cards.map((id, i) => (
          <div key={`${id}-${i}`} style={{
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{
              width: 16, textAlign: 'right',
              fontSize: 10, opacity: 0.65,
            }}>{i === 0 ? '▶' : i}</span>
            <CardChip cardId={id} size="summary" style={{ flex: 1 }} />
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10, opacity: 0.65, marginTop: 4 }}>
        Top → bottom. ▶ marks the top card.
        {' '}<em>{cards.length > 0 && cardById(cards[0]).age}</em>
      </div>
    </div>
  );
}
