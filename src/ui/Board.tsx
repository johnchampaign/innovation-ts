// One player's board: five color piles, score pile summary, achievements.
// Pure presentational — Game.tsx wires clicks.

import type { CSSProperties } from 'react';
import { cardById } from '../card-data';
import { score, achievementCount, highestTopAge } from '../engine/mechanics';
import { COLORS } from '../engine/types';
import type { Color, InnovationState } from '../engine/types';
import { CardChip } from './Card';
import { splayArrow } from './colors';

interface Props {
  G: InnovationState;
  playerId: string;
  label: string;
  /** Click handler invoked when a pile is clicked. Only the active player's
   *  board calls this. */
  onActivateDogma?: (color: Color) => void;
  /** Available dogma colors on this board (for highlighting). */
  dogmaColors?: ReadonlySet<Color>;
  /** True when this row should be visually marked as the current player. */
  isCurrent: boolean;
}

const VISIBLE_BY_SPLAY: Record<Props['G']['players'][string]['piles'][Color]['splay'], (0 | 1 | 2 | 3)[]> = {
  none:  [],
  left:  [3],
  right: [0, 1],
  up:    [1, 2, 3],
};

export function PlayerBoard({ G, playerId, label, onActivateDogma, dogmaColors, isCurrent }: Props) {
  const p = G.players[playerId];
  return (
    <section style={{
      padding: '10px 14px',
      borderRadius: 8,
      background: isCurrent ? '#1c2030' : '#161821',
      border: `1px solid ${isCurrent ? '#3d4a78' : '#272a37'}`,
      transition: 'background 0.15s',
    }}>
      <header style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        marginBottom: 8,
      }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{label}</h2>
        <div style={{ fontSize: 12, opacity: 0.75, display: 'flex', gap: 18 }}>
          <span>Score <strong>{score(p)}</strong> ({p.scorePile.length}c)</span>
          <span>Highest top <strong>{highestTopAge(p)}</strong></span>
          <span>Achievements <strong>{achievementCount(p)}</strong>
            {p.ageAchievements.length > 0 && (
              <span style={{ opacity: 0.7 }}> [{p.ageAchievements.join(',')}]</span>
            )}
            {p.specialAchievements.length > 0 && (
              <span style={{ opacity: 0.7 }}> +{p.specialAchievements.join('/')}</span>
            )}
          </span>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
        {COLORS.map((c) => (
          <Pile
            key={c}
            color={c}
            cards={p.piles[c].cards}
            splay={p.piles[c].splay}
            onClick={onActivateDogma && dogmaColors?.has(c)
              ? () => onActivateDogma(c)
              : undefined}
            highlight={dogmaColors?.has(c) ?? false}
          />
        ))}
      </div>
    </section>
  );
}

interface PileProps {
  color: Color;
  cards: number[];
  splay: 'none' | 'left' | 'right' | 'up';
  onClick?: () => void;
  highlight: boolean;
}

function Pile({ color, cards, splay, onClick, highlight }: PileProps) {
  const top = cards[0];
  // Splay peek: render covered cards as narrow strips behind the top card,
  // showing only the splay-revealed slots.
  const covered = cards.slice(1);
  const visible = VISIBLE_BY_SPLAY[splay];
  const containerStyle: CSSProperties = {
    position: 'relative',
    minHeight: 96,
    padding: 4,
    borderRadius: 6,
    border: `1px dashed ${highlight ? '#ffd95b' : '#3a3d4a'}`,
    background: highlight ? 'rgba(255,217,91,0.08)' : 'transparent',
    cursor: onClick ? 'pointer' : 'default',
  };
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      style={containerStyle}
      title={`${color} — ${cards.length} card${cards.length === 1 ? '' : 's'}${splay !== 'none' ? ` (splay ${splay} ${splayArrow[splay]})` : ''}`}
    >
      <div style={{
        position: 'absolute', top: 2, left: 6,
        fontSize: 10, opacity: 0.65, textTransform: 'uppercase', letterSpacing: 1,
      }}>
        {color} {splay !== 'none' && <span>{splayArrow[splay]}</span>} {cards.length > 1 && `×${cards.length}`}
      </div>
      {top === undefined ? (
        <div style={{
          color: '#3a3d4a', fontSize: 11, fontStyle: 'italic',
          textAlign: 'center', marginTop: 30,
        }}>empty</div>
      ) : (
        <>
          {/* Covered cards as splay strips behind the top */}
          {covered.length > 0 && visible.length > 0 && (
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 1,
              marginTop: 18, marginBottom: -8, opacity: 0.55, pointerEvents: 'none',
            }}>
              {covered.slice(0, 3).map((id, i) => (
                <CoveredStrip key={`${id}-${i}`} cardId={id} visibleSlots={visible} />
              ))}
            </div>
          )}
          <div style={{ marginTop: covered.length > 0 && visible.length > 0 ? 0 : 18 }}>
            <CardChip cardId={top} compact />
          </div>
        </>
      )}
    </div>
  );
}

function CoveredStrip({ cardId, visibleSlots }: { cardId: number; visibleSlots: (0 | 1 | 2 | 3)[] }) {
  if (cardId < 0) return null;
  const card = cardById(cardId);
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      padding: '1px 4px', fontSize: 10,
      background: 'rgba(255,255,255,0.04)',
      borderRadius: 2,
    }}>
      <span style={{ opacity: 0.8 }}>{card.age} {card.title}</span>
      <span>{visibleSlots.map((s) => card.icons[s]).filter((i) => i !== 'none').map((i, idx) => (
        <span key={idx} style={{ marginLeft: 2 }}>{iconGlyphInline(i)}</span>
      ))}</span>
    </div>
  );
}

function iconGlyphInline(icon: string): string {
  // Avoid import-cycle: inline mini lookup.
  switch (icon) {
    case 'leaf': return '🍃';
    case 'castle': return '🏰';
    case 'lightbulb': return '💡';
    case 'crown': return '👑';
    case 'factory': return '🏭';
    case 'clock': return '🕒';
    default: return '';
  }
}

interface HandProps {
  cards: number[];
  /** Click handler — called with the hand index. */
  onMeld?: (handIndex: number) => void;
}

export function Hand({ cards, onMeld }: HandProps) {
  if (cards.length === 0) return (
    <div style={{ padding: 10, fontStyle: 'italic', color: '#737583' }}>(hand empty)</div>
  );
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {cards.map((id, i) => (
        <CardChip
          key={`${id}-${i}`}
          cardId={id}
          compact
          onClick={onMeld ? () => onMeld(i) : undefined}
        />
      ))}
    </div>
  );
}
