// Lobby — light theme matching the in-game C# look.

import { useState } from 'react';
import { Game as HotseatGame } from './Game';
import { createGame, type CreateGameResult } from '../online/client';
import { pageBg, panelBg, textColor, cardBorder, displayPid } from './colors';

export function Lobby() {
  const [numPlayers, setNumPlayers] = useState(2);
  const [mode, setMode] = useState<'menu' | 'creating' | 'hotseat' | 'solo' | 'invites'>('menu');
  const [result, setResult] = useState<CreateGameResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onCreate() {
    setError(null); setMode('creating');
    try {
      const r = await createGame(numPlayers);
      setResult(r); setMode('invites');
    } catch (e) { setError((e as Error)?.message ?? String(e)); setMode('menu'); }
  }

  if (mode === 'hotseat') return <HotseatGame numPlayers={numPlayers} />;
  if (mode === 'solo') {
    const aiSeats = new Set<string>(
      Array.from({ length: numPlayers - 1 }, (_, i) => String(i + 1)),
    );
    return <HotseatGame numPlayers={numPlayers} aiSeats={aiSeats} />;
  }
  if (mode === 'invites' && result) {
    return <Invites result={result} onBack={() => { setMode('menu'); setResult(null); }} />;
  }

  return (
    <Page>
      <div style={panelStyle()}>
        <h1 style={{ margin: '0 0 4px', fontSize: 28, fontWeight: 700 }}>Innovation</h1>
        <p style={{ margin: '0 0 22px', opacity: 0.7, fontSize: 13 }}>
          TypeScript port of the C# desktop game. Async multiplayer, hotseat, or solo vs AI.
        </p>

        <section style={{ marginBottom: 22 }}>
          <h2 style={h2()}>Play online</h2>
          <p style={muted()}>Create a game, share one invite link per seat with your opponents.</p>
          <div style={row()}>
            <label style={{ fontSize: 13, opacity: 0.85 }}>Players</label>
            <select value={numPlayers} onChange={(e) => setNumPlayers(Number(e.target.value))} style={select()}>
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={4}>4</option>
            </select>
            <button onClick={onCreate} disabled={mode === 'creating'} style={primaryButton(mode === 'creating')}>
              {mode === 'creating' ? 'Creating…' : 'Create online game'}
            </button>
          </div>
          {error && (
            <div style={{ marginTop: 10, color: '#9c2c2c', fontSize: 12 }}>
              Couldn’t reach the server: {error}.
            </div>
          )}
        </section>

        <section style={{ borderTop: '1px solid rgba(0,0,0,0.12)', paddingTop: 22 }}>
          <h2 style={h2()}>Single device</h2>
          <p style={muted()}>
            <strong>Solo vs AI</strong> — you’re Player 1, the greedy AI fills the rest.
            {' '}<strong>Hotseat</strong> — humans share this tab.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => setMode('solo')} style={primaryButton()}>
              Solo vs AI ({numPlayers - 1} opponent{numPlayers - 1 === 1 ? '' : 's'})
            </button>
            <button onClick={() => setMode('hotseat')} style={secondaryButton()}>
              Hotseat ({numPlayers} players)
            </button>
          </div>
        </section>
      </div>
    </Page>
  );
}

function Invites({ result, onBack }: { result: CreateGameResult; onBack: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  async function copy(text: string, key: string) {
    try { await navigator.clipboard.writeText(text); setCopied(key); }
    catch { /* ignore */ }
  }
  return (
    <Page>
      <div style={panelStyle()}>
        <h1 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 700 }}>Game created</h1>
        <p style={{ margin: '0 0 18px', opacity: 0.7, fontSize: 13 }}>
          Game id: <code>{result.gameId}</code>
        </p>
        <p style={muted()}>One invite URL per seat. Send each to its player.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          {Object.entries(result.invites).map(([pid, url]) => (
            <div key={pid} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: '#fbf7da', border: `1px solid ${cardBorder}`, borderRadius: 4,
              padding: '8px 12px',
            }}>
              <span style={{ minWidth: 78, fontWeight: 600, fontSize: 13 }}>Player {displayPid(pid)}</span>
              <code style={{
                flex: 1, fontSize: 11, overflowX: 'auto', whiteSpace: 'nowrap',
                opacity: 0.85, color: textColor,
              }}>{url}</code>
              <a href={url} target="_blank" rel="noreferrer" style={linkButton()}>Open</a>
              <button onClick={() => copy(url, pid)} style={secondaryButton(true)}>
                {copied === pid ? 'Copied!' : 'Copy'}
              </button>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 24 }}>
          <button onClick={onBack} style={secondaryButton()}>Back</button>
        </div>
      </div>
    </Page>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh', background: pageBg, color: textColor,
      fontFamily: '"Segoe UI", system-ui, sans-serif',
      paddingTop: 60,
    }}>{children}</div>
  );
}

function panelStyle(): React.CSSProperties {
  return {
    maxWidth: 720, margin: '0 auto', padding: '28px 32px',
    background: panelBg, border: `1px solid ${cardBorder}`, borderRadius: 8,
  };
}
function h2(): React.CSSProperties { return { margin: '0 0 8px', fontSize: 16, fontWeight: 700 }; }
function muted(): React.CSSProperties { return { fontSize: 12, opacity: 0.75, margin: '0 0 10px' }; }
function row(): React.CSSProperties { return { display: 'flex', gap: 10, alignItems: 'center' }; }
function select(): React.CSSProperties {
  return { padding: '6px 10px', borderRadius: 4, background: '#fff', color: textColor, border: `1px solid ${cardBorder}`, fontSize: 13 };
}
function primaryButton(disabled?: boolean): React.CSSProperties {
  return {
    padding: '8px 16px', borderRadius: 4,
    background: disabled ? '#ddd9c5' : '#a98a4b',
    color: disabled ? '#888' : '#fff',
    border: `1px solid ${cardBorder}`, cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 13, fontWeight: 600,
  };
}
function secondaryButton(compact?: boolean): React.CSSProperties {
  return {
    padding: compact ? '4px 10px' : '6px 14px', borderRadius: 4,
    background: '#e8e3c8', color: textColor,
    border: `1px solid ${cardBorder}`, cursor: 'pointer',
    fontSize: compact ? 12 : 13, fontWeight: 600,
  };
}
function linkButton(): React.CSSProperties {
  return {
    padding: '4px 10px', borderRadius: 4, background: '#e8e3c8', color: textColor,
    border: `1px solid ${cardBorder}`, textDecoration: 'none', fontSize: 12, fontWeight: 600,
  };
}
