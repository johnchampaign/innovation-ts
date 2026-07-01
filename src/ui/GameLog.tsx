// Shared game-log panel + log-line formatter, used by BOTH game shells
// (hotseat `Game.tsx` and online `OnlineGame.tsx`). Extracted alongside the
// sidebar Panels so the two views stay in lockstep.

import { useEffect, useRef } from 'react';
import { cardById } from '../card-data';
import type { BgioState, InnovationAction } from '../adapter/innovationAdapter';
import { panel } from './Board';
import { textColor, cardBorder, displayPid } from './colors';

export interface LogEntry { turn: number; text: string; }

/** Translate an action + the pre-action G into a readable one-liner like
 *  "P1 melds A1 The Wheel (green)". Returns null for entries too noisy to
 *  log (e.g. individual choice resolutions). */
export function describeAction(
  action: InnovationAction,
  who: string,
  preG: BgioState['G'],
): string | null {
  const p = preG.players[who];
  switch (action.kind) {
    case 'draw': return `P${displayPid(who)} draws.`;
    case 'meld': {
      const id = p.hand[action.handIndex];
      if (id === undefined || id < 0) return `P${displayPid(who)} melds.`;
      const c = cardById(id);
      return `P${displayPid(who)} melds A${c.age} ${c.title} (${c.color}).`;
    }
    case 'dogma': {
      const id = preG.players[who].piles[action.color].cards[0];
      if (id === undefined) return `P${displayPid(who)} activates dogma (${action.color}).`;
      const c = cardById(id);
      return `P${displayPid(who)} activates ${c.title} (${c.color}).`;
    }
    case 'achieve': return `P${displayPid(who)} claims Age ${action.age} achievement.`;
    case 'resolveChoice': return null; // too noisy
  }
  return null;
}

export function GameLogPanel({
  log, onReport, onUploadLogs,
}: {
  log: LogEntry[];
  onReport?: () => void;
  onUploadLogs?: () => void;
}) {
  // Auto-scroll to the most recent entry whenever the log grows.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log.length]);
  return (
    <div style={{
      ...panel(),
      display: 'flex', flexDirection: 'column',
      // Fixed height matches the DetailCard's top-strip slot so the panel
      // doesn't grow with the log — the inner div scrolls instead.
      height: 200,
      background: '#fbf7da',
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 4,
      }}>
        <div style={{
          fontSize: 11, color: textColor, opacity: 0.65,
          fontFamily: 'ui-monospace, "Cascadia Mono", monospace',
        }}>[log] Game log ({log.length})</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {onReport && (
            <button onClick={onReport} style={{
              padding: '2px 8px', borderRadius: 3,
              border: `1px solid ${cardBorder}`, background: '#e8e3c8',
              color: textColor, cursor: 'pointer', fontSize: 11, fontWeight: 600,
            }}>Report a problem</button>
          )}
          {onUploadLogs && (
            <button onClick={onUploadLogs} style={{
              padding: '2px 8px', borderRadius: 3,
              border: `1px solid ${cardBorder}`, background: '#e8e3c8',
              color: textColor, cursor: 'pointer', fontSize: 11, fontWeight: 600,
            }}>Upload logs</button>
          )}
        </div>
      </div>
      <div
        ref={scrollRef}
        style={{
          flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden',
          fontSize: 11,
          fontFamily: 'ui-monospace, "Cascadia Mono", monospace',
          color: textColor, lineHeight: 1.45,
          background: '#fff', border: `1px solid ${cardBorder}`, borderRadius: 3,
          padding: '4px 6px',
        }}
      >
        {log.map((e, i) => (
          <div key={i}>· {e.text}</div>
        ))}
      </div>
    </div>
  );
}
