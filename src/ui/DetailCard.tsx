// Detail card — the large "currently viewed" card at the top-left of the
// shell. Mirrors C# CardView.xaml exactly: colored HEADER (top-icon slot
// upper-left + title + age + dogma symbol), white BODY with the full dogma
// text wrapped, colored FOOTER with the 3 bottom-icon slots.

import { cardById } from '../card-data';
import { colorBg, colorBgDark, textColor, cardBorder } from './colors';
import { IconBadge } from './Icon';

/** What the detail slot is currently displaying. */
export type DetailTarget =
  | { kind: 'card'; id: number }
  | { kind: 'special'; name: string }
  | { kind: 'card-backs'; label: string; ages: number[] }
  | { kind: 'achievements'; label: string; ages: number[]; specials: string[] }
  | null;

const SPECIAL_RULES: Record<string, string> = {
  Monument: 'During your turn, tuck six or more cards OR score six or more cards.',
  Empire: 'Have at least three of every icon type (Leaf, Castle, Lightbulb, Crown, Factory, Clock) on your board.',
  World: 'Have at least twelve Clock icons on your board.',
  Wonder: 'Have at least one top card of every color, each splayed Up or Right.',
  Universe: 'Have at least one top card of every color, every top card age 8 or higher.',
};

interface Props {
  target: DetailTarget;
  /** Optional pill-tag rendered next to the title, e.g. "Age 1". */
  ageBadge?: boolean;
}

export function DetailCard({ target, ageBadge = true }: Props) {
  if (target?.kind === 'special') return <SpecialDetail name={target.name} />;
  if (target?.kind === 'card-backs') return <CardBacksDetail label={target.label} ages={target.ages} />;
  if (target?.kind === 'achievements') return <AchievementsDetail label={target.label} ages={target.ages} specials={target.specials} />;
  const cardId = target?.kind === 'card' ? target.id : null;
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

function SpecialDetail({ name }: { name: string }) {
  const rule = SPECIAL_RULES[name] ?? '(no description available)';
  return (
    <div style={frame()}>
      <div style={{
        background: '#e8d99a',
        padding: '10px 12px',
      }}>
        <div style={{
          fontFamily: '"Segoe UI", system-ui, sans-serif',
          fontWeight: 700, fontSize: 17, lineHeight: 1.2, color: textColor,
        }}>
          {name} <span style={{ fontWeight: 400, opacity: 0.85 }}>— Special Achievement</span>
        </div>
        <div style={{ marginTop: 2, fontSize: 11, color: textColor, opacity: 0.75 }}>
          Claim during your turn when the condition is met.
        </div>
      </div>
      <div style={{
        flex: 1, padding: '10px 12px',
        fontSize: 12, color: textColor, lineHeight: 1.4, background: '#ffffff',
      }}>
        {rule}
      </div>
    </div>
  );
}

/** Render a "view the backs" pile — count + per-age tally + a visual row of
 *  age-numbered card-backs in age order. Used for opponent hand and score
 *  pile previews; the player who owns the cards sees the fronts via the
 *  normal CardChip detail. */
function CardBacksDetail({ label, ages }: { label: string; ages: number[] }) {
  const sorted = [...ages].sort((a, b) => a - b);
  const tally = new Map<number, number>();
  for (const a of sorted) tally.set(a, (tally.get(a) ?? 0) + 1);
  return (
    <div style={frame()}>
      <div style={{
        background: '#e8d99a',
        padding: '10px 12px',
      }}>
        <div style={{
          fontFamily: '"Segoe UI", system-ui, sans-serif',
          fontWeight: 700, fontSize: 16, lineHeight: 1.2, color: textColor,
        }}>{label}</div>
        <div style={{ marginTop: 2, fontSize: 11, color: textColor, opacity: 0.75 }}>
          {ages.length === 0 ? 'empty' : `${ages.length} card${ages.length === 1 ? '' : 's'} — only the back (age) is visible`}
        </div>
      </div>
      <div style={{
        flex: 1, padding: '10px 12px', background: '#ffffff',
        color: textColor, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        {ages.length === 0 ? (
          <span style={{ opacity: 0.55, fontStyle: 'italic' }}>(no cards)</span>
        ) : (
          <>
            <div style={{ fontSize: 11, opacity: 0.75 }}>
              {[...tally.entries()].sort((a, b) => a[0] - b[0]).map(([age, n], i, arr) => (
                <span key={age}>
                  Age <strong>{age}</strong> ×{n}{i < arr.length - 1 && ', '}
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {sorted.map((age, i) => <CardBackTile key={i} age={age} />)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AchievementsDetail({
  label, ages, specials,
}: { label: string; ages: number[]; specials: string[] }) {
  const sortedAges = [...ages].sort((a, b) => a - b);
  return (
    <div style={frame()}>
      <div style={{ background: '#e8d99a', padding: '10px 12px' }}>
        <div style={{
          fontFamily: '"Segoe UI", system-ui, sans-serif',
          fontWeight: 700, fontSize: 16, lineHeight: 1.2, color: textColor,
        }}>{label}</div>
        <div style={{ marginTop: 2, fontSize: 11, color: textColor, opacity: 0.75 }}>
          {ages.length + specials.length === 0
            ? 'no achievements yet'
            : `${ages.length} age + ${specials.length} special`}
        </div>
      </div>
      <div style={{
        flex: 1, padding: '10px 12px', background: '#ffffff',
        color: textColor, fontSize: 12, lineHeight: 1.5,
      }}>
        {ages.length === 0 && specials.length === 0 ? (
          <span style={{ opacity: 0.55, fontStyle: 'italic' }}>(none claimed)</span>
        ) : (
          <>
            {sortedAges.length > 0 && (
              <div style={{ marginBottom: 6 }}>
                <strong>Age:</strong>{' '}
                {sortedAges.map((a, i) => (
                  <span key={a}>
                    <span style={{
                      display: 'inline-block', minWidth: 18, textAlign: 'center',
                      padding: '0 4px', borderRadius: 9,
                      background: '#d4a017', color: textColor,
                      fontWeight: 700, marginRight: 4,
                    }}>{a}</span>
                    {i < sortedAges.length - 1 && ' '}
                  </span>
                ))}
              </div>
            )}
            {specials.length > 0 && (
              <div>
                <strong>Special:</strong>{' '}
                {specials.map((s, i) => (
                  <span key={s}>
                    {s}{i < specials.length - 1 ? ', ' : ''}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function CardBackTile({ age }: { age: number }) {
  // Tan/beige card-back coloured by age so the eye can scan groupings.
  const hue = 30 + (age - 1) * 18; // 30 (warm tan) → 192 (cool teal)
  return (
    <div style={{
      width: 26, height: 36,
      borderRadius: 3,
      border: `1px solid ${cardBorder}`,
      background: `hsl(${hue} 35% 72%)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#1F2937', fontWeight: 700, fontSize: 14,
      fontFamily: '"Segoe UI", system-ui, sans-serif',
      userSelect: 'none',
    }} title={`Age ${age}`}>
      {age}
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
