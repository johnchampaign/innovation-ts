// HTTP shim that implements GameClientApi against the Pages Functions backend
// (functions/api/[[path]].ts). useGame from the framework consumes this.
//
// Errors surface as thrown Error — useGame's `error` slot will catch them.

import type { GameClientApi, MessagingClientApi } from 'digital-boardgame-framework/client';
import type { BgioState, InnovationAction } from '../adapter/innovationAdapter';

export interface CreateGameResult {
  gameId: string;
  invites: Record<string, string>;
}

async function readJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try { const body = await res.json() as { error?: string }; if (body?.error) msg = body.error; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return await res.json() as T;
}

/** Lobby-side: POST /api/games to create. Not part of GameClientApi (no token yet). */
export async function createGame(numPlayers: number): Promise<CreateGameResult> {
  const res = await fetch('/api/games', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ numPlayers }),
  });
  return readJson<CreateGameResult>(res);
}

/** Build a GameClientApi for a specific (gameId, token). useGame polls it.
 *  `getIdentityToken` (ranked play) supplies the player's current hub identity
 *  token; when present it rides along on each submit so the server can attribute
 *  the seat (best-effort, idempotent — turns are sequential). */
export function makeClient(
  gameId: string,
  token: string,
  getIdentityToken?: () => string | undefined,
): GameClientApi<BgioState, InnovationAction> {
  const base = `/api/games/${encodeURIComponent(gameId)}`;
  const q = `?token=${encodeURIComponent(token)}`;

  return {
    async fetch() {
      return readJson(await window.fetch(`${base}${q}`));
    },
    async submit(action) {
      return readJson(await window.fetch(`${base}/submit${q}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, identityToken: getIdentityToken?.() }),
      }));
    },
    async legalActions() {
      return readJson(await window.fetch(`${base}/legal${q}`));
    },
    async report(submission) {
      return readJson(await window.fetch(`${base}/report${q}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(submission),
      }));
    },
  };
}

/** Attach the player's hub identity to their seat (ranked). Best-effort —
 *  ranked attribution never blocks play, so any failure is swallowed. */
export async function claimSeat(gameId: string, token: string, identityToken: string): Promise<void> {
  try {
    await fetch(`/api/games/${encodeURIComponent(gameId)}/claim?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identityToken }),
    });
  } catch { /* ranked attribution is optional */ }
}

/** Build a MessagingClientApi for in-game chat over the /chat routes.
 *  Both calls return the refreshed ChatMessage[] (the framework's
 *  useMessages / ChatPanel consume it). Same per-seat token auth as the
 *  game client — the server stamps the sender seat from the token. */
export function makeMessagingClient(
  gameId: string,
  token: string,
): MessagingClientApi {
  const base = `/api/games/${encodeURIComponent(gameId)}/chat`;
  const q = `?token=${encodeURIComponent(token)}`;
  return {
    async listMessages() {
      return readJson(await window.fetch(`${base}${q}`));
    },
    async postMessage(body: string) {
      return readJson(await window.fetch(`${base}${q}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body }),
      }));
    },
  };
}
