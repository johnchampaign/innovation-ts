// Server-side AI opponent for online play. Wraps the existing greedy depth-1
// AI (src/ai/greedy.ts) as a framework PlayerController so the GameServer can
// drive AI seats itself — the human's client never picks AI moves, and the AI
// shows on the leaderboard as "🤖 AI (standard)" under id `ai:innovation:standard`.
//
// Difficulty key 'standard' = the greedy controller. Bump the key (e.g.
// 'standard@2') if the AI's strength ever changes, so it earns a fresh rating
// instead of dragging the old one.
//
// Server-portable: greedy.ts and its dependency chain (adapter, card-data,
// engine/types, evaluator) are pure — no window/document/import.meta.env.

import type { PlayerController } from 'digital-boardgame-framework';
import type { BgioState, InnovationAction, PlayerId } from '../adapter/innovationAdapter';
import { pickAction } from './greedy';

/** The greedy AI as a server-driven controller. Always returns a legal
 *  Action; if the greedy pick throws or is somehow rejected, fall back to the
 *  first legal action so an AI seat can never wedge a game. */
const standard: PlayerController<BgioState, InnovationAction, PlayerId> = {
  async selectAction(ctx) {
    const state = ctx.state as BgioState;
    const actor = ctx.actor as PlayerId;
    try {
      return pickAction(state, actor);
    } catch {
      const legal = ctx.adapter.legalActions(state, actor);
      return legal[0];
    }
  },
};

export const innovationAiControllers: Record<string, PlayerController<BgioState, InnovationAction, PlayerId>> = {
  standard,
};
