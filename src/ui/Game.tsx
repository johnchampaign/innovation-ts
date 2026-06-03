// Game shell — owns bgio state, dispatches through innovationAdapter.
// Layout mirrors the C# WPF MainWindow.xaml: a top "current player + actions"
// strip, a left sidebar with achievements / cards-remaining / icon-totals,
// and a main area with Your Board, Your Hand + Score, and an Opponent Board
// row beneath.

import { useCallback, useEffect, useState } from 'react';
import { innovationAdapter as A, initialBgioState, type BgioState } from '../adapter/innovationAdapter';
import { ALL_CARDS } from '../card-data';
import type { Color, ChoiceResponse } from '../engine/types';
import { COLORS } from '../engine/types';
import { countIcons } from '../engine/icons';
import { YourBoard, OpponentBoard, Hand, ScorePileStrip, panel, SectionHeader } from './Board';
import { ChoicePrompt } from './Choice';
import { pickAction } from '../ai/greedy';
import { pageBg, panelBg, textColor, cardBorder, iconGlyph, colorBg } from './colors';

interface Props {
  numPlayers: number;
  aiSeats?: ReadonlySet<string>;
}

export function Game({ numPlayers, aiSeats }: Props) {
  const ai = aiSeats ?? new Set<string>();
  const [state, setState] = useState<BgioState>(() => initialBgioState(numPlayers));

  const actor = A.currentActor(state);
  const gameover = state.ctx.gameover;
  const G = state.G;
  const inDogma = G.pendingChoice !== null;

  const apply = useCallback((action: Parameters<typeof A.applyAction>[1]) => {
    if (actor === null) return;
    try { setState(A.applyAction(state, action, actor)); }
    catch (e) { console.error('apply', action, e); }
  }, [actor, state]);

  // AI auto-play.
  useEffect(() => {
    if (gameover || actor === null || !ai.has(actor)) return;
    const id = setTimeout(() => {
      try {
        setState(A.applyAction(state, pickAction(state, actor), actor));
      } catch (e) { console.error('AI', e); }
    }, 400);
    return () => clearTimeout(id);
  }, [state, actor, ai, gameover]);

  const onDraw = () => apply({ kind: 'draw' });
  const onMeld = (handIndex: number) => apply({ kind: 'meld', handIndex });
  const onDogma = (color: Color) => apply({ kind: 'dogma', color });
  const onAchieve = (age: number) => apply({ kind: 'achieve', age });
  const onResolveChoice = (response: ChoiceResponse) => apply({ kind: 'resolveChoice', response });
  const onNewGame = () => setState(initialBgioState(numPlayers));

  const legal = actor !== null ? A.legalActions(state, actor) : [];
  const dogmaColors = new Set<Color>(legal.filter((a) => a.kind === 'dogma').map((a) => (a as { color: Color }).color));
  const achievableAges = legal.filter((a) => a.kind === 'achieve').map((a) => (a as { age: number }).age);
  const canDraw = legal.some((a) => a.kind === 'draw');

  // For solo play the "you" panel always shows player 0; for pure hotseat we
  // follow the current actor so each human sees their own board on their turn.
  const viewerId = ai.size > 0 ? '0' : actor ?? '0';
  const opponentIds = Object.keys(G.players).filter((pid) => pid !== viewerId);

  return (
    <div style={{
      minHeight: '100vh', background: pageBg, color: textColor,
      fontFamily: '"Segoe UI", system-ui, sans-serif',
      padding: '10px 14px',
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 10 }}>
        {/* ============================ LEFT SIDEBAR ============================ */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <CurrentPlayerStrip state={state} actor={actor} onNewGame={onNewGame} achievableAges={achievableAges} inDogma={inDogma} />
          <IconTotalsPanel G={G} />
          <AchievementsPanel G={G} achievableAges={achievableAges} onAchieve={onAchieve} canAchieve={actor === viewerId && !inDogma} />
          <CardsRemainingPanel G={G} />
        </aside>

        {/* ============================ MAIN ============================ */}
        <main style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <YourBoard
            G={G}
            playerId={viewerId}
            label={`Your Board — Player ${viewerId}`}
            onActivateDogma={actor === viewerId && !inDogma ? onDogma : undefined}
            dogmaColors={actor === viewerId && !inDogma ? dogmaColors : undefined}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <section style={panel()}>
              <SectionHeader text={`Your Hand — Player ${viewerId}`} extra={
                <span style={{ fontSize: 11, opacity: 0.7 }}>
                  {G.players[viewerId].hand.length} card{G.players[viewerId].hand.length === 1 ? '' : 's'}
                </span>
              } />
              <div style={{ marginTop: 6 }}>
                <Hand cards={G.players[viewerId].hand} onMeld={actor === viewerId && !inDogma ? onMeld : undefined} />
              </div>
              <ActionBar canDraw={canDraw && actor === viewerId && !inDogma} onDraw={onDraw} />
            </section>
            <section style={panel()}>
              <SectionHeader text={`Your Score Pile — Player ${viewerId}`} extra={
                <span style={{ fontSize: 11, opacity: 0.7 }}>
                  {G.players[viewerId].scorePile.length} card{G.players[viewerId].scorePile.length === 1 ? '' : 's'}
                </span>
              } />
              <div style={{ marginTop: 6 }}>
                <ScorePileStrip cards={G.players[viewerId].scorePile} />
              </div>
            </section>
          </div>

          {/* Opponent board(s). */}
          {opponentIds.map((pid) => (
            <OpponentBoard key={pid} G={G} playerId={pid} label={`Opponent — Player ${pid}${pid === actor ? ' (turn)' : ''}`} />
          ))}

          {gameover && (
            <GameOverBanner winners={gameover.winners} reason={String(gameover.reason)} onNewGame={onNewGame} />
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
// Side panels.
// --------------------------------------------------------------------------

function CurrentPlayerStrip({
  state, actor, onNewGame, achievableAges, inDogma,
}: {
  state: BgioState;
  actor: string | null;
  onNewGame: () => void;
  achievableAges: number[];
  inDogma: boolean;
}) {
  const G = state.G;
  return (
    <div style={panel()}>
      <h1 style={{
        margin: '0 0 4px', fontSize: 20, fontWeight: 700,
        fontFamily: '"Segoe UI", system-ui, sans-serif',
      }}>Innovation</h1>
      <div style={{ fontSize: 12, opacity: 0.85 }}>
        Turn <strong>{state.ctx.turn}</strong>
        {' · Active '}<strong>{state.ctx.currentPlayer}</strong>
        {' · Actions left '}<strong>{G.actionsRemaining}</strong>
        {actor !== state.ctx.currentPlayer && actor !== null && (
          <div style={{ marginTop: 2, color: '#9c5a18' }}>
            Waiting on Player {actor} {inDogma && '(choice)'}
          </div>
        )}
        {achievableAges.length > 0 && (
          <div style={{ marginTop: 2 }}>Can claim age {achievableAges.join(',')}</div>
        )}
      </div>
      <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
        <a href="/" style={linkButton()}>← Lobby</a>
        <button onClick={onNewGame} style={smallActionButton()}>New game</button>
      </div>
    </div>
  );
}

function IconTotalsPanel({ G }: { G: BgioState['G'] }) {
  const playerIds = Object.keys(G.players);
  const icons: Array<{ key: import('../engine/types').IconName; glyph: string }> = [
    { key: 'leaf', glyph: iconGlyph.leaf },
    { key: 'castle', glyph: iconGlyph.castle },
    { key: 'lightbulb', glyph: iconGlyph.lightbulb },
    { key: 'crown', glyph: iconGlyph.crown },
    { key: 'factory', glyph: iconGlyph.factory },
    { key: 'clock', glyph: iconGlyph.clock },
  ];
  return (
    <div style={panel()}>
      <SectionHeader text="Icon Totals" />
      <table style={{ marginTop: 6, fontSize: 11, borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={th()}></th>
            {icons.map((i) => <th key={i.key} style={th()}>{i.glyph}</th>)}
          </tr>
        </thead>
        <tbody>
          {playerIds.map((pid) => (
            <tr key={pid}>
              <td style={{ ...td(), fontWeight: 600 }}>P{pid}</td>
              {icons.map((i) => (
                <td key={i.key} style={td()}>{countIcons(G.players[pid], i.key)}</td>
              ))}
            </tr>
          ))}
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
  const claimableSet = new Set(achievableAges);
  return (
    <div style={panel()}>
      <SectionHeader text="Achievements Remaining" />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((a) => {
          const available = G.availableAgeAchievements.includes(a);
          const can = canAchieve && claimableSet.has(a);
          return (
            <button
              key={a}
              onClick={can ? () => onAchieve(a) : undefined}
              disabled={!can}
              title={available ? `Age ${a} tile available` : `Age ${a} tile claimed`}
              style={{
                width: 26, height: 26, padding: 0,
                borderRadius: 13,
                background: available ? (can ? '#d4a017' : '#e8d99a') : '#cfc6a3',
                color: available ? textColor : '#9a917a',
                border: `1px solid ${cardBorder}`,
                fontWeight: 700, fontSize: 12,
                cursor: can ? 'pointer' : 'default',
              }}
            >{a}</button>
          );
        })}
      </div>
      <div style={{ marginTop: 8, fontSize: 11, opacity: 0.8 }}>
        {G.availableSpecialAchievements.length === 0
          ? '(all specials claimed)'
          : G.availableSpecialAchievements.join(' · ')}
      </div>
    </div>
  );
}

function CardsRemainingPanel({ G }: { G: BgioState['G'] }) {
  return (
    <div style={panel()}>
      <SectionHeader text="Cards Remaining" />
      <div style={{
        marginTop: 6,
        display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4,
      }}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((a) => (
          <div key={a} style={{
            fontSize: 11, textAlign: 'center',
            padding: '4px 2px', borderRadius: 3,
            background: '#e8e3c8', border: `1px solid ${cardBorder}`,
          }}>
            <div style={{ opacity: 0.7 }}>{a})</div>
            <div style={{ fontWeight: 700 }}>{G.decks[a].length}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 6, fontSize: 10, opacity: 0.6 }}>
        Total {ALL_CARDS.length} cards in game; deck cards shown above.
      </div>
    </div>
  );
}

function ActionBar({ canDraw, onDraw }: { canDraw: boolean; onDraw: () => void }) {
  return (
    <div style={{
      display: 'flex', gap: 8, marginTop: 10,
      paddingTop: 8, borderTop: '1px solid rgba(0,0,0,0.12)',
      alignItems: 'center',
    }}>
      <button onClick={onDraw} disabled={!canDraw} style={actionButton(!canDraw)}>Draw</button>
      <span style={{ fontSize: 11, opacity: 0.65 }}>
        Meld: click a hand card.{' '}
        Dogma: click a highlighted pile.{' '}
        Achieve: click a yellow age tile.
      </span>
    </div>
  );
}

function GameOverBanner({
  winners, reason, onNewGame,
}: { winners: string[]; reason: string; onNewGame: () => void }) {
  return (
    <div style={{
      padding: '14px 18px', borderRadius: 8,
      background: '#d6c890', border: '1px solid #a98a4b',
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
// Style helpers.
// --------------------------------------------------------------------------

function th(): React.CSSProperties { return { textAlign: 'center', fontWeight: 600, padding: '2px 4px', borderBottom: `1px solid ${cardBorder}` }; }
function td(): React.CSSProperties { return { textAlign: 'center', padding: '2px 4px' }; }
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
function smallActionButton(): React.CSSProperties {
  return {
    padding: '4px 10px', borderRadius: 4,
    border: `1px solid ${cardBorder}`, background: '#e8e3c8',
    color: textColor, cursor: 'pointer', fontSize: 12, fontWeight: 600,
  };
}
function linkButton(): React.CSSProperties {
  return {
    ...smallActionButton(),
    textDecoration: 'none', display: 'inline-block',
  };
}
// suppress unused
void panelBg; void colorBg; void COLORS;
