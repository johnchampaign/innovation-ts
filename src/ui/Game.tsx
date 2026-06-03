// Game shell. Layout mirrors C# WPF MainWindow.xaml:
//
//   TOP STRIP (~280h): [ DetailCard 340w | Current player banner + log
//     summary (flex) | game log 380w ]
//   MAIN: [ sidebar 260w (view-card, icon-totals, achievements, cards
//     remaining) | main column: Your Board, Your Hand + Score, opponent rows ]
//
// Hover any card to see it in DetailCard; click to interact (meld / dogma).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { innovationAdapter as A, initialBgioState, type BgioState } from '../adapter/innovationAdapter';
import { ALL_CARDS, cardById } from '../card-data';
import type { Color, ChoiceResponse, IconName } from '../engine/types';
import { countIcons } from '../engine/icons';
import { YourBoard, OpponentBoard, Hand, ScorePileStrip, panel, sectionTitle } from './Board';
import { ChoicePrompt } from './Choice';
import { DetailCard } from './DetailCard';
import { IconBadge } from './Icon';
import { pickAction } from '../ai/greedy';
import { pageBg, textColor, cardBorder } from './colors';

interface Props {
  numPlayers: number;
  aiSeats?: ReadonlySet<string>;
}

interface LogEntry { turn: number; text: string; }

export function Game({ numPlayers, aiSeats }: Props) {
  const ai = aiSeats ?? new Set<string>();
  const [state, setState] = useState<BgioState>(() => initialBgioState(numPlayers));
  const [hoverCardId, setHoverCardId] = useState<number | null>(null);
  const [log, setLog] = useState<LogEntry[]>([{ turn: 0, text: '(setup) Initial hands dealt.' }]);

  const actor = A.currentActor(state);
  const gameover = state.ctx.gameover;
  const G = state.G;
  const inDogma = G.pendingChoice !== null;

  const apply = useCallback((action: Parameters<typeof A.applyAction>[1], actorOverride?: string) => {
    const who = actorOverride ?? actor;
    if (who === null) return;
    try {
      const before = state;
      const next = A.applyAction(state, action, who);
      setState(next);
      const desc = describeAction(action, who, before.G);
      if (desc) setLog((L) => [...L, { turn: next.ctx.turn, text: desc }].slice(-30));
    } catch (e) { console.error('apply', action, e); }
  }, [actor, state]);

  // AI auto-play.
  useEffect(() => {
    if (gameover || actor === null || !ai.has(actor)) return;
    const id = setTimeout(() => {
      try {
        const before = state;
        const action = pickAction(state, actor);
        const next = A.applyAction(state, action, actor);
        setState(next);
        const desc = describeAction(action, actor, before.G);
        if (desc) setLog((L) => [...L, { turn: next.ctx.turn, text: desc }].slice(-30));
      } catch (e) { console.error('AI', e); }
    }, 400);
    return () => clearTimeout(id);
  }, [state, actor, ai, gameover]);

  const onDraw = () => apply({ kind: 'draw' });
  const onMeld = (handIndex: number) => apply({ kind: 'meld', handIndex });
  const onDogma = (color: Color) => apply({ kind: 'dogma', color });
  const onAchieve = (age: number) => apply({ kind: 'achieve', age });
  const onResolveChoice = (response: ChoiceResponse) => apply({ kind: 'resolveChoice', response });
  const onNewGame = () => { setState(initialBgioState(numPlayers)); setLog([{ turn: 0, text: '(setup) New game.' }]); setHoverCardId(null); };

  const legal = actor !== null ? A.legalActions(state, actor) : [];
  const dogmaColors = new Set<Color>(legal.filter((a) => a.kind === 'dogma').map((a) => (a as { color: Color }).color));
  const achievableAges = legal.filter((a) => a.kind === 'achieve').map((a) => (a as { age: number }).age);
  const canDraw = legal.some((a) => a.kind === 'draw');

  // In solo-vs-AI, "you" is always player 0; in hotseat we follow the actor.
  const viewerId = ai.size > 0 ? '0' : actor ?? '0';
  const opponents = Object.keys(G.players).filter((pid) => pid !== viewerId);

  // Default hover preview: when nothing else is hovered, show the top card of
  // a randomish slot — useful for showing SOMETHING in the detail panel.
  const detailCard = useMemo(() => {
    if (hoverCardId !== null) return hoverCardId;
    const p = G.players[viewerId];
    if (p.hand.length > 0 && p.hand[0] >= 0) return p.hand[0];
    for (const c of (['yellow','red','purple','blue','green'] as Color[])) {
      const top = p.piles[c].cards[0];
      if (top !== undefined && top >= 0) return top;
    }
    return null;
  }, [hoverCardId, G, viewerId]);

  return (
    <div style={{
      minHeight: '100vh', background: pageBg, color: textColor,
      fontFamily: '"Segoe UI", system-ui, sans-serif', padding: '8px 10px',
    }}>
      {/* ============================= TOP STRIP ============================= */}
      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr 380px', gap: 10, marginBottom: 10 }}>
        <DetailCard cardId={detailCard} />
        <CurrentPlayerPanel
          state={state}
          actor={actor}
          viewerId={viewerId}
          gameover={gameover}
          inDogma={inDogma}
          ai={ai}
          onNewGame={onNewGame}
        />
        <GameLogPanel log={log} />
      </div>

      {/* ============================= MAIN ROW ============================= */}
      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 10 }}>
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <IconTotalsPanel G={G} viewerId={viewerId} />
          <AchievementsPanel
            G={G}
            achievableAges={achievableAges}
            onAchieve={onAchieve}
            canAchieve={actor === viewerId && !inDogma}
          />
          <CardsRemainingPanel G={G} />
        </aside>

        <main style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <section style={panel()}>
            <YourBoard
              G={G}
              playerId={viewerId}
              onActivateDogma={actor === viewerId && !inDogma ? onDogma : undefined}
              dogmaColors={actor === viewerId && !inDogma ? dogmaColors : undefined}
              onHoverCard={setHoverCardId}
            />
          </section>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <section style={panel()}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
                <h2 style={sectionTitle()}>Your Hand</h2>
                <span style={{ fontSize: 11, opacity: 0.7 }}>
                  {G.players[viewerId].hand.length} card{G.players[viewerId].hand.length === 1 ? '' : 's'}
                </span>
              </div>
              <Hand
                cards={G.players[viewerId].hand}
                onMeld={actor === viewerId && !inDogma ? onMeld : undefined}
                onHoverCard={setHoverCardId}
              />
              <ActionBar
                canDraw={canDraw && actor === viewerId && !inDogma}
                onDraw={onDraw}
              />
            </section>
            <section style={panel()}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
                <h2 style={sectionTitle()}>Your Score Pile</h2>
                <span style={{ fontSize: 11, opacity: 0.7 }}>
                  {G.players[viewerId].scorePile.length} card{G.players[viewerId].scorePile.length === 1 ? '' : 's'}
                </span>
              </div>
              <ScorePileStrip cards={G.players[viewerId].scorePile} onHoverCard={setHoverCardId} />
            </section>
          </div>

          <section style={panel()}>
            <h2 style={{ ...sectionTitle(), marginBottom: 6 }}>
              Opponent Board <span style={{ fontWeight: 400, fontSize: 11, opacity: 0.65 }}>(click 'Size' label to see the whole stack)</span>
            </h2>
            {opponents.map((pid) => (
              <OpponentBoard
                key={pid}
                G={G}
                playerId={pid}
                label={`Player ${pid}${pid === actor ? ' (turn)' : ''}${ai.has(pid) ? ' [AI]' : ''}`}
                onHoverCard={setHoverCardId}
              />
            ))}
          </section>

          {gameover && (
            <GameOverBanner
              winners={gameover.winners}
              reason={String(gameover.reason)}
              onNewGame={onNewGame}
            />
          )}
        </main>
      </div>

      {G.pendingChoice && actor !== null && (
        <ChoicePrompt pc={G.pendingChoice} onSubmit={onResolveChoice} />
      )}
    </div>
  );
}

// --------------------------------------------------------------------------
// Top-strip panels.
// --------------------------------------------------------------------------

function CurrentPlayerPanel({
  state, actor, viewerId, gameover, inDogma, ai, onNewGame,
}: {
  state: BgioState;
  actor: string | null;
  viewerId: string;
  gameover: BgioState['ctx']['gameover'];
  inDogma: boolean;
  ai: ReadonlySet<string>;
  onNewGame: () => void;
}) {
  const G = state.G;
  const headline = gameover
    ? `Game Over — ${gameover.winners.length === 1 ? `Player ${gameover.winners[0]} wins` : `tied: ${gameover.winners.join(', ')}`}`
    : `Current Player: ${state.ctx.currentPlayer}${ai.has(state.ctx.currentPlayer) ? ' [AI]' : ''}`;
  const status = gameover
    ? String(gameover.reason)
    : actor === null
      ? '(no actor)'
      : actor === viewerId
        ? `Your turn — ${G.actionsRemaining} action(s) left.${inDogma ? ' Resolve the prompt below.' : ''}`
        : `Player ${actor}${ai.has(actor) ? ' [AI]' : ''}'s turn${inDogma ? ' (resolving a prompt)' : ''} — ${G.actionsRemaining} action(s) left.`;
  return (
    <div style={{
      ...panel(),
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      minHeight: 200, background: '#fbf7da',
    }}>
      <div>
        <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 2 }}>Turn {state.ctx.turn}</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: textColor }}>{headline}</div>
        <div style={{ marginTop: 6, fontSize: 13, color: textColor }}>{status}</div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
        <a href="/" style={linkButton()}>← Lobby</a>
        <button onClick={onNewGame} style={smallButton()}>New game</button>
      </div>
    </div>
  );
}

function GameLogPanel({ log }: { log: LogEntry[] }) {
  return (
    <div style={{
      ...panel(),
      display: 'flex', flexDirection: 'column',
      minHeight: 200, background: '#fbf7da',
    }}>
      <div style={{
        fontSize: 11, color: textColor, opacity: 0.65, marginBottom: 4,
        fontFamily: 'ui-monospace, "Cascadia Mono", monospace',
      }}>[log] Game log</div>
      <div style={{
        flex: 1, overflow: 'auto', fontSize: 11,
        fontFamily: 'ui-monospace, "Cascadia Mono", monospace',
        color: textColor, lineHeight: 1.45,
        background: '#fff', border: `1px solid ${cardBorder}`, borderRadius: 3,
        padding: '4px 6px',
      }}>
        {log.map((e, i) => (
          <div key={i}>· {e.text}</div>
        ))}
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Sidebar panels.
// --------------------------------------------------------------------------

function IconTotalsPanel({ G, viewerId }: { G: BgioState['G']; viewerId: string }) {
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
            return (
              <tr key={pid} style={{ background: pid === viewerId ? 'rgba(0,0,0,0.04)' : 'transparent' }}>
                <td style={{ ...td(), fontWeight: 600, color: textColor }}>P{pid}</td>
                {icons.map((i) => (
                  <td key={i} style={{ ...td(), color: cellColor(i, pid), fontWeight: 600 }}>{totals[pid][i]}</td>
                ))}
                <td style={td()}>{p.ageAchievements.length + p.specialAchievements.length}</td>
                <td style={td()}>{p.scorePile.reduce((s, id) => s + (id >= 0 ? cardById(id).age : 0), 0)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AchievementsPanel({
  G, achievableAges, onAchieve, canAchieve,
}: {
  G: BgioState['G'];
  achievableAges: number[];
  onAchieve: (age: number) => void;
  canAchieve: boolean;
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
      <div style={{ marginTop: 8, fontSize: 12, color: textColor, lineHeight: 1.5 }}>
        {G.availableSpecialAchievements.length === 0
          ? <span style={{ opacity: 0.6 }}>(all specials claimed)</span>
          : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 8 }}>
              {G.availableSpecialAchievements.map((name) => <span key={name}>{name}</span>)}
            </div>
          )
        }
      </div>
    </div>
  );
}

function CardsRemainingPanel({ G }: { G: BgioState['G'] }) {
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

// --------------------------------------------------------------------------
// Bottom-strip action bar + game over.
// --------------------------------------------------------------------------

function ActionBar({ canDraw, onDraw }: { canDraw: boolean; onDraw: () => void }) {
  return (
    <div style={{
      display: 'flex', gap: 8, marginTop: 10,
      paddingTop: 8, borderTop: '1px solid rgba(0,0,0,0.12)',
      alignItems: 'center',
    }}>
      <button onClick={onDraw} disabled={!canDraw} style={actionButton(!canDraw)}>Draw</button>
      <span style={{ fontSize: 11, opacity: 0.7 }}>
        Meld: click a hand card. Dogma: click a board pile. Achieve: click a yellow age.
      </span>
    </div>
  );
}

function GameOverBanner({
  winners, reason, onNewGame,
}: { winners: string[]; reason: string; onNewGame: () => void }) {
  return (
    <div style={{
      padding: '14px 18px', borderRadius: 4,
      background: '#e8d99a', border: '1px solid #a98a4b',
      color: textColor,
    }}>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
        Game over — {winners.length === 1 ? `Player ${winners[0]} wins` : `tied: ${winners.join(', ')}`}
      </div>
      <div style={{ fontSize: 13, opacity: 0.8 }}>{reason}</div>
      <button onClick={onNewGame} style={{ ...actionButton(), marginTop: 8 }}>New game</button>
    </div>
  );
}

// --------------------------------------------------------------------------
// Log line generation. Translates an action + pre-state into a readable
// one-liner like "P1 melds A1 The Wheel(Green)".
// --------------------------------------------------------------------------

function describeAction(
  action: Parameters<typeof A.applyAction>[1],
  who: string,
  preG: BgioState['G'],
): string | null {
  const p = preG.players[who];
  switch (action.kind) {
    case 'draw': return `P${who} draws.`;
    case 'meld': {
      const id = p.hand[action.handIndex];
      if (id === undefined || id < 0) return `P${who} melds.`;
      const c = cardById(id);
      return `P${who} melds A${c.age} ${c.title} (${c.color}).`;
    }
    case 'dogma': {
      const id = preG.players[who].piles[action.color].cards[0];
      if (id === undefined) return `P${who} activates dogma (${action.color}).`;
      const c = cardById(id);
      return `P${who} activates ${c.title} (${c.color}).`;
    }
    case 'achieve': return `P${who} claims Age ${action.age} achievement.`;
    case 'resolveChoice': return null; // too noisy
  }
  return null;
}

// --------------------------------------------------------------------------
// Buttons.
// --------------------------------------------------------------------------

function th(): React.CSSProperties { return { textAlign: 'center', fontWeight: 600, padding: '2px 3px' }; }
function td(): React.CSSProperties { return { textAlign: 'center', padding: '2px 3px' }; }
function actionButton(disabled?: boolean): React.CSSProperties {
  return {
    padding: '6px 14px', borderRadius: 4,
    border: `1px solid ${cardBorder}`,
    background: disabled ? '#ddd9c5' : '#a98a4b',
    color: disabled ? '#888' : '#fff',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 13, fontWeight: 600,
  };
}
function smallButton(): React.CSSProperties {
  return {
    padding: '4px 10px', borderRadius: 4,
    border: `1px solid ${cardBorder}`, background: '#e8e3c8',
    color: textColor, cursor: 'pointer', fontSize: 12, fontWeight: 600,
  };
}
function linkButton(): React.CSSProperties {
  return {
    ...smallButton(),
    textDecoration: 'none', display: 'inline-block',
  };
}
