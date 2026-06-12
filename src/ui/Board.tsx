// Board / Hand / Score / Opponent views — laid out to match the C# WPF
// MainWindow.xaml reference (five-color row of tiles + per-pile Size /
// Splay labels + View Stack; opponent row a single per-color strip).

import type { CSSProperties } from 'react';
import { score, achievementCount, highestTopAge } from '../engine/mechanics';
import { COLORS } from '../engine/types';
import type { Color, InnovationState } from '../engine/types';
import { useState } from 'react';
import { CardChip } from './Card';
import { PilePopover } from './PilePopover';
import { cardById } from '../card-data';
import {
  panelBg, textColor, cardBorder, splayArrow, splayName, displayPid,
} from './colors';

/** Card-id → age, safe for hidden ids (returns 0). Used by hover-the-back
 *  flows so we don't blow up on a redacted -1. */
function idToAge(id: number): number {
  if (id < 0) return 0;
  return cardById(id).age;
}


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
  const [showPopover, setShowPopover] = useState(false);
  return (
    <div
      onMouseLeave={() => setShowPopover(false)}
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
      {/* Size / Splay label. Pile contents are public knowledge in Innovation
       *  (face-up on the board), so hovering Size pops a full listing —
       *  works for your own piles and for opponents'. */}
      <div
        onMouseEnter={() => cards.length > 0 && setShowPopover(true)}
        style={{
          fontSize: 11, color: textColor, opacity: 0.85, textAlign: 'center',
          marginTop: 2,
          cursor: cards.length > 0 ? 'help' : 'default',
          position: 'relative',
        }}
      >
        <u>Size: <strong>{cards.length}</strong></u>
        {splay !== 'none' && <> · Splay: <strong>{splayName[splay]} {splayArrow[splay]}</strong></>}
        {showPopover && cards.length > 0 && (
          <PilePopover color={color} cards={cards} splay={splay} />
        )}
      </div>
    </div>
  );
}

/** One per-color cell in the opponent row. Hovering its Size label opens a
 *  popover showing every card in the pile (public knowledge in Innovation). */
function OpponentPileCell({
  color, cards, splay, onHoverCard,
}: {
  color: Color;
  cards: number[];
  splay: 'none' | 'left' | 'right' | 'up';
  onHoverCard?: (cardId: number) => void;
}) {
  const [showPopover, setShowPopover] = useState(false);
  const empty = cards.length === 0;
  return (
    <div
      onMouseLeave={() => setShowPopover(false)}
      style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
    >
      {empty ? (
        <div style={{
          height: 24, borderRadius: 3, border: `1px dashed ${cardBorder}`,
          fontSize: 10, color: textColor, opacity: 0.4,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{color}</div>
      ) : (
        <CardChip
          cardId={cards[0]}
          size="summary"
          onHover={onHoverCard ? () => onHoverCard(cards[0]) : undefined}
        />
      )}
      <div
        onMouseEnter={() => !empty && setShowPopover(true)}
        style={{
          fontSize: 10, color: textColor, opacity: 0.75, textAlign: 'center',
          cursor: empty ? 'default' : 'help',
          position: 'relative',
        }}
      >
        <u>Size: {cards.length}</u>
        {splay !== 'none' && ` · ${splayArrow[splay]}`}
        {showPopover && !empty && (
          <PilePopover color={color} cards={cards} splay={splay} />
        )}
      </div>
    </div>
  );
}

/** A line in the opponent-row summary that, on hover, fires onHover (which
 *  fills the top-strip DetailCard with a card-backs breakdown). No native
 *  browser tooltip — the title attribute used to display "Hover to see
 *  card-back ages" near the cursor and over-promised that the cursor area
 *  was where the info would appear. Now: an underlined link-style label
 *  signals interactivity; the breakdown shows up where the rest of the
 *  hover-detail UI lives (top-strip DetailCard). */
function HoverableSummary({
  onHover, label,
}: { onHover?: () => void; label: React.ReactNode }) {
  if (!onHover) return <div>{label}</div>;
  return (
    <div
      onMouseEnter={onHover}
      style={{
        cursor: 'help',
        textDecoration: 'underline',
        textDecorationStyle: 'dotted',
        textDecorationColor: 'rgba(0,0,0,0.35)',
        textUnderlineOffset: 2,
      }}
    >{label}</div>
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
  onHoverPile?: (label: string, ages: number[]) => void;
  /** Called when the cursor leaves this row entirely — used to clear the
   *  DetailCard back to its default state. */
  onHoverEnd?: () => void;
}

export function OpponentBoard({ G, playerId, label, onHoverCard, onHoverPile, onHoverEnd }: OpponentBoardProps) {
  const p = G.players[playerId];
  return (
    <div
      onMouseLeave={onHoverEnd}
      style={{
        display: 'grid', gridTemplateColumns: '120px 1fr 120px', gap: 12,
        alignItems: 'center',
        padding: '6px 10px',
        borderTop: `1px solid ${cardBorder}`,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: textColor }}>{label}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
        {COLORS.map((c) => (
          <OpponentPileCell
            key={c}
            color={c}
            cards={p.piles[c].cards}
            splay={p.piles[c].splay}
            onHoverCard={onHoverCard}
          />
        ))}
      </div>
      <div style={{ fontSize: 11, color: textColor, opacity: 0.85, textAlign: 'right' }}>
        <HoverableSummary
          onHover={onHoverPile ? () => onHoverPile(
            `Player ${displayPid(playerId)} — Hand`,
            p.hand.filter((id) => id >= 0).map((id) => idToAge(id)),
          ) : undefined}
          label={<>Hand <strong>{p.hand.length}</strong></>}
        />
        <HoverableSummary
          onHover={onHoverPile ? () => onHoverPile(
            `Player ${displayPid(playerId)} — Score Pile`,
            p.scorePile.filter((id) => id >= 0).map((id) => idToAge(id)),
          ) : undefined}
          label={<>Score <strong>{score(p)}</strong> ({p.scorePile.length}c)</>}
        />
        <div>Achv <strong>{achievementCount(p)}</strong></div>
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
    // Wrap so 4+ cards don't blow out the vertical space — at the typical
    // ~360px hand panel width, 2 strips per row land naturally without
    // squeezing the titles.
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
      {cards.map((id, i) => (
        <CardChip
          key={`${id}-${i}`}
          cardId={id}
          size="summary"
          onClick={onMeld ? () => onMeld(i) : undefined}
          onHover={onHoverCard ? () => onHoverCard(id) : undefined}
          style={{ flex: '1 1 160px', minWidth: 140 }}
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
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
      {cards.map((id, i) => (
        <CardChip
          key={`${id}-${i}`}
          cardId={id}
          size="summary"
          onHover={onHoverCard ? () => onHoverCard(id) : undefined}
          style={{ flex: '1 1 160px', minWidth: 140 }}
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
    padding: '6px 10px', borderRadius: 4,
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
