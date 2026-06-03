// Game shell — owns the bgio state, drives action dispatch through the
// innovationAdapter (Option-A wrap of boardgame.io's reducer). Hotseat: both
// players share the tab, the "current actor" handles each move. This is also
// the natural seam for Phase 4: swap useState for the framework's `useGame`
// and the rest of the UI stays identical.

import { useCallback, useState } from 'react';
import { innovationAdapter as A, initialBgioState, type BgioState } from '../adapter/innovationAdapter';
import { cardById } from '../card-data';
import { score, highestTopAge, topCard } from '../engine/mechanics';
import type { Color, ChoiceResponse } from '../engine/types';
import { PlayerBoard, Hand } from './Board';
import { ChoicePrompt } from './Choice';

interface Props { numPlayers: number; }

export function Game({ numPlayers }: Props) {
  const [state, setState] = useState<BgioState>(() => initialBgioState(numPlayers));
  const [reseedNonce, setReseedNonce] = useState(0);

  const actor = A.currentActor(state);
  const gameover = state.ctx.gameover;
  const G = state.G;
  const inDogma = G.pendingChoice !== null;

  const apply = useCallback((action: Parameters<typeof A.applyAction>[1]) => {
    if (actor === null) return;
    try {
      const next = A.applyAction(state, action, actor);
      setState(next);
    } catch (e) {
      console.error('apply error', action, e);
    }
  }, [actor, state]);

  const onDraw = () => apply({ kind: 'draw' });
  const onMeld = (handIndex: number) => apply({ kind: 'meld', handIndex });
  const onDogma = (color: Color) => apply({ kind: 'dogma', color });
  const onAchieve = (age: number) => apply({ kind: 'achieve', age });
  const onResolveChoice = (response: ChoiceResponse) =>
    apply({ kind: 'resolveChoice', response });

  const onNewGame = () => {
    setReseedNonce((n) => n + 1);
    setState(initialBgioState(numPlayers));
  };

  // Per-player legal actions for the current actor.
  const legal = actor !== null ? A.legalActions(state, actor) : [];
  const dogmaColors = new Set<Color>(
    legal.filter((a) => a.kind === 'dogma').map((a) => (a as { color: Color }).color),
  );
  const achievableAges = legal
    .filter((a) => a.kind === 'achieve')
    .map((a) => (a as { age: number }).age);
  const canDraw = legal.some((a) => a.kind === 'draw');
  const playerIds = Object.keys(G.players);

  return (
    <div style={{
      maxWidth: 1200, margin: '0 auto', padding: '16px 20px',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <TurnHud
        state={state}
        actor={actor}
        achievableAges={achievableAges}
        onNewGame={onNewGame}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {playerIds.map((pid) => (
          <PlayerBoard
            key={`${pid}-${reseedNonce}`}
            G={G}
            playerId={pid}
            label={`Player ${pid}${pid === actor ? ' — your turn' : ''}`}
            onActivateDogma={pid === actor && !inDogma ? onDogma : undefined}
            dogmaColors={pid === actor && !inDogma ? dogmaColors : undefined}
            isCurrent={pid === actor}
          />
        ))}
      </div>

      {actor !== null && (
        <section style={panelStyle()}>
          <h3 style={panelHeaderStyle()}>Hand — Player {actor}</h3>
          <Hand
            cards={G.players[actor].hand}
            onMeld={!inDogma ? onMeld : undefined}
          />
          <ActionBar
            canDraw={canDraw && !inDogma}
            achievableAges={!inDogma ? achievableAges : []}
            onDraw={onDraw}
            onAchieve={onAchieve}
          />
        </section>
      )}

      {gameover && (
        <GameOverBanner
          winners={gameover.winners}
          reason={gameover.reason}
          onNewGame={onNewGame}
        />
      )}

      {G.pendingChoice && actor !== null && (
        <ChoicePrompt pc={G.pendingChoice} onSubmit={onResolveChoice} />
      )}
    </div>
  );
}

function TurnHud({
  state, actor, achievableAges, onNewGame,
}: {
  state: BgioState;
  actor: string | null;
  achievableAges: number[];
  onNewGame: () => void;
}) {
  const G = state.G;
  const turn = state.ctx.turn;
  const inDogma = G.pendingChoice !== null;
  return (
    <header style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '4px 0', borderBottom: '1px solid #272a37',
    }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Innovation</h1>
        <div style={{ fontSize: 12, opacity: 0.7 }}>
          Turn {turn}
          {' · '}
          Active: <strong>{state.ctx.currentPlayer}</strong>
          {' · '}
          Actions left: <strong>{G.actionsRemaining}</strong>
          {actor !== state.ctx.currentPlayer && actor !== null && (
            <> · Waiting on <strong>Player {actor}</strong> {inDogma && '(choice)'}</>
          )}
          {achievableAges.length > 0 && (
            <> · Can claim age {achievableAges.join(',')}</>
          )}
        </div>
      </div>
      <button onClick={onNewGame} style={{
        padding: '6px 12px', borderRadius: 4, border: '1px solid #4a4e5e',
        background: '#2d2f3a', color: '#fff', cursor: 'pointer', fontSize: 12,
      }}>New game</button>
    </header>
  );
}

function ActionBar({
  canDraw, achievableAges, onDraw, onAchieve,
}: {
  canDraw: boolean;
  achievableAges: number[];
  onDraw: () => void;
  onAchieve: (age: number) => void;
}) {
  return (
    <div style={{
      display: 'flex', gap: 8, marginTop: 12, alignItems: 'center',
      borderTop: '1px solid #272a37', paddingTop: 12,
    }}>
      <button onClick={onDraw} disabled={!canDraw} style={actionButtonStyle(!canDraw)}>
        Draw
      </button>
      {achievableAges.length === 0 ? (
        <button disabled style={actionButtonStyle(true)}>Achieve</button>
      ) : (
        achievableAges.map((age) => (
          <button key={age} onClick={() => onAchieve(age)} style={actionButtonStyle()}>
            Claim age {age}
          </button>
        ))
      )}
      <span style={{ fontSize: 11, opacity: 0.55, marginLeft: 'auto' }}>
        Meld: click a hand card. Dogma: click one of your highlighted piles.
      </span>
    </div>
  );
}

function GameOverBanner({
  winners, reason, onNewGame,
}: {
  winners: string[];
  reason: string;
  onNewGame: () => void;
}) {
  return (
    <div style={{
      padding: '14px 18px', borderRadius: 8, marginTop: 10,
      background: '#243043', border: '1px solid #4a5d80',
    }}>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
        Game over — {winners.length === 1 ? `Player ${winners[0]} wins` : `tied: ${winners.join(', ')}`}
      </div>
      <div style={{ fontSize: 13, opacity: 0.8 }}>{reason}</div>
      <button onClick={onNewGame} style={{
        marginTop: 8, padding: '6px 14px', borderRadius: 4,
        border: '1px solid #4a4e5e', background: '#3b56a6', color: '#fff',
        cursor: 'pointer', fontSize: 13, fontWeight: 600,
      }}>New game</button>
    </div>
  );
}

function panelStyle(): React.CSSProperties {
  return {
    padding: '10px 14px', borderRadius: 8,
    background: '#1c2030', border: '1px solid #2c3046',
  };
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

// Silence the unused-helper warning if topCard / cardById / score / highestTopAge
// don't end up referenced in production runs. They're available for future
// per-player views (Phase 4 redaction).
void topCard; void cardById; void score; void highestTopAge;
