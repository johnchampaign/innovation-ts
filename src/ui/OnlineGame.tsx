// Online game view. Same Board / Hand / ChoicePrompt as hotseat, but state
// comes from the framework's useGame hook polling the Pages Functions API.
//
// The view that arrives is already redacted for THIS player (innovationAdapter.
// viewFor blanks opponent hands etc.), so we can render it the same way as
// the hotseat — there's just one "you" and the other seats render with their
// hands shown as hidden placeholders.

import { useMemo } from 'react';
import { useGame } from 'digital-boardgame-framework/client';
import { makeClient } from '../online/client';
import { PlayerBoard, Hand } from './Board';
import { ChoicePrompt } from './Choice';
import type { Color, ChoiceResponse } from '../engine/types';

interface Props { gameId: string; token: string; }

export function OnlineGame({ gameId, token }: Props) {
  const client = useMemo(() => makeClient(gameId, token), [gameId, token]);
  const game = useGame(client, { pollMs: 2000, pauseWhenHidden: true });

  if (game.loading && !game.view) {
    return <Centered>Loading…</Centered>;
  }
  if (game.error) {
    return (
      <Centered>
        <div style={{ color: '#ff9492' }}>Error: {game.error.message}</div>
        <a href="/" style={{ color: '#7da9ff', marginTop: 10, display: 'inline-block' }}>← Back to lobby</a>
      </Centered>
    );
  }
  if (!game.view) return null;

  const G = game.view.G;
  const ctx = game.view.ctx;
  const you = game.you;
  const yourTurn = game.yourTurn;
  const inDogma = G.pendingChoice !== null;
  const youOwnChoice = inDogma && G.pendingChoice!.playerId === you;
  const gameover = ctx.gameover;

  // Translate UI clicks into action submissions.
  const submit = (action: Parameters<typeof game.submit>[0]) =>
    game.submit(action).catch((e) => console.error('submit error', e));
  const onDraw = () => submit({ kind: 'draw' });
  const onMeld = (handIndex: number) => submit({ kind: 'meld', handIndex });
  const onDogma = (color: Color) => submit({ kind: 'dogma', color });
  const onAchieve = (age: number) => submit({ kind: 'achieve', age });
  const onResolveChoice = (response: ChoiceResponse) => submit({ kind: 'resolveChoice', response });

  // Build the dogma-color set + achievable ages from server-side legalActions
  // (it's already filtered to what *you* may do given the current state).
  const legal = game.legalActions;
  const dogmaColors = new Set<Color>(
    legal.filter((a) => a.kind === 'dogma').map((a) => (a as { color: Color }).color),
  );
  const achievableAges = legal
    .filter((a) => a.kind === 'achieve')
    .map((a) => (a as { age: number }).age);
  const canDraw = legal.some((a) => a.kind === 'draw');

  const playerIds = Object.keys(G.players);
  // Active player from bgio ctx — the current "turn" owner. Different from
  // `you` (this client's seat) and from the choice owner (a sharer/demander
  // during mid-dogma pauses).
  const activeSeat = ctx.currentPlayer;

  return (
    <div style={{
      maxWidth: 1200, margin: '0 auto', padding: '16px 20px',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <header style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '4px 0', borderBottom: '1px solid #272a37',
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Innovation</h1>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Turn {ctx.turn} · You are <strong>Player {you}</strong> · Active <strong>{activeSeat}</strong>
            {yourTurn ? <span style={{ color: '#a8e0a8', marginLeft: 8 }}>(your turn)</span>
              : <span style={{ marginLeft: 8 }}>(waiting…)</span>}
            {' · '}Actions left <strong>{G.actionsRemaining}</strong>
            {achievableAges.length > 0 && yourTurn && (
              <> · Can claim {achievableAges.join(',')}</>
            )}
          </div>
        </div>
        <a href="/" style={{ color: '#7da9ff', fontSize: 13 }}>← Lobby</a>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {playerIds.map((pid) => (
          <PlayerBoard
            key={pid}
            G={G}
            playerId={pid}
            label={`Player ${pid}${pid === you ? ' (you)' : ''}${pid === activeSeat ? ' — turn' : ''}`}
            onActivateDogma={pid === you && yourTurn && !inDogma ? onDogma : undefined}
            dogmaColors={pid === you && yourTurn && !inDogma ? dogmaColors : undefined}
            isCurrent={pid === activeSeat}
          />
        ))}
      </div>

      {you !== null && (
        <section style={panelStyle()}>
          <h3 style={panelHeaderStyle()}>Hand — you</h3>
          <Hand cards={G.players[you].hand} onMeld={yourTurn && !inDogma ? onMeld : undefined} />
          <div style={{
            display: 'flex', gap: 8, marginTop: 12, alignItems: 'center',
            borderTop: '1px solid #272a37', paddingTop: 12,
          }}>
            <button onClick={onDraw} disabled={!canDraw || !yourTurn || inDogma} style={actionButtonStyle(!canDraw || !yourTurn || inDogma)}>Draw</button>
            {achievableAges.length === 0 ? (
              <button disabled style={actionButtonStyle(true)}>Achieve</button>
            ) : achievableAges.map((age) => (
              <button key={age} onClick={() => onAchieve(age)} style={actionButtonStyle()}>Claim age {age}</button>
            ))}
            <span style={{ fontSize: 11, opacity: 0.55, marginLeft: 'auto' }}>
              {yourTurn ? 'Meld: click a hand card. Dogma: click a highlighted pile.' : 'Waiting for active player'}
            </span>
          </div>
        </section>
      )}

      {gameover && (
        <div style={{
          padding: '14px 18px', borderRadius: 8, marginTop: 10,
          background: '#243043', border: '1px solid #4a5d80',
        }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
            Game over — {gameover.winners.length === 1 ? `Player ${gameover.winners[0]} wins` : `tied: ${gameover.winners.join(', ')}`}
          </div>
          <div style={{ fontSize: 13, opacity: 0.8 }}>{String(gameover.reason)}</div>
          <a href="/" style={{ color: '#7da9ff', marginTop: 10, display: 'inline-block' }}>← Lobby</a>
        </div>
      )}

      {G.pendingChoice && youOwnChoice && (
        <ChoicePrompt pc={G.pendingChoice} onSubmit={onResolveChoice} />
      )}
      {G.pendingChoice && !youOwnChoice && (
        <div style={{
          position: 'fixed', right: 16, bottom: 16,
          padding: '10px 14px', borderRadius: 6,
          background: '#1c2030', border: '1px solid #3a3d4a', maxWidth: 360,
        }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Waiting on Player {G.pendingChoice.playerId} to respond</div>
        </div>
      )}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      maxWidth: 600, margin: '80px auto', padding: 24,
      fontFamily: 'system-ui, sans-serif', color: '#e8e6ef', textAlign: 'center',
    }}>{children}</div>
  );
}

function panelStyle(): React.CSSProperties {
  return { padding: '10px 14px', borderRadius: 8, background: '#1c2030', border: '1px solid #2c3046' };
}
function panelHeaderStyle(): React.CSSProperties {
  return { margin: '0 0 8px', fontSize: 13, opacity: 0.8, fontWeight: 600 };
}
function actionButtonStyle(disabled?: boolean): React.CSSProperties {
  return {
    padding: '8px 14px', borderRadius: 4, border: '1px solid #4a4e5e',
    background: disabled ? '#2a2c34' : '#3b56a6',
    color: disabled ? '#666' : '#fff',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 13, fontWeight: 600,
  };
}
