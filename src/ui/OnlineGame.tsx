// Online game view. Same Board / Hand / ChoicePrompt as hotseat, but state
// comes from the framework's useGame hook polling the Pages Functions API.
// View is already per-player-redacted by the server.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useGame, ChatPanel, useIdentity, SignInBar } from 'digital-boardgame-framework/client';
import { makeClient, makeMessagingClient, claimSeat } from '../online/client';
import { ReportDialog, type Severity } from './ReportDialog';
import html2canvas from 'html2canvas';
import { COLORS } from '../engine/types';
import type { Color, ChoiceResponse } from '../engine/types';
import { score, highestTopAge } from '../engine/mechanics';
import { YourBoard, OpponentBoard, Hand, ScorePileStrip, panel, SectionHeader } from './Board';
import { ChoicePrompt } from './Choice';
import { DetailCard, type DetailTarget } from './DetailCard';
import { IconTotalsPanel, AchievementsPanel, CardsRemainingPanel } from './Panels';
import { GameLogPanel, describeAction, type LogEntry } from './GameLog';
import { pageBg, textColor, cardBorder, displayPid } from './colors';

interface Props { gameId: string; token: string; }

export function OnlineGame({ gameId, token }: Props) {
  // Ranked identity (anon or signed-in). Kept in a ref so each move carries the
  // current token without re-creating the client on every identity change.
  const { identity } = useIdentity();
  const idTokRef = useRef<string | undefined>(undefined);
  idTokRef.current = identity?.token;
  const client = useMemo(() => makeClient(gameId, token, () => idTokRef.current), [gameId, token]);
  const messagingClient = useMemo(() => makeMessagingClient(gameId, token), [gameId, token]);
  // Bind this client's identity to its seat on join (per-move attribution above
  // also covers it, but claiming on join attributes the seat before any move).
  useEffect(() => {
    if (identity?.token) void claimSeat(gameId, token, identity.token);
  }, [gameId, token, identity?.token]);
  // trackLegalActions:false — we derive what's playable straight from the
  // (always-fresh) redacted view below, not from a separate polled /legal
  // fetch. The hook skips periodic refreshes while it's your turn, so a
  // single hiccup on that /legal round-trip at turn-start could otherwise
  // leave `legalActions` empty for the WHOLE turn — making the dogma pile
  // un-clickable until a manual refresh. Deriving from the view is race-free
  // and matches the adapter's own legality rules exactly.
  const game = useGame(client, { pollMs: 2000, pauseWhenHidden: true, trackLegalActions: false });
  const [reportOpen, setReportOpen] = useState<null | 'bug' | 'logs'>(null);
  const [pendingScreenshot, setPendingScreenshot] = useState<string | undefined>(undefined);

  // DetailCard hover target (matches the hotseat shell). Hovering any card /
  // pile / special shows it in the top-strip DetailCard.
  const [hover, setHover] = useState<DetailTarget>(null);
  const setHoverCardId = (id: number) => setHover({ kind: 'card', id });
  const setHoverSpecial = (name: string) => setHover({ kind: 'special', name });
  const setHoverPile = (label: string, ages: number[]) => setHover({ kind: 'card-backs', label, ages });
  const setHoverAchievements = (label: string, ages: number[], specials: string[]) =>
    setHover({ kind: 'achievements', label, ages, specials });

  // Client-side game log. Unlike hotseat (where every action is applied
  // locally so we see it), the online view only ever holds a redacted server
  // snapshot. Two sources feed the log:
  //   (a) our OWN actions, in full detail, at submit time (logAndSubmit); and
  //   (b) the OPPONENT's moves, reconstructed by diffing their visible state
  //       between snapshots.
  // (b) matters because the server drives AI seats synchronously inside our
  // submit and returns OUR next-turn view — the client never sees the AI as
  // `currentPlayer`, so without a diff the AI's whole turn is invisible and
  // looks "skipped". Redaction hides the opponent's card identities, so we log
  // net deltas (melds N / scores N / draws N / claims an achievement), not a
  // per-card play-by-play.
  const [log, setLog] = useState<LogEntry[]>([{ turn: 0, text: '(online) Game started.' }]);
  const pushLog = (text: string, turn: number) =>
    setLog((L) => [...L, { turn, text }].slice(-500));

  // Per-opponent snapshot of visible counts, so we can diff across renders.
  const prevOppRef = useRef<Record<string, { board: number; score: number; hand: number; achv: number }>>({});
  // Signature of every opponent's visible state (+ turn) — changes exactly when
  // there's something new to log, so the effect doesn't fire on every poll.
  const oppSig = game.view
    ? Object.keys(game.view.G.players)
        .filter((pid) => pid !== game.you)
        .map((pid) => {
          const p = game.view!.G.players[pid];
          const board = COLORS.reduce((n, c) => n + p.piles[c].cards.length, 0);
          const achv = p.ageAchievements.length + p.specialAchievements.length;
          return `${pid}:${board}:${p.scorePile.length}:${p.hand.length}:${achv}`;
        })
        .join('|') + `#${game.view.ctx.turn}`
    : '';
  useEffect(() => {
    const v = game.view;
    if (!v) return;
    const turn = v.ctx.turn;
    for (const pid of Object.keys(v.G.players)) {
      if (pid === game.you) continue;
      const p = v.G.players[pid];
      const cur = {
        board: COLORS.reduce((n, c) => n + p.piles[c].cards.length, 0),
        score: p.scorePile.length,
        hand: p.hand.length,
        achv: p.ageAchievements.length + p.specialAchievements.length,
      };
      const prev = prevOppRef.current[pid];
      if (prev) {
        const parts: string[] = [];
        if (cur.board > prev.board) parts.push(`melds ${cur.board - prev.board} card${cur.board - prev.board === 1 ? '' : 's'}`);
        if (cur.board < prev.board) parts.push(`clears ${prev.board - cur.board} card${prev.board - cur.board === 1 ? '' : 's'} off board`);
        if (cur.score > prev.score) parts.push(`scores ${cur.score - prev.score}`);
        if (cur.hand > prev.hand) parts.push(`draws ${cur.hand - prev.hand}`);
        if (cur.achv > prev.achv) parts.push(`claims ${cur.achv - prev.achv} achievement${cur.achv - prev.achv === 1 ? '' : 's'}`);
        if (parts.length) pushLog(`Player ${displayPid(pid)} ${parts.join(', ')}.`, turn);
      }
      prevOppRef.current[pid] = cur;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oppSig]);

  async function openReport(kind: 'bug' | 'logs') {
    // Upload Logs doesn't show attachment toggles — skip the screenshot.
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

  // Online report: posts to /api/upload-log so the report lands in the
  // dedicated GitHub reports repo (same path the hotseat client uses).
  // The view we have at submission time is already redacted per-player,
  // so the issue contains what THIS player sees — not the server-side
  // unredacted snapshot. That's usually what the reporter is describing.
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
      state: opts.attachLog ? game.view : null,
      log: [],
      screenshotDownloaded: opts.attachScreenshot && !!pendingScreenshot,
    };
    if (opts.attachScreenshot && pendingScreenshot) {
      const a = document.createElement('a');
      a.href = pendingScreenshot;
      a.download = `innovation-screenshot-${Date.now()}.jpg`;
      a.click();
    }
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
  }

  if (game.loading && !game.view) {
    return <Centered>Loading…</Centered>;
  }
  if (game.error) {
    return (
      <Centered>
        <div style={{ color: '#9c2c2c' }}>Error: {game.error.message}</div>
        <a href="/" style={{ color: '#3b5dbf', marginTop: 10, display: 'inline-block' }}>← Back to lobby</a>
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

  const submit = (action: Parameters<typeof game.submit>[0]) =>
    game.submit(action).catch((e) => console.error('submit', e));
  // Log our OWN action (full detail — we can see our own cards) using the
  // current view as the pre-action state, then submit it.
  const logAndSubmit = (action: Parameters<typeof game.submit>[0]) => {
    if (you !== null) {
      const line = describeAction(action, you, G);
      if (line) pushLog(line, ctx.turn);
    }
    return submit(action);
  };
  const onDraw = () => logAndSubmit({ kind: 'draw' });
  const onMeld = (handIndex: number) => logAndSubmit({ kind: 'meld', handIndex });
  const onDogma = (color: Color) => logAndSubmit({ kind: 'dogma', color });
  const onAchieve = (age: number) => logAndSubmit({ kind: 'achieve', age });
  const onResolveChoice = (response: ChoiceResponse) => submit({ kind: 'resolveChoice', response });

  // Affordances derived from the view (mirrors innovationAdapter.enumerateLegal),
  // available only on your own settled turn. Race-free vs. the polled /legal.
  const me = you !== null ? G.players[you] : null;
  const playable = yourTurn && !inDogma && me !== null;
  // Dogma: any color you have a top card in.
  const dogmaColors = new Set<Color>(
    playable ? COLORS.filter((c) => me!.piles[c].cards.length > 0) : [],
  );
  // Achieve: age tiles still available where score ≥ 5×age and a top card of ≥age.
  const achievableAges = playable
    ? G.availableAgeAchievements.filter(
        (age) => score(me!) >= 5 * age && highestTopAge(me!) >= age,
      )
    : [];
  // Draw is always legal on your turn (the engine handles deck exhaustion).
  const canDraw = playable;

  const opponents = Object.keys(G.players).filter((pid) => pid !== you);

  // Server-authoritative structured log (engine/log.ts, already redacted for
  // this viewer by the adapter). Preferred over the client-side diff log when
  // present; older snapshots (schema v1) had an empty log, so fall back.
  const engineLog: LogEntry[] = (G.log ?? [])
    .filter((e) => typeof e.msg === 'string' && e.msg.length > 0)
    .map((e) => ({ turn: e.turn, text: e.msg! }));

  // Online games are always all-human (the AI only exists in the hotseat
  // `Game` component, which has no chat). So the human seat count is just the
  // total seat count. Gate chat on 2+ so a 1-seat online game (and, by
  // construction, every solo-vs-AI game — which never reaches OnlineGame)
  // shows no panel.
  const humanSeatCount = Object.keys(G.players).length;

  // What fills the DetailCard slot: an explicit hover, else a representative
  // card from your own hand/board so the panel is never empty. Plain const
  // (not useMemo) because it sits past the early returns above.
  let detailTarget: DetailTarget = hover;
  if (!detailTarget && me) {
    if (me.hand.length > 0 && me.hand[0] >= 0) {
      detailTarget = { kind: 'card', id: me.hand[0] };
    } else {
      for (const c of (['yellow', 'red', 'purple', 'blue', 'green'] as Color[])) {
        const top = me.piles[c].cards[0];
        if (top !== undefined && top >= 0) { detailTarget = { kind: 'card', id: top }; break; }
      }
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: pageBg, color: textColor,
      fontFamily: '"Segoe UI", system-ui, sans-serif',
      padding: '10px 14px',
    }}>
      {/* ============================= TOP STRIP ============================= */}
      <div style={{
        display: 'grid', gridTemplateColumns: '340px 1fr 380px', gap: 10,
        marginBottom: 10,
      }}>
        <DetailCard target={detailTarget} />
        <div style={{
          ...panel(),
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          minHeight: 200, background: '#fbf7da',
        }}>
          <div>
            <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 2 }}>Turn {ctx.turn}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: textColor }}>
              {gameover
                ? `Game Over — ${gameover.winners.length === 1 ? `Player ${displayPid(gameover.winners[0])} wins` : `tied: ${gameover.winners.map(displayPid).join(', ')}`}`
                : `Current Player: ${displayPid(ctx.currentPlayer)}`}
            </div>
            <div style={{ marginTop: 6, fontSize: 13, color: textColor }}>
              You are <strong>P{displayPid(you)}</strong>
              {' · '}
              <span style={{ color: yourTurn ? '#3a6f23' : '#9c5a18' }}>
                {gameover ? 'Game over' : yourTurn
                  ? `Your turn — ${G.actionsRemaining} action(s) left.${inDogma ? ' Resolve the prompt below.' : ''}`
                  : `Waiting on Player ${displayPid(ctx.currentPlayer)} — ${G.actionsRemaining} action(s) left.`}
              </span>
              {achievableAges.length > 0 && yourTurn && (
                <div style={{ marginTop: 2 }}>Can claim age {achievableAges.join(', ')}.</div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
            <a href="/" style={linkButton()}>← Lobby</a>
            <SignInBar leaderboardHref="https://games-hub-5vo.pages.dev/leaderboard?game=innovation" />
          </div>
        </div>
        <GameLogPanel
          log={engineLog.length > 0 ? engineLog : log}
          onReport={() => openReport('bug')}
          onUploadLogs={() => openReport('logs')}
        />
      </div>

      {/* ============================= MAIN ROW ============================= */}
      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 10 }}>
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <IconTotalsPanel
            G={G}
            viewerId={you ?? '0'}
            onHoverAchievements={setHoverAchievements}
            onHoverEnd={() => setHover(null)}
          />
          <AchievementsPanel
            G={G}
            achievableAges={achievableAges}
            onAchieve={onAchieve}
            canAchieve={yourTurn && !inDogma}
            onHoverSpecial={setHoverSpecial}
          />
          <CardsRemainingPanel G={G} />
        </aside>

        <main style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <section style={panel()}>
            <YourBoard
              G={G}
              playerId={you ?? '0'}
              onActivateDogma={yourTurn && !inDogma ? onDogma : undefined}
              dogmaColors={yourTurn && !inDogma ? dogmaColors : undefined}
              onHoverCard={setHoverCardId}
            />
          </section>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <section style={panel()}>
              <SectionHeader text="Your Hand" extra={
                <span style={{ fontSize: 11, opacity: 0.7 }}>
                  {(you !== null ? G.players[you].hand.length : 0)} cards
                </span>
              } />
              <div style={{ marginTop: 6 }}>
                <Hand cards={you !== null ? G.players[you].hand : []} onMeld={yourTurn && !inDogma ? onMeld : undefined} onHoverCard={setHoverCardId} />
              </div>
              <div style={{
                display: 'flex', gap: 8, marginTop: 10, paddingTop: 8,
                borderTop: '1px solid rgba(0,0,0,0.12)',
              }}>
                <button onClick={onDraw} disabled={!canDraw || !yourTurn || inDogma} style={actionButton(!canDraw || !yourTurn || inDogma)}>Draw</button>
                <span style={{ fontSize: 11, opacity: 0.65 }}>
                  {yourTurn ? 'Meld: click hand card. Dogma: highlighted pile. Achieve: yellow age tile.' : 'Waiting…'}
                </span>
              </div>
            </section>
            <section style={panel()}>
              <SectionHeader text="Your Score Pile" extra={
                <span style={{ fontSize: 11, opacity: 0.7 }}>
                  {you !== null ? G.players[you].scorePile.length : 0} cards
                </span>
              } />
              <div style={{ marginTop: 6 }}>
                <ScorePileStrip cards={you !== null ? G.players[you].scorePile : []} onHoverCard={setHoverCardId} />
              </div>
            </section>
          </div>

          {opponents.map((pid) => (
            <OpponentBoard
              key={pid}
              G={G}
              playerId={pid}
              label={`Opponent — Player ${displayPid(pid)}${pid === ctx.currentPlayer ? ' (turn)' : ''}`}
              onHoverCard={setHoverCardId}
              onHoverPile={setHoverPile}
              onHoverEnd={() => setHover(null)}
            />
          ))}

          {gameover && (
            <div style={{
              padding: '14px 18px', borderRadius: 8,
              background: '#d6c890', border: '1px solid #a98a4b',
            }}>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
                Game over — {gameover.winners.length === 1 ? `Player ${displayPid(gameover.winners[0])} wins` : `tied: ${gameover.winners.map(displayPid).join(', ')}`}
              </div>
              <div style={{ fontSize: 13, opacity: 0.8 }}>{String(gameover.reason)}</div>
              {game.ranked && (
                <div style={{ fontSize: 12, marginTop: 6, fontWeight: 600 }}>
                  {game.ranked.recorded
                    ? '✓ Recorded to the leaderboard.'
                    : game.ranked.reason === 'one-player'
                      ? 'Not ranked — both seats were the same player.'
                      : 'Not ranked.'}
                </div>
              )}
              <a href="/" style={{ ...linkButton(), marginTop: 8, display: 'inline-block' }}>← Lobby</a>
            </div>
          )}
        </main>
      </div>

      {G.pendingChoice && youOwnChoice && (
        <ChoicePrompt pc={G.pendingChoice} onSubmit={onResolveChoice} />
      )}

      {/* In-game chat — only for online games with 2+ human seats. The
       *  framework's ChatPanel polls every ~12s (no realtime broadcaster
       *  wired for this game). seatLabel renders 1-indexed player numbers
       *  to match the rest of the UI; ChatPanel adds the "(you)" marker. */}
      {humanSeatCount >= 2 && you !== null && (
        <div style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 40, width: 300 }}>
          <ChatPanel
            client={messagingClient}
            you={you}
            seatLabel={(seat) => `Player ${displayPid(seat)}`}
            title="Chat"
          />
        </div>
      )}

      <ReportDialog
        open={reportOpen !== null}
        kind={reportOpen ?? 'bug'}
        screenshotDataUrl={pendingScreenshot}
        onSubmit={submitReport}
        onClose={() => { setReportOpen(null); setPendingScreenshot(undefined); }}
      />
      {G.pendingChoice && !youOwnChoice && (
        <div style={{
          // Bottom-LEFT so it never overlaps the bottom-right chat panel.
          position: 'fixed', left: 16, bottom: 16, zIndex: 40,
          padding: '10px 14px', borderRadius: 6,
          background: '#fbf7da', border: `1px solid ${cardBorder}`, color: textColor,
          maxWidth: 360, fontSize: 12,
        }}>
          Waiting on Player {displayPid(G.pendingChoice.playerId)} to respond.
        </div>
      )}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh', background: pageBg, color: textColor,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: '"Segoe UI", system-ui, sans-serif',
    }}>
      <div style={{ textAlign: 'center', padding: 24 }}>{children}</div>
    </div>
  );
}

function actionButton(disabled?: boolean): React.CSSProperties {
  return {
    padding: '6px 14px', borderRadius: 4, border: `1px solid ${cardBorder}`,
    background: disabled ? '#ddd9c5' : '#a98a4b',
    color: disabled ? '#888' : '#fff',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 13, fontWeight: 600,
  };
}
function linkButton(): React.CSSProperties {
  return {
    padding: '4px 10px', borderRadius: 4,
    border: `1px solid ${cardBorder}`, background: '#e8e3c8',
    color: textColor, fontSize: 12, fontWeight: 600,
    textDecoration: 'none', display: 'inline-block',
  };
}
