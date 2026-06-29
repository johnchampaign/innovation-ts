// Cloudflare Pages Functions backend for the lobby + game API.
// Routes:
//   POST  /api/games                    body: {numPlayers} → {gameId, invites}
//   GET   /api/games/:id?token=...      → ViewResult
//   GET   /api/games/:id/legal?token=…  → Action[]
//   POST  /api/games/:id/submit?token=… body: action → ViewResult
//   POST  /api/games/:id/report?token=… body: report → {reportId}
//   GET   /api/games/:id/chat?token=…   → ChatMessage[]
//   POST  /api/games/:id/chat?token=…   body: {body} → ChatMessage[] (refreshed)
//
// Token auth: each player's token (returned at createGame) is their seat
// credential — the GameServer resolves it to a player id internally.
//
// Single deployable. Runs on Workers (V8 isolates); SupabaseStore makes
// the persistence layer Workers-compatible. FsStore is not used because it
// requires `fs` (Node-only).

import { createClient } from '@supabase/supabase-js';
import { GameServer, SupabaseStore, NoopNotifier, verifyIdentityToken, type Jwks } from 'digital-boardgame-framework/server';
import { jsonCodec } from 'digital-boardgame-framework';
import { innovationAdapter, initialBgioState, type BgioState, type InnovationAction, type PlayerId } from '../../src/adapter/innovationAdapter';

interface Env {
  SUPABASE_URL: string;
  /** Service-role key. Named to match the framework convention used across
   *  the other games (tyrants-online, star-wars-rebellion) so one Supabase
   *  project's secret can be shared. */
  SUPABASE_SERVICE_ROLE_KEY: string;
  PUBLIC_ORIGIN?: string;
  /** PAT (classic or fine-grained) with `issues:write` on the reports repo.
   *  Used by /api/upload-log to file a GitHub Issue per bug report / log
   *  upload. If unset, the endpoint returns 503 and the client falls back
   *  to a local JSON download. */
  GITHUB_TOKEN?: string;
  /** owner/repo to file reports against. Defaults to johnchampaign/innovation-ts-reports. */
  REPORTS_REPO?: string;
  /** Shared secret matching the hub's RATINGS_INGEST_KEY (enables ranked play). */
  RATINGS_INGEST_KEY?: string;
}

interface RouteCtx { request: Request; env: Env; }

// Cached hub JWKS for verifying ranked-play identity tokens (refreshed hourly).
const HUB = 'https://games-hub-5vo.pages.dev';
let _jwks: Jwks | undefined;
let _jwksAt = 0;
async function getJwks(): Promise<Jwks> {
  if (!_jwks || Date.now() - _jwksAt > 3_600_000) {
    _jwks = (await (await fetch(`${HUB}/id/jwks`)).json()) as Jwks;
    _jwksAt = Date.now();
  }
  return _jwks;
}

function server(env: Env, origin: string) {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  return new GameServer<BgioState, InnovationAction, PlayerId>({
    snapshotHistory: 20,   // cap per-game snapshot history (framework >=0.32)
    adapter: innovationAdapter,
    codec: jsonCodec<BgioState>(),
    store: new SupabaseStore(supabase),
    notifier: new NoopNotifier(),
    // Best-effort play counter: createGame fires an 'online' beacon to the
    // shared games-hub counter. Never blocks or fails game creation.
    playBeacon: { appId: 'innovation' },
    gameUrl: (gameId, token) =>
      `${origin}/?game=${encodeURIComponent(gameId)}&token=${encodeURIComponent(token)}`,
    // Ranked play: verify hub identity tokens (claimSeat) + auto-report results.
    verifyIdentity: async (t) => verifyIdentityToken(t, await getJwks()),
    ...(env.RATINGS_INGEST_KEY
      ? { ratings: { game: 'innovation', ingestKey: env.RATINGS_INGEST_KEY } }
      : {}),
  });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  });
}

function bad(msg: string, status = 400): Response {
  return json({ error: msg }, status);
}

async function readJson<T>(req: Request): Promise<T> {
  try { return await req.json() as T; }
  catch { throw new Error('invalid JSON body'); }
}

function originOf(env: Env, req: Request): string {
  if (env.PUBLIC_ORIGIN) return env.PUBLIC_ORIGIN.replace(/\/$/, '');
  const u = new URL(req.url);
  return `${u.protocol}//${u.host}`;
}

interface UploadLogBody {
  kind: 'bug' | 'logs';
  severity: 'bug' | 'rules-question' | 'feedback';
  message: string;
  timestamp: string;
  userAgent: string;
  build: string;
  state: unknown;
  log: unknown;
  /** True when the client captured a screenshot and downloaded it locally
   *  alongside this submission. The issue body gets a note prompting the
   *  reporter to drag the downloaded file into a comment to attach it
   *  (data: URLs aren't rendered by GitHub's markdown). */
  screenshotDownloaded?: boolean;
}

/** File a GitHub Issue with the user-submitted state + log. The token + repo
 *  live in env so a single relay can serve any number of innovation-ts
 *  deployments. Issue body is bounded to ~60KB; longer state JSON is
 *  truncated to fit (we still need to fit a usable head + tail). */
async function uploadLog(env: Env, request: Request): Promise<Response> {
  if (!env.GITHUB_TOKEN) {
    return bad('GitHub upload not configured (missing GITHUB_TOKEN secret).', 503);
  }
  const body = await request.json() as UploadLogBody;
  const repo = env.REPORTS_REPO ?? 'johnchampaign/innovation-ts-reports';

  const firstLine = (body.message || '').split('\n')[0].slice(0, 80).trim();
  const title = body.kind === 'bug'
    ? `[bug] ${firstLine || '(no description)'}`
    : `[log] session ${body.timestamp}`;

  // Build issue body. Cap the embedded JSON at ~58KB so the whole body fits
  // GitHub's 65,536-character limit with headroom for the markdown chrome.
  let jsonBlob = JSON.stringify({ state: body.state, log: body.log }, null, 2);
  const MAX_JSON = 58_000;
  let truncated = false;
  if (jsonBlob.length > MAX_JSON) {
    jsonBlob = jsonBlob.slice(0, MAX_JSON) + '\n... [truncated]';
    truncated = true;
  }

  const issueBody = [
    body.kind === 'bug' ? '**Bug report from the in-game UI.**' : '**Session log upload.**',
    '',
    body.message
      ? body.message.split('\n').map((l) => '> ' + l).join('\n')
      : '_(no description provided)_',
    '',
    `- **Severity:** \`${body.severity}\``,
    `- **Build:** \`${body.build}\``,
    `- **Timestamp:** \`${body.timestamp}\``,
    `- **User agent:** \`${body.userAgent}\``,
    truncated ? '- **State+log:** truncated to 58KB' : '',
    body.screenshotDownloaded
      ? '- **Screenshot:** downloaded to the reporter\'s machine — drag it into a comment here to attach.'
      : '',
    '',
    '<details><summary>State + log (JSON)</summary>',
    '',
    '```json',
    jsonBlob,
    '```',
    '',
    '</details>',
  ].filter(Boolean).join('\n');

  const ghRes = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      'User-Agent': 'innovation-ts-pages-function',
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title,
      body: issueBody,
      labels: body.kind === 'bug'
        ? ['user-bug', body.severity]
        : ['session-log'],
    }),
  });
  if (!ghRes.ok) {
    const errText = await ghRes.text();
    return bad(`GitHub API ${ghRes.status}: ${errText.slice(0, 300)}`, 502);
  }
  const issue = await ghRes.json() as { html_url: string; number: number };
  return json({ issueUrl: issue.html_url, issueNumber: issue.number });
}

export const onRequest = async ({ request, env }: RouteCtx): Promise<Response> => {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api/, ''); // /games, /games/:id/legal, …
  const token = url.searchParams.get('token') ?? undefined;

  try {
    // POST /api/upload-log — file a GitHub Issue with state + log
    if (path === '/upload-log' && request.method === 'POST') {
      return await uploadLog(env, request);
    }

    // POST /api/games — create
    if (path === '/games' && request.method === 'POST') {
      const body = await readJson<{ numPlayers: number }>(request);
      const numPlayers = Number(body.numPlayers);
      if (!Number.isInteger(numPlayers) || numPlayers < 1 || numPlayers > 4) {
        return bad('numPlayers must be 1..4');
      }
      const players: PlayerId[] = Array.from({ length: numPlayers }, (_, i) => String(i));
      const initialState = initialBgioState(numPlayers);
      const out = await server(env, originOf(env, request)).createGame({
        initialState,
        players,
      });
      return json(out);
    }

    // /api/games/:id...
    const gameMatch = path.match(/^\/games\/([^/]+)(.*)$/);
    if (gameMatch) {
      const [, gameId, rest] = gameMatch;
      if (!token) return bad('missing token', 401);
      const srv = server(env, originOf(env, request));

      // GET /games/:id
      if (rest === '' && request.method === 'GET') {
        return json(await srv.fetch(gameId, token));
      }
      // GET /games/:id/legal
      if (rest === '/legal' && request.method === 'GET') {
        return json(await srv.legalActions(gameId, token));
      }
      // POST /games/:id/submit. Body is either the bare action (legacy) or
      // { action, identityToken } (ranked). When an identityToken rides along,
      // attribute this seat from it first (best-effort; never blocks the move).
      if (rest === '/submit' && request.method === 'POST') {
        const body = await readJson<InnovationAction | { action: InnovationAction; identityToken?: string }>(request);
        const hasWrapper = body && typeof body === 'object' && 'action' in body;
        const action = (hasWrapper ? (body as { action: InnovationAction }).action : body) as InnovationAction;
        const identityToken = hasWrapper ? (body as { identityToken?: string }).identityToken : undefined;
        if (typeof identityToken === 'string' && identityToken) {
          try { await srv.claimSeat(gameId, token, identityToken); } catch { /* optional */ }
        }
        return json(await srv.submit(gameId, token, action));
      }
      // POST /games/:id/claim — attach a hub identity to this seat on join.
      if (rest === '/claim' && request.method === 'POST') {
        const body = await readJson<{ identityToken?: string }>(request);
        if (typeof body?.identityToken !== 'string' || !body.identityToken) {
          return bad('identityToken required', 422);
        }
        const v = await srv.claimSeat(gameId, token, body.identityToken);
        return json({ ok: true, playerId: v.playerId });
      }
      // POST /games/:id/report
      if (rest === '/report' && request.method === 'POST') {
        const body = await readJson<Parameters<typeof srv.report>[2]>(request);
        return json(await srv.report(gameId, token, body));
      }
      // GET /games/:id/chat — list messages (auth-gated by token)
      if (rest === '/chat' && request.method === 'GET') {
        return json(await srv.listMessages(gameId, token));
      }
      // POST /games/:id/chat — post a message; sender seat stamped from token.
      // Returns the refreshed message list. (No SupabaseBroadcaster is
      // configured for this game, so delivery is poll-driven — the framework
      // ChatPanel polls every ~12s; a future realtime wiring would make this
      // instant without changing this route.)
      if (rest === '/chat' && request.method === 'POST') {
        const body = await readJson<{ body: string }>(request);
        const text = typeof body?.body === 'string' ? body.body : '';
        return json(await srv.postMessage(gameId, token, text));
      }
    }

    return bad('not found', 404);
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    // Treat token / not-found / conflict as client errors; everything else 500.
    const status =
      /not found|invalid token|forbidden/i.test(msg) ? 404 :
      /conflict/i.test(msg) ? 409 :
      400;
    return bad(msg, status);
  }
};
