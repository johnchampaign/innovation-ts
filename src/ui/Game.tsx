// Game shell. Layout mirrors C# WPF MainWindow.xaml:
//
//   TOP STRIP (~280h): [ DetailCard 340w | Current player banner + log
//     summary (flex) | game log 380w ]
//   MAIN: [ sidebar 260w (view-card, icon-totals, achievements, cards
//     remaining) | main column: Your Board, Your Hand + Score, opponent rows ]
//
// Hover any card to see it in DetailCard; click to interact (meld / dogma).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { innovationAdapter as A, initialBgioState, type BgioState } from '../adapter/innovationAdapter';
import { ALL_CARDS, cardById } from '../card-data';
import type { Color, ChoiceResponse, IconName } from '../engine/types';
import { countIcons } from '../engine/icons';
import { YourBoard, OpponentBoard, Hand, ScorePileStrip, panel, sectionTitle } from './Board';
import { ChoicePrompt } from './Choice';
import { DetailCard, type DetailTarget } from './DetailCard';
import { ReportDialog, type Severity } from './ReportDialog';
import html2canvas from 'html2canvas';
import { IconBadge } from './Icon';
import { pickAction } from '../ai/greedy';
import { recordPlay } from 'digital-boardgame-framework';
import { pageBg, textColor, cardBorder, displayPid } from './colors';

interface Props {
  numPlayers: number;
  aiSeats?: ReadonlySet<string>;
}

interface LogEntry { turn: number; text: string; }

export function Game({ numPlayers, aiSeats }: Props) {
  const ai = aiSeats ?? new Set<string>();
  // Local play mode for the play counter: any AI seats → 'ai', else 'hotseat'.
  const playMode: 'ai' | 'hotseat' = ai.size > 0 ? 'ai' : 'hotseat';
  const [state, setState] = useState<BgioState>(() => initialBgioState(numPlayers));

  // Record one local game start when this shell mounts (entering hotseat /
  // solo-vs-AI from the lobby). Best-effort — recordPlay never throws or
  // blocks. Empty deps = exactly once on mount; "New game" records its own
  // start in onNewGame below. (No StrictMode in main.tsx, so this fires once.)
  useEffect(() => {
    recordPlay('innovation', playMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [hover, setHover] = useState<DetailTarget>(null);
  const setHoverCardId = (id: number) => setHover({ kind: 'card', id });
  const setHoverSpecial = (name: string) => setHover({ kind: 'special', name });
  const setHoverPile = (label: string, ages: number[]) => setHover({ kind: 'card-backs', label, ages });
  const setHoverAchievements = (label: string, ages: number[], specials: string[]) =>
    setHover({ kind: 'achievements', label, ages, specials });
  // Cap the log so memory stays bounded over very long games. 500 entries
  // is generous (a game tops out around ~120 player actions); the auto-
  // scroll in GameLogPanel keeps the latest entry visible regardless.
  const [log, setLog] = useState<LogEntry[]>([{ turn: 0, text: '(setup) Initial hands dealt.' }]);
  const pushLog = (text: string, turn: number) =>
    setLog((L) => [...L, { turn, text }].slice(-500));
  const [reportOpen, setReportOpen] = useState<null | 'bug' | 'logs'>(null);
  const [pendingScreenshot, setPendingScreenshot] = useState<string | undefined>(undefined);

  // Capture a screenshot BEFORE the dialog opens so the image shows the
  // game state the user is reporting on, not the dialog itself. html2canvas
  // walks the DOM and rasterises it into a canvas; the JPEG-at-quality-0.7
  // output is small enough to embed as a base-64 data URL in the dialog
  // preview but is downloaded as a file for the user to drag into the
  // GitHub issue (markdown image embeds via data: URLs aren't rendered by
  // GitHub).
  async function openReport(kind: 'bug' | 'logs') {
    // Upload Logs doesn't expose attachment toggles, so no point capturing
    // a screenshot for it — saves the html2canvas pass and avoids dropping
    // a JPEG into the user's downloads when they aren't asking for one.
    if (kind === 'bug') {
      try {
        const canvas = await html2canvas(document.body, {
          scale: 0.7, logging: false, useCORS: true, backgroundColor: '#F3EFD3',
        });
        setPendingScreenshot(canvas.toDataURL('image/jpeg', 0.7));
      } catch (e) {
        console.warn('screenshot capture failed', e);
        setPendingScreenshot(undefined);
      }
    } else {
      setPendingScreenshot(undefined);
    }
    setReportOpen(kind);
  }

  // POST to /api/upload-log (which files a GitHub Issue). On failure (no
  // token, offline, GitHub API down) fall back to a local JSON download
  // so the user never loses their submission.
  async function submitReport(
    message: string,
    severity: Severity,
    opts: { attachScreenshot: boolean; attachLog: boolean },
  ): Promise<string> {
    const payload = {
      kind: reportOpen,
      severity,
      message,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      build: 'innovation-ts',
      state: opts.attachLog ? state : null,
      log: opts.attachLog ? log : [],
      screenshotDownloaded: opts.attachScreenshot && !!pendingScreenshot,
    };
    // Trigger screenshot download first so the user has the file even if
    // the issue submission fails.
    if (opts.attachScreenshot && pendingScreenshot) {
      const a = document.createElement('a');
      a.href = pendingScreenshot;
      a.download = `innovation-screenshot-${Date.now()}.jpg`;
      a.click();
    }
    try {
      const res = await fetch('/api/upload-log', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const { issueUrl } = await res.json() as { issueUrl: string };
      return issueUrl;
    } catch (e) {
      // Fallback: local download of state+log JSON.
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `innovation-${reportOpen}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      throw new Error(`Upload failed (${(e as Error)?.message ?? e}). Saved a local JSON copy instead.`);
    }
  }

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
      if (desc) pushLog(desc, next.ctx.turn);
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
        if (desc) pushLog(desc, next.ctx.turn);
      } catch (e) { console.error('AI', e); }
    }, 400);
    return () => clearTimeout(id);
  }, [state, actor, ai, gameover]);

  const onDraw = () => apply({ kind: 'draw' });
  const onMeld = (handIndex: number) => apply({ kind: 'meld', handIndex });
  const onDogma = (color: Color) => apply({ kind: 'dogma', color });
  const onAchieve = (age: number) => apply({ kind: 'achieve', age });
  const onResolveChoice = (response: ChoiceResponse) => apply({ kind: 'resolveChoice', response });
  const onNewGame = () => {
    setState(initialBgioState(numPlayers));
    setLog([{ turn: 0, text: '(setup) New game.' }]);
    setHover(null);
    recordPlay('innovation', playMode); // a fresh local game = one more play
  };

  const legal = actor !== null ? A.legalActions(state, actor) : [];
  const dogmaColors = new Set<Color>(legal.filter((a) => a.kind === 'dogma').map((a) => (a as { color: Color }).color));
  const achievableAges = legal.filter((a) => a.kind === 'achieve').map((a) => (a as { age: number }).age);
  const canDraw = legal.some((a) => a.kind === 'draw');

  // In solo-vs-AI, "you" is always player 0; in hotseat we follow the actor.
  const viewerId = ai.size > 0 ? '0' : actor ?? '0';
  const opponents = Object.keys(G.players).filter((pid) => pid !== viewerId);

  // What goes in the DetailCard slot. If the user is hovering something
  // explicit (card or special), show that; otherwise pick a representative
  // card so the panel is never empty.
  const detailTarget = useMemo<DetailTarget>(() => {
    if (hover) return hover;
    const p = G.players[viewerId];
    if (p.hand.length > 0 && p.hand[0] >= 0) return { kind: 'card', id: p.hand[0] };
    for (const c of (['yellow','red','purple','blue','green'] as Color[])) {
      const top = p.piles[c].cards[0];
      if (top !== undefined && top >= 0) return { kind: 'card', id: top };
    }
    return null;
  }, [hover, G, viewerId]);

  return (
    <div style={{
      // Lock the shell to the viewport. Every panel inside scrolls
      // independently when it overflows its slot, instead of letting the
      // whole page grow and push content off the bottom.
      height: '100vh', overflow: 'hidden',
      background: pageBg, color: textColor,
      fontFamily: '"Segoe UI", system-ui, sans-serif', padding: '8px 10px',
      boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      {/* ============================= TOP STRIP ============================= */}
      <div style={{
        display: 'grid', gridTemplateColumns: '340px 1fr 380px', gap: 8,
        flexShrink: 0,
      }}>
        <DetailCard target={detailTarget} />
        <CurrentPlayerPanel
          state={state}
          actor={actor}
          viewerId={viewerId}
          gameover={gameover}
          inDogma={inDogma}
          ai={ai}
          onNewGame={onNewGame}
        />
        <GameLogPanel
          log={log}
          onReport={() => openReport('bug')}
          onUploadLogs={() => openReport('logs')}
        />
      </div>

      {/* ============================= MAIN ROW ============================= */}
      <div style={{
        display: 'grid', gridTemplateColumns: '260px 1fr', gap: 8,
        flex: 1, minHeight: 0,
      }}>
        <aside style={{
          display: 'flex', flexDirection: 'column', gap: 8,
          minHeight: 0, overflowY: 'auto',
        }}>
          <IconTotalsPanel G={G} viewerId={viewerId} onHoverAchievements={setHoverAchievements} onHoverEnd={() => setHover(null)} />
          <AchievementsPanel
            G={G}
            achievableAges={achievableAges}
            onAchieve={onAchieve}
            canAchieve={actor === viewerId && !inDogma}
            onHoverSpecial={setHoverSpecial}
          />
          <CardsRemainingPanel G={G} />
        </aside>

        <main style={{
          display: 'flex', flexDirection: 'column', gap: 8,
          minHeight: 0,
        }}>
          <section style={{ ...panel(), flexShrink: 0 }}>
            <YourBoard
              G={G}
              playerId={viewerId}
              onActivateDogma={actor === viewerId && !inDogma ? onDogma : undefined}
              dogmaColors={actor === viewerId && !inDogma ? dogmaColors : undefined}
              onHoverCard={setHoverCardId}
            />
          </section>

          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
            flex: 1, minHeight: 120,
          }}>
            <section style={{ ...panel(), display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6, flexShrink: 0 }}>
                <h2 style={sectionTitle()}>Your Hand</h2>
                <span style={{ fontSize: 11, opacity: 0.7 }}>
                  {G.players[viewerId].hand.length} card{G.players[viewerId].hand.length === 1 ? '' : 's'}
                </span>
              </div>
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                <Hand
                  cards={G.players[viewerId].hand}
                  onMeld={actor === viewerId && !inDogma ? onMeld : undefined}
                  onHoverCard={setHoverCardId}
                />
              </div>
              <div style={{ flexShrink: 0 }}>
                <ActionBar
                  canDraw={canDraw && actor === viewerId && !inDogma}
                  onDraw={onDraw}
                />
              </div>
            </section>
            <section style={{ ...panel(), display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6, flexShrink: 0 }}>
                <h2 style={sectionTitle()}>Your Score Pile</h2>
                <span style={{ fontSize: 11, opacity: 0.7 }}>
                  {G.players[viewerId].scorePile.length} card{G.players[viewerId].scorePile.length === 1 ? '' : 's'}
                </span>
              </div>
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                <ScorePileStrip cards={G.players[viewerId].scorePile} onHoverCard={setHoverCardId} />
              </div>
            </section>
          </div>

          <section style={{
            ...panel(),
            display: 'flex', flexDirection: 'column',
            flexShrink: 0,
            maxHeight: '40vh', minHeight: 80,
          }}>
            <h2 style={{ ...sectionTitle(), marginBottom: 6, flexShrink: 0 }}>
              Opponent Board <span style={{ fontWeight: 400, fontSize: 11, opacity: 0.65 }}>(click 'Size' label to see the whole stack)</span>
            </h2>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {opponents.map((pid) => (
                <OpponentBoard
                  key={pid}
                  G={G}
                  playerId={pid}
                  label={`Player ${displayPid(pid)}${pid === actor ? ' (turn)' : ''}${ai.has(pid) ? ' [AI]' : ''}`}
                  onHoverCard={setHoverCardId}
                  onHoverPile={setHoverPile}
                  onHoverEnd={() => setHover(null)}
                />
              ))}
            </div>
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

      <ReportDialog
        open={reportOpen !== null}
        kind={reportOpen ?? 'bug'}
        screenshotDataUrl={pendingScreenshot}
        onSubmit={submitReport}
        onClose={() => { setReportOpen(null); setPendingScreenshot(undefined); }}
      />
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
    ? `Game Over — ${gameover.winners.length === 1 ? `Player ${displayPid(gameover.winners[0])} wins` : `tied: ${gameover.winners.map(displayPid).join(', ')}`}`
    : `Current Player: ${displayPid(state.ctx.currentPlayer)}${ai.has(state.ctx.currentPlayer) ? ' [AI]' : ''}`;
  const status = gameover
    ? String(gameover.reason)
    : actor === null
      ? '(no actor)'
      : actor === viewerId
        ? `Your turn — ${G.actionsRemaining} action(s) left.${inDogma ? ' Resolve the prompt below.' : ''}`
        : `Player ${displayPid(actor)}${ai.has(actor) ? ' [AI]' : ''}'s turn${inDogma ? ' (resolving a prompt)' : ''} — ${G.actionsRemaining} action(s) left.`;
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

function GameLogPanel({
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

// --------------------------------------------------------------------------
// Sidebar panels.
// --------------------------------------------------------------------------

function IconTotalsPanel({
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

function AchievementsPanel({
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
        Game over — {winners.length === 1 ? `Player ${displayPid(winners[0])} wins` : `tied: ${winners.map(displayPid).join(', ')}`}
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
