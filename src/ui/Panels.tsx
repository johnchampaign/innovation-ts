// Shared sidebar panels used by BOTH game shells (hotseat `Game.tsx` and
// online `OnlineGame.tsx`). Extracted so the two views can never drift apart
// again — previously OnlineGame carried its own older copies (emoji icons,
// round achievement tiles, boxed cards-remaining) that missed the Phase-6
// restyle applied here. Single source of truth now.

import { ALL_CARDS, cardById } from '../card-data';
import { countIcons } from '../engine/icons';
import type { IconName } from '../engine/types';
import type { BgioState } from '../adapter/innovationAdapter';
import { panel } from './Board';
import { IconBadge } from './Icon';
import { textColor, displayPid } from './colors';

function th(): React.CSSProperties { return { textAlign: 'center', fontWeight: 600, padding: '2px 3px' }; }
function td(): React.CSSProperties { return { textAlign: 'center', padding: '2px 3px' }; }

export function IconTotalsPanel({
  G, viewerId, onHoverAchievements, onHoverEnd,
}: {
  G: BgioState['G'];
  viewerId: string;
  onHoverAchievements?: (label: string, ages: number[], specials: string[]) => void;
  onHoverEnd?: () => void;
}) {
  const playerIds = Object.keys(G.players);
  const icons: IconName[] = ['leaf', 'castle', 'lightbulb', 'crown', 'factory', 'clock'];
  const totals: Record<string, Record<IconName, number>> = {};
  for (const pid of playerIds) {
    totals[pid] = {
      none: 0,
      leaf: countIcons(G.players[pid], 'leaf'),
      castle: countIcons(G.players[pid], 'castle'),
      lightbulb: countIcons(G.players[pid], 'lightbulb'),
      crown: countIcons(G.players[pid], 'crown'),
      factory: countIcons(G.players[pid], 'factory'),
      clock: countIcons(G.players[pid], 'clock'),
    };
  }
  // Color a cell green/red if it's the leader / trailer.
  function cellColor(icon: IconName, pid: string): string {
    const vals = playerIds.map((id) => totals[id][icon]);
    const max = Math.max(...vals);
    const min = Math.min(...vals);
    const v = totals[pid][icon];
    if (max === min) return textColor;
    if (v === max) return '#1f7a2f';
    if (v === min) return '#a33030';
    return textColor;
  }
  return (
    <div style={panel()}>
      <div style={{ fontSize: 12, color: textColor, marginBottom: 4 }}>Icon totals</div>
      <table style={{ fontSize: 11, borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={{ padding: '2px 4px' }}></th>
            {icons.map((i) => (
              <th key={i} style={{ padding: '2px 2px' }}>
                <IconBadge icon={i} size={16} />
              </th>
            ))}
            <th style={th()}>A</th>
            <th style={th()}>S</th>
          </tr>
        </thead>
        <tbody>
          {playerIds.map((pid) => {
            const p = G.players[pid];
            const totalAchv = p.ageAchievements.length + p.specialAchievements.length;
            return (
              <tr
                key={pid}
                onMouseLeave={onHoverEnd}
                style={{ background: pid === viewerId ? 'rgba(0,0,0,0.04)' : 'transparent' }}
              >
                <td style={{ ...td(), fontWeight: 600, color: textColor }}>P{displayPid(pid)}</td>
                {icons.map((i) => (
                  <td key={i} style={{ ...td(), color: cellColor(i, pid), fontWeight: 600 }}>{totals[pid][i]}</td>
                ))}
                <td
                  onMouseEnter={onHoverAchievements ? () => onHoverAchievements(
                    `Player ${displayPid(pid)} — Achievements (${totalAchv})`,
                    p.ageAchievements,
                    p.specialAchievements,
                  ) : undefined}
                  style={{
                    ...td(),
                    cursor: onHoverAchievements ? 'help' : 'default',
                    textDecoration: onHoverAchievements && totalAchv > 0 ? 'underline dotted rgba(0,0,0,0.35)' : 'none',
                    textUnderlineOffset: 2,
                  }}
                >{totalAchv}</td>
                <td style={td()}>{p.scorePile.reduce((s, id) => s + (id >= 0 ? cardById(id).age : 0), 0)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function AchievementsPanel({
  G, achievableAges, onAchieve, canAchieve, onHoverSpecial,
}: {
  G: BgioState['G'];
  achievableAges: number[];
  onAchieve: (age: number) => void;
  canAchieve: boolean;
  onHoverSpecial?: (name: string) => void;
}) {
  const claimable = new Set(achievableAges);
  return (
    <div style={panel()}>
      <div style={{ fontSize: 13, fontWeight: 700, color: textColor, marginBottom: 6 }}>
        Achievements Remaining
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: textColor, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((a) => {
          const available = G.availableAgeAchievements.includes(a);
          const can = canAchieve && claimable.has(a);
          if (!available) {
            return <span key={a} style={{ color: '#cfc6a3', textDecoration: 'line-through' }}>{a}</span>;
          }
          return (
            <button
              key={a}
              onClick={can ? () => onAchieve(a) : undefined}
              disabled={!can}
              style={{
                all: 'unset',
                cursor: can ? 'pointer' : 'default',
                color: can ? '#9c5a18' : textColor,
                fontWeight: 700,
                fontSize: 22,
                padding: '0 1px',
              }}
              title={can ? `Click to claim age ${a}` : `Age ${a} tile available`}
            >{a}</button>
          );
        })}
      </div>
      {/* All 5 specials always shown; claimed ones grey + annotated with the
       *  claimant. Hover any name to see its rule text in the DetailCard. */}
      <div style={{ marginTop: 8, fontSize: 13, color: textColor, lineHeight: 1.55 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 12, rowGap: 1 }}>
          {['Monument', 'Empire', 'World', 'Wonder', 'Universe'].map((name) => {
            const claimedBy = Object.entries(G.players).find(([, p]) =>
              p.specialAchievements.includes(name),
            )?.[0];
            const claimed = claimedBy !== undefined;
            return (
              <span
                key={name}
                onMouseEnter={onHoverSpecial ? () => onHoverSpecial(name) : undefined}
                style={{
                  cursor: onHoverSpecial ? 'help' : 'default',
                  fontWeight: 700,
                  color: claimed ? '#9a917a' : textColor,
                  textDecoration: claimed ? 'line-through' : 'none',
                }}
              >
                {name}
                {claimed && (
                  <span style={{
                    fontSize: 10, opacity: 0.75, marginLeft: 4,
                    fontWeight: 400, textDecoration: 'none',
                    display: 'inline-block',
                  }}>(P{displayPid(claimedBy)})</span>
                )}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function CardsRemainingPanel({ G }: { G: BgioState['G'] }) {
  // Match the C# layout: "1) 10  2) 9  3) 9 ..." in two rows of five.
  const rows = [[1, 2, 3, 4, 5], [6, 7, 8, 9, 10]];
  return (
    <div style={panel()}>
      <div style={{ fontSize: 13, fontWeight: 700, color: textColor, marginBottom: 4 }}>
        Cards Remaining
      </div>
      {rows.map((row, ri) => (
        <div key={ri} style={{ display: 'flex', gap: 14, fontSize: 12, color: textColor }}>
          {row.map((a) => (
            <span key={a}><strong>{a})</strong> {G.decks[a].length}</span>
          ))}
        </div>
      ))}
      <div style={{ marginTop: 6, fontSize: 10, opacity: 0.6 }}>
        Total {ALL_CARDS.length} cards in catalog.
      </div>
    </div>
  );
}
