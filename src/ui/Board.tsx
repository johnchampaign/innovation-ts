// Board + hand views. Layout matches the C# WPF MainWindow:
//   - "Your Board" — the active viewer's five color slots as full tiles with
//     "Size: N · Splay: Right" labels below each (matches the C# tile labels).
//   - PlayerBoard renders this for whichever player you point at. Opponents
//     use a more compact version with summary strips and a totals row.
//   - Hand and ScorePile render as stacked one-line summary strips.

import type { CSSProperties } from 'react';
import { score, achievementCount, highestTopAge } from '../engine/mechanics';
import { COLORS } from '../engine/types';
import type { Color, InnovationState } from '../engine/types';
import { cardById } from '../card-data';
import { CardChip } from './Card';
import {
  colorBg, panelBg, textColor, cardBorder, splayArrow, splayName,
} from './colors';

const VISIBLE_BY_SPLAY = {
  none:  [] as (0 | 1 | 2 | 3)[],
  left:  [3] as (0 | 1 | 2 | 3)[],
  right: [0, 1] as (0 | 1 | 2 | 3)[],
  up:    [1, 2, 3] as (0 | 1 | 2 | 3)[],
};

// --------------------------------------------------------------------------
// "Your Board" — full-size pile view (top tile + splay strips beneath +
// Size / Splay label).
// --------------------------------------------------------------------------

interface YourBoardProps {
  G: InnovationState;
  playerId: string;
  label: string;
  onActivateDogma?: (color: Color) => void;
  dogmaColors?: ReadonlySet<Color>;
}

export function YourBoard({ G, playerId, label, onActivateDogma, dogmaColors }: YourBoardProps) {
  const p = G.players[playerId];
  return (
    <section style={panel()}>
      <SectionHeader text={label} extra={
        <span style={{ fontSize: 12, color: textColor, opacity: 0.75 }}>
          Highest top <strong>{highestTopAge(p)}</strong>
          {' · Score '}<strong>{score(p)}</strong>{' ('}{p.scorePile.length}c)
          {' · Achievements '}<strong>{achievementCount(p)}</strong>
          {p.ageAchievements.length > 0 && (
            <span style={{ opacity: 0.7 }}> [{p.ageAchievements.join(',')}]</span>
          )}
          {p.specialAchievements.length > 0 && (
            <span style={{ opacity: 0.7 }}> +{p.specialAchievements.join('/')}</span>
          )}
        </span>
      } />
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10,
        marginTop: 6,
      }}>
        {COLORS.map((c) => (
          <PileColumn
            key={c}
            color={c}
            cards={p.piles[c].cards}
            splay={p.piles[c].splay}
            highlight={dogmaColors?.has(c) ?? false}
            onClick={onActivateDogma && dogmaColors?.has(c) ? () => onActivateDogma(c) : undefined}
          />
        ))}
      </div>
    </section>
  );
}

function PileColumn({
  color, cards, splay, highlight, onClick,
}: {
  color: Color;
  cards: number[];
  splay: 'none' | 'left' | 'right' | 'up';
  highlight: boolean;
  onClick?: () => void;
}) {
  const top = cards[0];
  const covered = cards.slice(1);
  const visible = VISIBLE_BY_SPLAY[splay];
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      style={{
        padding: 6,
        borderRadius: 4,
        background: highlight ? 'rgba(212,160,23,0.18)' : 'transparent',
        border: highlight ? '1px solid #d4a017' : '1px solid transparent',
        cursor: onClick ? 'pointer' : 'default',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      }}
    >
      {top === undefined ? (
        <EmptySlot color={color} />
      ) : (
        <>
          <CardChip cardId={top} />
          {covered.length > 0 && visible.length > 0 && (
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 1, width: 138,
              marginTop: -2,
            }}>
              {covered.slice(0, 4).map((id, i) => (
                <CoveredStrip key={`${id}-${i}`} cardId={id} color={color} />
              ))}
            </div>
          )}
        </>
      )}
      <div style={{
        fontSize: 11, color: textColor, opacity: 0.75,
        textAlign: 'center',
      }}>
        Size: <strong>{cards.length}</strong>
        {' · '}Splay: <strong>{splay === 'none' ? 'No' : splayName[splay]}{splay !== 'none' ? ` ${splayArrow[splay]}` : ''}</strong>
      </div>
    </div>
  );
}

function CoveredStrip({ cardId, color: _color }: { cardId: number; color: Color }) {
  if (cardId < 0) return null;
  return <CardChip cardId={cardId} size="summary" />;
}

function EmptySlot({ color }: { color: Color }) {
  return (
    <div style={{
      width: 138, height: 86,
      borderRadius: 3,
      border: `1px dashed ${cardBorder}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: textColor, opacity: 0.45, fontSize: 11, fontStyle: 'italic',
      background: '#ffffff80',
    }}>
      <span style={{
        display: 'inline-block', width: 10, height: 10, borderRadius: 2,
        background: colorBg[color], marginRight: 6,
      }} />
      {color}
    </div>
  );
}

// --------------------------------------------------------------------------
// "Opponent Board" — compact: just 5 colored top strips and stats.
// --------------------------------------------------------------------------

interface OpponentBoardProps {
  G: InnovationState;
  playerId: string;
  label: string;
}

export function OpponentBoard({ G, playerId, label }: OpponentBoardProps) {
  const p = G.players[playerId];
  return (
    <div style={{
      ...panel(),
      padding: '8px 12px',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 6,
      }}>
        <strong style={{ fontSize: 13, color: textColor }}>{label}</strong>
        <span style={{ fontSize: 11, color: textColor, opacity: 0.75 }}>
          Hand <strong>{p.hand.length}</strong>{' · '}
          Score <strong>{score(p)}</strong>{' ('}{p.scorePile.length}c){' · '}
          Achv <strong>{achievementCount(p)}</strong>
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
        {COLORS.map((c) => (
          <div key={c} style={{
            border: `1px solid ${cardBorder}`,
            borderRadius: 3,
            minHeight: 44,
            background: '#fff',
            overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
          }}>
            {p.piles[c].cards.length === 0 ? (
              <div style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, color: textColor, opacity: 0.4,
              }}>{c}</div>
            ) : (
              <>
                <div style={{
                  background: colorBg[c], padding: '3px 6px',
                  color: textColor, fontSize: 11, fontWeight: 600,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {p.piles[c].cards.length > 0
                    ? (p.piles[c].cards[0] >= 0 ? cardById(p.piles[c].cards[0]).title : 'hidden')
                    : c}
                </div>
                <div style={{
                  padding: '3px 6px', fontSize: 10, color: textColor, opacity: 0.75,
                }}>
                  Size: {p.piles[c].cards.length}
                  {p.piles[c].splay !== 'none' && ` · Splay ${splayArrow[p.piles[c].splay]}`}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Hand (interactive) and ScorePile (read-only) stacked-strips views.
// --------------------------------------------------------------------------

interface HandProps {
  cards: number[];
  onMeld?: (handIndex: number) => void;
}

export function Hand({ cards, onMeld }: HandProps) {
  if (cards.length === 0) {
    return <EmptyNote text="(hand empty)" />;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {cards.map((id, i) => (
        <CardChip
          key={`${id}-${i}`}
          cardId={id}
          size="summary"
          onClick={onMeld ? () => onMeld(i) : undefined}
        />
      ))}
    </div>
  );
}

export function ScorePileStrip({ cards }: { cards: number[] }) {
  if (cards.length === 0) return <EmptyNote text="(score pile empty)" />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {cards.map((id, i) => (
        <CardChip key={`${id}-${i}`} cardId={id} size="summary" />
      ))}
    </div>
  );
}

// --------------------------------------------------------------------------
// Common pieces.
// --------------------------------------------------------------------------

function panel(): CSSProperties {
  return {
    padding: '10px 14px',
    borderRadius: 6,
    background: panelBg,
    border: `1px solid ${cardBorder}`,
  };
}

function SectionHeader({ text, extra }: { text: string; extra?: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      borderBottom: '1px solid rgba(0,0,0,0.12)', paddingBottom: 6,
    }}>
      <h2 style={{
        margin: 0, fontSize: 14, fontWeight: 700, color: textColor,
        fontFamily: '"Segoe UI", system-ui, sans-serif',
      }}>{text}</h2>
      {extra}
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return (
    <div style={{
      padding: 10, fontStyle: 'italic', color: textColor, opacity: 0.55,
      fontSize: 12,
    }}>{text}</div>
  );
}

export { panel, SectionHeader };
