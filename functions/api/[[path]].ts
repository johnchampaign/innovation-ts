// Cloudflare Pages Functions backend for the lobby + game API.
// Routes:
//   POST  /api/games                    body: {numPlayers} → {gameId, invites}
//   GET   /api/games/:id?token=...      → ViewResult
//   GET   /api/games/:id/legal?token=…  → Action[]
//   POST  /api/games/:id/submit?token=… body: action → ViewResult
//   POST  /api/games/:id/report?token=… body: report → {reportId}
//
// Token auth: each player's token (returned at createGame) is their seat
// credential — the GameServer resolves it to a player id internally.
//
// Single deployable. Runs on Workers (V8 isolates); SupabaseStore makes
// the persistence layer Workers-compatible. FsStore is not used because it
// requires `fs` (Node-only).

import { createClient } from '@supabase/supabase-js';
import { GameServer, SupabaseStore, NoopNotifier } from 'digital-boardgame-framework/server';
import { jsonCodec } from 'digital-boardgame-framework';
import { innovationAdapter, initialBgioState, type BgioState, type InnovationAction, type PlayerId } from '../../src/adapter/innovationAdapter';

interface Env {
  SUPABASE_URL: string;
  /** Service-role key. Named to match the framework convention used across
   *  the other games (tyrants-online, star-wars-rebellion) so one Supabase
   *  project's secret can be shared. */
  SUPABASE_SERVICE_ROLE_KEY: string;
  PUBLIC_ORIGIN?: string;
}

interface RouteCtx { request: Request; env: Env; }

function server(env: Env, origin: string) {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  return new GameServer<BgioState, InnovationAction, PlayerId>({
    adapter: innovationAdapter,
    codec: jsonCodec<BgioState>(),
    store: new SupabaseStore(supabase),
    notifier: new NoopNotifier(),
    gameUrl: (gameId, token) =>
      `${origin}/?game=${encodeURIComponent(gameId)}&token=${encodeURIComponent(token)}`,
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

export const onRequest = async ({ request, env }: RouteCtx): Promise<Response> => {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api/, ''); // /games, /games/:id/legal, …
  const token = url.searchParams.get('token') ?? undefined;

  try {
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
      // POST /games/:id/submit
      if (rest === '/submit' && request.method === 'POST') {
        const action = await readJson<InnovationAction>(request);
        return json(await srv.submit(gameId, token, action));
      }
      // POST /games/:id/report
      if (rest === '/report' && request.method === 'POST') {
        const body = await readJson<Parameters<typeof srv.report>[2]>(request);
        return json(await srv.report(gameId, token, body));
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
