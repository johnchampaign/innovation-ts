// Board / Hand / Score / Opponent views — laid out to match the C# WPF
// MainWindow.xaml reference (five-color row of tiles + per-pile Size /
// Splay labels + View Stack; opponent row a single per-color strip).

import type { CSSProperties } from 'react';
import { score, achievementCount, highestTopAge } from '../engine/mechanics';
import { COLORS } from '../engine/types';
import type { Color, InnovationState } from '../engine/types';
import { CardChip } from './Card';
import {
  panelBg, textColor, cardBorder, splayArrow, splayName,
} from './colors';

const VISIBLE_BY_SPLAY = {
  none:  [] as (0 | 1 | 2 | 3)[],
  left:  [3] as (0 | 1 | 2 | 3)[],
  right: [0, 1] as (0 | 1 | 2 | 3)[],
  up:    [1, 2, 3] as (0 | 1 | 2 | 3)[],
};

// --------------------------------------------------------------------------
// "Your Board" — 5 tiles in a row with Size · Splay labels beneath each.
// --------------------------------------------------------------------------

interface YourBoardProps {
  G: InnovationState;
  playerId: string;
  onActivateDogma?: (color: Color) => void;
  dogmaColors?: ReadonlySet<Color>;
  onHoverCard?: (cardId: number) => void;
}

export function YourBoard({
  G, playerId, onActivateDogma, dogmaColors, onHoverCard,
}: YourBoardProps) {
  const p = G.players[playerId];
  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 18, marginBottom: 8,
      }}>
        <h2 style={sectionTitle()}>Your Board</h2>
        <span style={{ fontSize: 12, color: textColor }}>
          Highest top <strong>{highestTopAge(p)}</strong>
        </span>
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12,
      }}>
        {COLORS.map((c) => (
          <PileColumn
            key={c}
            color={c}
            cards={p.piles[c].cards}
            splay={p.piles[c].splay}
            highlight={dogmaColors?.has(c) ?? false}
            onClick={onActivateDogma && dogmaColors?.has(c) ? () => onActivateDogma(c) : undefined}
            onHoverCard={onHoverCard}
          />
        ))}
      </div>
    </div>
  );
}

function PileColumn({
  color, cards, splay, highlight, onClick, onHoverCard,
}: {
  color: Color;
  cards: number[];
  splay: 'none' | 'left' | 'right' | 'up';
  highlight: boolean;
  onClick?: () => void;
  onHoverCard?: (cardId: number) => void;
}) {
  const top = cards[0];
  const covered = cards.slice(1);
  const visible = VISIBLE_BY_SPLAY[splay];
  return (
    <div
      style={{
        padding: 4,
        borderRadius: 4,
        background: highlight ? 'rgba(212,160,23,0.18)' : 'transparent',
        border: highlight ? '1px solid #d4a017' : '1px solid transparent',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      }}
    >
      {top === undefined ? (
        <EmptySlot color={color} />
      ) : (
        <div onClick={onClick} role={onClick ? 'button' : undefined} style={{ cursor: onClick ? 'pointer' : 'default' }}>
          <CardChip cardId={top} onHover={onHoverCard ? () => onHoverCard(top) : undefined} />
        </div>
      )}
      {covered.length > 0 && visible.length > 0 && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 1, width: 180,
          marginTop: -2,
        }}>
          {covered.slice(0, 5).map((id, i) => (
            <CardChip
              key={`${id}-${i}`}
              cardId={id}
              size="summary"
              onHover={onHoverCard ? () => onHoverCard(id) : undefined}
            />
          ))}
        </div>
      )}
      <div style={{
        fontSize: 11, color: textColor, opacity: 0.85, textAlign: 'center',
        marginTop: 2,
      }}>
        <u>Size: <strong>{cards.length}</strong></u>
        {splay !== 'none' && <> · Splay: <strong>{splayName[splay]} {splayArrow[splay]}</strong></>}
      </div>
    </div>
  );
}

function EmptySlot({ color }: { color: Color }) {
  return (
    <div style={{
      width: 180, height: 92,
      borderRadius: 3,
      border: `1px dashed ${cardBorder}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: textColor, opacity: 0.45, fontSize: 11, fontStyle: 'italic',
      background: '#fffaeb',
    }}>{color}</div>
  );
}

// --------------------------------------------------------------------------
// Opponent Board: one row per opponent.  Per color: a single summary strip
// (the top card) + "Size: N · Splay X" below it.
// --------------------------------------------------------------------------

interface OpponentBoardProps {
  G: InnovationState;
  playerId: string;
  label: string;
  onHoverCard?: (cardId: number) => void;
}

export function OpponentBoard({ G, playerId, label, onHoverCard }: OpponentBoardProps) {
  const p = G.players[playerId];
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '120px 1fr 120px', gap: 12,
      alignItems: 'center',
      padding: '6px 10px',
      borderTop: `1px solid ${cardBorder}`,
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: textColor }}>{label}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
        {COLORS.map((c) => (
          <div key={c} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {p.piles[c].cards.length === 0 ? (
              <div style={{
                height: 24, borderRadius: 3, border: `1px dashed ${cardBorder}`,
                fontSize: 10, color: textColor, opacity: 0.4,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{c}</div>
            ) : (
              <CardChip
                cardId={p.piles[c].cards[0]}
                size="summary"
                onHover={onHoverCard ? () => onHoverCard(p.piles[c].cards[0]) : undefined}
              />
            )}
            <div style={{ fontSize: 10, color: textColor, opacity: 0.75, textAlign: 'center' }}>
              <u>Size: {p.piles[c].cards.length}</u>
              {p.piles[c].splay !== 'none' && ` · ${splayArrow[p.piles[c].splay]}`}
            </div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: textColor, opacity: 0.8, textAlign: 'right' }}>
        Hand <strong>{p.hand.length}</strong>
        <br />
        Score <strong>{score(p)}</strong> ({p.scorePile.length}c)
        <br />
        Achv <strong>{achievementCount(p)}</strong>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Hand + Score: vertical stacks of summary strips.
// --------------------------------------------------------------------------

interface HandProps {
  cards: number[];
  onMeld?: (handIndex: number) => void;
  onHoverCard?: (cardId: number) => void;
}

export function Hand({ cards, onMeld, onHoverCard }: HandProps) {
  if (cards.length === 0) return <EmptyNote text="(hand empty)" />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {cards.map((id, i) => (
        <CardChip
          key={`${id}-${i}`}
          cardId={id}
          size="summary"
          onClick={onMeld ? () => onMeld(i) : undefined}
          onHover={onHoverCard ? () => onHoverCard(id) : undefined}
        />
      ))}
    </div>
  );
}

export function ScorePileStrip({
  cards, onHoverCard,
}: {
  cards: number[];
  onHoverCard?: (cardId: number) => void;
}) {
  if (cards.length === 0) return <EmptyNote text="(score pile empty)" />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {cards.map((id, i) => (
        <CardChip
          key={`${id}-${i}`}
          cardId={id}
          size="summary"
          onHover={onHoverCard ? () => onHoverCard(id) : undefined}
        />
      ))}
    </div>
  );
}

// --------------------------------------------------------------------------
// Helpers.
// --------------------------------------------------------------------------

export function sectionTitle(): CSSProperties {
  return {
    margin: 0, fontSize: 14, fontWeight: 700, color: textColor,
    fontFamily: '"Segoe UI", system-ui, sans-serif',
  };
}

export function panel(): CSSProperties {
  return {
    padding: '8px 12px', borderRadius: 4,
    background: panelBg, border: `1px solid ${cardBorder}`,
  };
}

function EmptyNote({ text }: { text: string }) {
  return (
    <div style={{
      padding: 8, fontStyle: 'italic', color: textColor, opacity: 0.55,
      fontSize: 12,
    }}>{text}</div>
  );
}

export const SectionHeader = ({ text, extra }: { text: string; extra?: React.ReactNode }) => (
  <div style={{
    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
    borderBottom: '1px solid rgba(0,0,0,0.12)', paddingBottom: 4, marginBottom: 6,
  }}>
    <h3 style={{
      margin: 0, fontSize: 13, fontWeight: 700, color: textColor,
      fontFamily: '"Segoe UI", system-ui, sans-serif',
    }}>{text}</h3>
    {extra}
  </div>
);
