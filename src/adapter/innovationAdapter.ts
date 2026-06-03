// GameAdapter for Innovation — Option A: WRAP boardgame.io's reducer, exactly
// like the Tyrants port. The framework `State` is bgio's FULL serializable
// state (`{ G, ctx, plugins, … }`) so the `random` plugin's seed rides inside
// the snapshot and shuffles replay deterministically.

import type { GameAdapter, GameResult } from 'digital-boardgame-framework';
import { CreateGameReducer, InitializeGame } from 'boardgame.io/internal';
import { InnovationGame, type InnovationGameOver } from '../game';
import { highestTopAge, score, topCard } from '../engine/mechanics';
import { COLORS, type Color, type ChoiceResponse, type InnovationState } from '../engine/types';

export type PlayerId = string;

export type InnovationAction =
  | { kind: 'draw' }
  | { kind: 'meld'; handIndex: number }
  | { kind: 'dogma'; color: Color }
  | { kind: 'achieve'; age: number }
  | { kind: 'resolveChoice'; response: ChoiceResponse };

export interface BgioState {
  G: InnovationState;
  ctx: {
    currentPlayer: string;
    numPlayers: number;
    turn: number;
    gameover?: InnovationGameOver;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

type AnyReducer = (s: BgioState, action: unknown) => BgioState;
let _reducer: AnyReducer | null = null;
function reducer(): AnyReducer {
  if (!_reducer) _reducer = CreateGameReducer({ game: InnovationGame }) as unknown as AnyReducer;
  return _reducer;
}

export function initialBgioState(numPlayers: number): BgioState {
  return InitializeGame({ game: InnovationGame, numPlayers }) as unknown as BgioState;
}

function toBgioAction(action: InnovationAction, actor: PlayerId): unknown {
  const mk = (type: string, args: unknown[]) => ({ type: 'MAKE_MOVE', payload: { type, args, playerID: actor } });
  switch (action.kind) {
    case 'draw': return mk('drawAction', []);
    case 'meld': return mk('meldAction', [action.handIndex]);
    case 'dogma': return mk('dogmaAction', [action.color]);
    case 'achieve': return mk('achieveAction', [action.age]);
    case 'resolveChoice': return mk('resolveChoice', [action.response]);
  }
}

function currentActorOf(state: BgioState): PlayerId | null {
  if (state.ctx.gameover) return null;
  const pc = state.G.pendingChoice;
  if (pc) return pc.playerId;
  return state.ctx.currentPlayer;
}

function enumerateLegal(state: BgioState, actor: PlayerId): InnovationAction[] {
  if (state.ctx.gameover) return [];
  if (currentActorOf(state) !== actor) return [];
  const G = state.G;

  if (G.pendingChoice) {
    if (G.pendingChoice.playerId !== actor) return [];
    return enumerateChoiceResponses(G);
  }

  const p = G.players[actor];
  const out: InnovationAction[] = [{ kind: 'draw' }];
  for (let i = 0; i < p.hand.length; i++) out.push({ kind: 'meld', handIndex: i });
  for (const c of COLORS) if (topCard(p, c) !== null) out.push({ kind: 'dogma', color: c });
  for (const age of G.availableAgeAchievements) {
    if (score(p) >= 5 * age && highestTopAge(p) >= age) out.push({ kind: 'achieve', age });
  }
  return out;
}

function enumerateChoiceResponses(G: InnovationState): InnovationAction[] {
  const pc = G.pendingChoice!;
  const out: InnovationAction[] = [];
  if (pc.optional) out.push({ kind: 'resolveChoice', response: null });
  switch (pc.kind) {
    case 'select-hand-card':
    case 'select-board-color':
      for (const o of pc.options) out.push({ kind: 'resolveChoice', response: o });
      break;
    case 'yes-no':
      out.push({ kind: 'resolveChoice', response: true });
      out.push({ kind: 'resolveChoice', response: false });
      break;
    case 'select-hand-card-subset': {
      // Display-grade enumeration (not the full power set): one prefix per
      // legal size in [min..max], plus the "decline" if min==0. Crucially
      // every emitted response respects min/max — earlier versions emitted
      // singletons even when min>1 (e.g. Tools min=3), causing legalActions
      // to lie to the random rollout. Enough for the random AI; the UI
      // builds its own picker, and we can broaden if a card needs more.
      const min = pc.minCount ?? 0;
      const max = pc.maxCount ?? pc.options.length;
      if (min === 0) out.push({ kind: 'resolveChoice', response: [] });
      const startSize = Math.max(min, 1);
      for (let sz = startSize; sz <= max; sz++) {
        out.push({ kind: 'resolveChoice', response: pc.options.slice(0, sz) });
      }
      // Singletons (only when min ≤ 1).
      if (min <= 1 && max >= 1) {
        for (const o of pc.options) out.push({ kind: 'resolveChoice', response: [o] });
      }
      break;
    }
  }
  return out;
}

const HIDDEN = -1;

function redact(state: BgioState, viewer: PlayerId | null): BgioState {
  const next = structuredClone(state);
  const G = next.G;
  // Supply decks are face-down to everyone.
  for (let a = 1; a < G.decks.length; a++) G.decks[a] = G.decks[a].map(() => HIDDEN);
  // Opponent hands are secret.
  for (const [pid, p] of Object.entries(G.players)) {
    if (pid !== viewer) p.hand = p.hand.map(() => HIDDEN);
  }
  // A pending choice the viewer doesn't own can leak hidden info via its
  // options/prompt — keep only kind + owner.
  if (G.pendingChoice && G.pendingChoice.playerId !== viewer) {
    G.pendingChoice = {
      kind: G.pendingChoice.kind, prompt: '', playerId: G.pendingChoice.playerId,
      options: [], optional: G.pendingChoice.optional,
    };
  }
  return next;
}

function resultOf(state: BgioState): GameResult<PlayerId> | null {
  const go = state.ctx.gameover;
  if (!go) return null;
  return { winners: go.winners, reason: go.reason };
}

export const innovationAdapter: GameAdapter<BgioState, InnovationAction, PlayerId> = {
  schemaVersion: 1,

  applyAction(state, action, actor) {
    const input = structuredClone(state);
    const next = reducer()(input, toBgioAction(action, actor));
    if (next === input || next.G === input.G) {
      throw new Error(`applyAction: illegal ${action.kind} for ${actor}`);
    }
    return next;
  },

  tryApplyAction(state, action, actor) {
    const input = structuredClone(state);
    let next: BgioState;
    try {
      next = reducer()(input, toBgioAction(action, actor));
    } catch (e) {
      return { state, ok: false, reason: String((e as Error)?.message ?? e) };
    }
    if (next === input || next.G === input.G) {
      return { state, ok: false, reason: 'INVALID_MOVE (engine rejected)' };
    }
    return { state: next, ok: true };
  },

  legalActions(state, actor) { return enumerateLegal(state, actor); },
  currentActor(state) { return currentActorOf(state); },
  viewFor(state, viewer) { return state.ctx.gameover ? state : redact(state, viewer); },
  result(state) { return resultOf(state); },
  migrate() { throw new Error('innovationAdapter.migrate: no migrations yet (schemaVersion 1)'); },
};
