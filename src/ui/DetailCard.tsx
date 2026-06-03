// Detail card — the large "currently viewed" card at the top-left of the
// shell. Mirrors C# CardView.xaml exactly: colored HEADER (top-icon slot
// upper-left + title + age + dogma symbol), white BODY with the full dogma
// text wrapped, colored FOOTER with the 3 bottom-icon slots.

import { cardById } from '../card-data';
import { colorBg, colorBgDark, textColor, cardBorder } from './colors';
import { IconBadge } from './Icon';

interface Props {
  cardId: number | null;
  /** Optional pill-tag rendered next to the title, e.g. "Age 1". */
  ageBadge?: boolean;
}

export function DetailCard({ cardId, ageBadge = true }: Props) {
  if (cardId == null || cardId < 0) {
    return (
      <div style={emptyFrame()}>
        <div style={{ padding: 16, color: textColor, opacity: 0.55, fontSize: 12 }}>
          Hover or click a card to view its details here.
        </div>
      </div>
    );
  }
  const card = cardById(cardId);
  return (
    <div style={frame()}>
      {/* HEADER ---------------------------------------------------------- */}
      <div style={{
        background: colorBg[card.color],
        padding: '10px 12px',
        display: 'grid',
        gridTemplateColumns: '40px 1fr',
        columnGap: 10,
        alignItems: 'start',
      }}>
        <IconBadge icon={card.icons[0]} size={34} />
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontFamily: '"Segoe UI", system-ui, sans-serif',
            fontWeight: 700, fontSize: 17, lineHeight: 1.2,
            color: textColor,
          }}>
            {card.title}{ageBadge && <span style={{ fontWeight: 400, opacity: 0.85 }}> — Age {card.age}</span>}
          </div>
          <div style={{
            marginTop: 4, fontSize: 12, color: textColor,
            display: 'flex', gap: 6, alignItems: 'center',
          }}>
            <span>Dogma Symbol:</span>
            <IconBadge icon={card.dogmaIcon} size={18} />
          </div>
        </div>
      </div>

      {/* BODY ------------------------------------------------------------ */}
      <div style={{
        background: '#ffffff',
        padding: '10px 12px',
        color: textColor,
        fontSize: 12,
        lineHeight: 1.35,
        flex: 1,
      }}>
        {card.effects.map((e, i) => (
          <p key={i} style={{ margin: i === 0 ? '0' : '8px 0 0' }}>{e.text}</p>
        ))}
      </div>

      {/* FOOTER ---------------------------------------------------------- */}
      <div style={{
        background: colorBgDark[card.color],
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 6,
        padding: '6px 12px',
        justifyItems: 'center',
      }}>
        {[1, 2, 3].map((s) => (
          <IconBadge key={s} icon={card.icons[s as 1 | 2 | 3]} size={26} />
        ))}
      </div>
    </div>
  );
}

function frame(): React.CSSProperties {
  return {
    width: 340,
    minHeight: 200,
    display: 'flex',
    flexDirection: 'column',
    borderRadius: 3,
    border: `1px solid ${cardBorder}`,
    background: '#ffffff',
    fontFamily: '"Segoe UI", system-ui, sans-serif',
    overflow: 'hidden',
  };
}

function emptyFrame(): React.CSSProperties {
  return {
    width: 340,
    minHeight: 200,
    borderRadius: 3,
    border: `1px dashed ${cardBorder}`,
    background: '#fbf7da',
  };
}
