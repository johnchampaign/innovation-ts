// Lobby — landing page when no ?game=&token= is in the URL.
//
//   "Create game" → POST /api/games → shows one invite URL per seat to
//   share with players (or open in different tabs/devices). Each URL embeds
//   the player's token; clicking it lands them in <OnlineGame>.
//
//   Hotseat shortcut — for solo testing, still works inline without the API
//   (Phase-3 component).

import { useState } from 'react';
import { Game as HotseatGame } from './Game';
import { createGame, type CreateGameResult } from '../online/client';

export function Lobby() {
  const [numPlayers, setNumPlayers] = useState(2);
  const [mode, setMode] = useState<'menu' | 'creating' | 'hotseat' | 'solo' | 'invites'>('menu');
  const [result, setResult] = useState<CreateGameResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onCreate() {
    setError(null); setMode('creating');
    try {
      const r = await createGame(numPlayers);
      setResult(r);
      setMode('invites');
    } catch (e) {
      setError((e as Error)?.message ?? String(e));
      setMode('menu');
    }
  }

  if (mode === 'hotseat') {
    return <HotseatGame numPlayers={numPlayers} />;
  }

  if (mode === 'solo') {
    // Solo vs AI — you are player 0; seats 1..N-1 are the greedy AI.
    const aiSeats = new Set<string>(
      Array.from({ length: numPlayers - 1 }, (_, i) => String(i + 1)),
    );
    return <HotseatGame numPlayers={numPlayers} aiSeats={aiSeats} />;
  }

  if (mode === 'invites' && result) {
    return <Invites result={result} onBack={() => { setMode('menu'); setResult(null); }} />;
  }

  return (
    <div style={panel()}>
      <h1 style={{ margin: '0 0 6px', fontSize: 28 }}>Innovation</h1>
      <p style={{ margin: '0 0 22px', opacity: 0.72 }}>TypeScript port — async multiplayer + hotseat.</p>

      <section style={{ marginBottom: 22 }}>
        <h2 style={h2()}>Play online</h2>
        <p style={muted()}>Create a game, share one invite link per seat with your opponents (or open them in separate tabs to test).</p>
        <div style={row()}>
          <label style={muted()}>Players</label>
          <select
            value={numPlayers}
            onChange={(e) => setNumPlayers(Number(e.target.value))}
            style={select()}
          >
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
          </select>
          <button onClick={onCreate} disabled={mode === 'creating'} style={primaryButton(mode === 'creating')}>
            {mode === 'creating' ? 'Creating…' : 'Create online game'}
          </button>
        </div>
        {error && (
          <div style={{ marginTop: 10, color: '#ff9492', fontSize: 13 }}>
            Couldn’t reach the server: {error}. If you’re running locally, make sure the API is
            up (<code>npx wrangler pages dev -- npm run dev</code>) and Supabase env vars are set.
          </div>
        )}
      </section>

      <section style={{ borderTop: '1px solid #2c3046', paddingTop: 22 }}>
        <h2 style={h2()}>Single device</h2>
        <p style={muted()}>
          <strong>Solo vs AI</strong> — you’re Player 0, the greedy AI fills the rest.
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
  );
}

function Invites({ result, onBack }: { result: CreateGameResult; onBack: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  async function copy(text: string, key: string) {
    try { await navigator.clipboard.writeText(text); setCopied(key); }
    catch { /* ignore */ }
  }
  return (
    <div style={panel()}>
      <h1 style={{ margin: '0 0 6px', fontSize: 26 }}>Game created</h1>
      <p style={{ margin: '0 0 18px', opacity: 0.72 }}>
        Game id: <code>{result.gameId}</code>
      </p>
      <p style={muted()}>One invite URL per seat. Send each to its player (or open in separate tabs).</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
        {Object.entries(result.invites).map(([pid, url]) => (
          <div key={pid} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: '#1c2030', border: '1px solid #2c3046', borderRadius: 6,
            padding: '8px 12px',
          }}>
            <span style={{ minWidth: 78, fontWeight: 600 }}>Player {pid}</span>
            <code style={{
              flex: 1, fontSize: 12, overflowX: 'auto', whiteSpace: 'nowrap',
              opacity: 0.85,
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
  );
}

function panel(): React.CSSProperties {
  return {
    maxWidth: 720, margin: '60px auto 40px', padding: '28px 32px',
    background: '#161821', border: '1px solid #272a37', borderRadius: 10,
    fontFamily: 'system-ui, sans-serif', color: '#e8e6ef',
  };
}
function h2(): React.CSSProperties { return { margin: '0 0 8px', fontSize: 17, fontWeight: 600 }; }
function muted(): React.CSSProperties { return { fontSize: 13, opacity: 0.7, margin: '0 0 10px' }; }
function row(): React.CSSProperties { return { display: 'flex', gap: 10, alignItems: 'center' }; }
function select(): React.CSSProperties {
  return { padding: '6px 10px', borderRadius: 4, background: '#1c2030', color: '#e8e6ef', border: '1px solid #3a3d4a', fontSize: 13 };
}
function primaryButton(disabled?: boolean): React.CSSProperties {
  return {
    padding: '8px 16px', borderRadius: 4,
    background: disabled ? '#2a2c34' : '#3b56a6', color: disabled ? '#666' : '#fff',
    border: '1px solid #4a4e5e', cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 13, fontWeight: 600,
  };
}
function secondaryButton(compact?: boolean): React.CSSProperties {
  return {
    padding: compact ? '4px 10px' : '6px 14px', borderRadius: 4,
    background: '#2d2f3a', color: '#fff',
    border: '1px solid #4a4e5e', cursor: 'pointer', fontSize: compact ? 12 : 13, fontWeight: 600,
  };
}
function linkButton(): React.CSSProperties {
  return {
    padding: '4px 10px', borderRadius: 4, background: '#2d2f3a', color: '#fff',
    border: '1px solid #4a4e5e', textDecoration: 'none', fontSize: 12, fontWeight: 600,
  };
}
