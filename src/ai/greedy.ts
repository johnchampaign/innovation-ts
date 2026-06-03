// Greedy depth-1 AI — port of Innovation.Core/Players/GreedyController.cs.
//
// For every top-level action in the legal set, clone the state, apply the
// candidate (auto-resolving any in-flight dogma choices via the same
// heuristic that drives real play), score the resulting position with
// scoreRelative, pick the best.
//
// In-dogma prompts use handcrafted defaults that match the C# version:
//   - select-hand-card → LOWEST age (give up the least valuable card)
//   - select-hand-card-subset → LOWEST N, except Masonry (HIGHEST: melding
//     the best castles) and Democracy (always 1: returning more than 1
//     for a maybe-reward is rarely worth it)
//   - select-score-card → LOWEST if defending a demand, HIGHEST if taking
//   - yes-no → true by default; Canal Building computes net score change;
//     Road Building rejects when the opponent's top green is empty
//   - select-board-color → tallest pile
//   - select-value, select-card-order, select-player → first / unchanged
//
// No-op penalty: if a dogma activation produces zero observable change in
// any player's hand / score-pile / piles / splay, the trial returns a
// near-min score so the AI won't keep burning actions on dead activations.

import { innovationAdapter as A, type BgioState, type InnovationAction, type PlayerId } from '../adapter/innovationAdapter';
import { cardById } from '../card-data';
import { COLORS } from '../engine/types';
import type { Color, ChoiceResponse, PendingChoice } from '../engine/types';
import { scoreRelative } from './evaluator';

/** Stable JSON deep clone — the same trick the adapter's tryApplyAction uses.
 *  We don't need structuredClone here because BgioState is JSON-serialisable
 *  by construction (boardgame.io persists it as JSON every turn). */
function clone(state: BgioState): BgioState {
  return JSON.parse(JSON.stringify(state)) as BgioState;
}

/** Pick a response to the currently-pending choice using greedy heuristics
 *  that match the C# in-dogma defaults. Exported so the lobby's AI driver
 *  can call it directly for choices owned by the AI's seat. */
export function pickChoiceResponse(
  state: BgioState,
  selfId: PlayerId,
): ChoiceResponse {
  const pc = state.G.pendingChoice;
  if (!pc) throw new Error('pickChoiceResponse: no pending choice');
  const G = state.G;
  const self = G.players[selfId];

  switch (pc.kind) {
    case 'select-hand-card': {
      if (pc.options.length === 0) return pc.optional ? null : 0;
      // Lowest age: minimise the cost of whatever the handler does next.
      let best = pc.options[0];
      let bestAge = cardById(best).age;
      for (const id of pc.options) {
        const age = cardById(id).age;
        if (age < bestAge) { bestAge = age; best = id; }
      }
      return best;
    }

    case 'select-score-card': {
      if (pc.options.length === 0) return pc.optional ? null : 0;
      // Defending (this seat is the one losing the card) → give up lowest.
      // Otherwise (Optics-style taking) → take highest.
      const defending = pc.playerId === selfId;
      const sorted = [...pc.options].sort((a, b) =>
        defending ? cardById(a).age - cardById(b).age : cardById(b).age - cardById(a).age,
      );
      return sorted[0];
    }

    case 'select-hand-card-subset': {
      const max = Math.min(pc.maxCount ?? pc.options.length, pc.options.length);
      const min = Math.min(pc.minCount ?? 0, max);
      if (max === 0) return [];

      // Democracy: returning more than 1 is rarely worth it; cap at 1.
      if (pc.prompt.startsWith('Democracy:')) {
        const target = Math.max(min, Math.min(1, max));
        const ordered = [...pc.options].sort((a, b) => cardById(a).age - cardById(b).age);
        return ordered.slice(0, target);
      }

      // Masonry melds the picks onto the board → want HIGHEST-age castles.
      const wantHigh = pc.prompt.startsWith('Masonry:');
      const ordered = [...pc.options].sort((a, b) =>
        wantHigh ? cardById(b).age - cardById(a).age : cardById(a).age - cardById(b).age,
      );
      return ordered.slice(0, Math.max(min, max));
    }

    case 'select-score-card-subset': {
      const max = Math.min(pc.maxCount ?? pc.options.length, pc.options.length);
      const min = Math.min(pc.minCount ?? 0, max);
      const ordered = [...pc.options].sort((a, b) => cardById(a).age - cardById(b).age);
      return ordered.slice(0, Math.max(min, max));
    }

    case 'yes-no': {
      // Canal Building: yes iff net score change > 0.
      if (pc.prompt.startsWith('Canal Building:')) {
        const handHi = self.hand.length === 0 ? 0
          : Math.max(...self.hand.map((id) => cardById(id).age));
        const scoreHi = self.scorePile.length === 0 ? 0
          : Math.max(...self.scorePile.map((id) => cardById(id).age));
        const handMovers = self.hand.filter((id) => cardById(id).age === handHi).length;
        const scoreMovers = self.scorePile.filter((id) => cardById(id).age === scoreHi).length;
        return (handHi * handMovers) - (scoreHi * scoreMovers) > 0;
      }
      // Road Building: no if the named opponent has no top green.
      if (pc.prompt.startsWith('Road Building:')) {
        const m = pc.prompt.match(/player (\d+)/);
        if (m) {
          const opp = m[1]; // already 0-indexed in TS prompts
          const o = G.players[opp];
          if (o && o.piles.green.cards.length === 0) return false;
        }
        return true;
      }
      return true;
    }

    case 'select-board-color': {
      if (pc.options.length === 0) return pc.optional ? null : 0;
      // Prefer the color with the tallest pile of the answering player's
      // own board (the choice owner is who's being asked).
      const answerer = G.players[pc.playerId];
      let best = pc.options[0];
      let bestCount = answerer.piles[COLORS[best]].cards.length;
      for (const idx of pc.options) {
        const n = answerer.piles[COLORS[idx]].cards.length;
        if (n > bestCount) { bestCount = n; best = idx; }
      }
      return best;
    }

    case 'select-value':
      return pc.options.length > 0 ? pc.options[0] : (pc.optional ? null : 0);

    case 'select-card-order':
      // No preference — return given order unchanged.
      return [...pc.options];

    case 'select-player':
      return pc.options.length > 0 ? pc.options[0] : (pc.optional ? null : 0);

    default:
      return null;
  }
}

/** Drive the dogma to completion in a clone — repeatedly responding to
 *  whichever seat owns the pending choice using the greedy heuristic. Used
 *  inside the trial loop so the post-action score reflects the actual
 *  played-out state rather than a paused mid-dogma snapshot. */
function playOutDogma(state: BgioState, selfId: PlayerId): BgioState {
  let cur = state;
  // Bound the loop defensively — a real game has ~30 pauses max per dogma.
  for (let i = 0; i < 200; i++) {
    if (!cur.G.pendingChoice) return cur;
    const owner = cur.G.pendingChoice.playerId;
    const resp = pickChoiceResponseFor(cur, owner, selfId);
    try {
      cur = A.applyAction(cur, { kind: 'resolveChoice', response: resp }, owner);
    } catch {
      // Invalid response — bail; outer trial will treat as max-bad.
      return cur;
    }
  }
  return cur;
}

/** Choice picker that uses the same heuristic for every seat in a rollout.
 *  Earlier versions of the C# used a randomised opponent picker; the rational
 *  default produces tighter projections. */
function pickChoiceResponseFor(
  state: BgioState,
  actorId: PlayerId,
  _selfId: PlayerId,
): ChoiceResponse {
  // Currently the picker doesn't differentiate self vs opponent — both use
  // the same conservative defaults. Kept as a separate function so a future
  // RationalOpponentController distinction can slot in without API change.
  return pickChoiceResponse(state, actorId);
}

/** Coarse fingerprint check: do all players have the same hand size, score
 *  pile size, per-color pile size, and splay direction in both states? If so,
 *  the dogma changed nothing observable and the action was wasted.
 *  Mirrors C# IsTotalNoOp. */
function isTotalNoOp(before: BgioState, after: BgioState): boolean {
  const bIds = Object.keys(before.G.players);
  const aIds = Object.keys(after.G.players);
  if (bIds.length !== aIds.length) return false;
  for (const pid of bIds) {
    const pb = before.G.players[pid];
    const pa = after.G.players[pid];
    if (!pa) return false;
    if (pb.hand.length !== pa.hand.length) return false;
    if (pb.scorePile.length !== pa.scorePile.length) return false;
    for (const c of COLORS) {
      if (pb.piles[c].cards.length !== pa.piles[c].cards.length) return false;
      if (pb.piles[c].splay !== pa.piles[c].splay) return false;
    }
  }
  return true;
}

/** Score the position reached by applying `action` in a cloned state, with
 *  any resulting dogma played out using greedy responses. Catches throws
 *  (invalid moves, defensive shimming) and returns -Infinity so the
 *  candidate is discarded. */
function tryAction(
  state: BgioState,
  selfId: PlayerId,
  action: InnovationAction,
): number {
  let after: BgioState;
  try {
    after = A.applyAction(clone(state), action, selfId);
  } catch {
    return Number.NEGATIVE_INFINITY;
  }
  // Run any resulting dogma to completion.
  after = playOutDogma(after, selfId);
  // No-op penalty: dogma activations that change nothing burn an action.
  if (action.kind === 'dogma' && isTotalNoOp(state, after)) {
    return Number.NEGATIVE_INFINITY / 2;
  }
  return scoreRelative(after, selfId, 1);
}

/** Top-level greedy pick: enumerate legal actions, score each via a 1-ply
 *  trial, return the highest-scoring action. If `state` has a pending choice
 *  for `selfId`, delegate to pickChoiceResponse instead — that's actually a
 *  separate code path in the lobby driver, but exposing it here lets a
 *  single `pickAction` call do the right thing in either situation. */
export function pickAction(
  state: BgioState,
  selfId: PlayerId,
): InnovationAction {
  // If we own a pending choice, return the resolveChoice action with the
  // heuristic response.
  if (state.G.pendingChoice && state.G.pendingChoice.playerId === selfId) {
    return { kind: 'resolveChoice', response: pickChoiceResponse(state, selfId) };
  }
  const legal = A.legalActions(state, selfId);
  if (legal.length === 0) {
    throw new Error(`pickAction: no legal actions for ${selfId}`);
  }
  if (legal.length === 1) return legal[0];

  let best = legal[0];
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const action of legal) {
    const s = tryAction(state, selfId, action);
    if (s > bestScore) { bestScore = s; best = action; }
  }
  return best;
}

// Re-exports for tests + later instrumentation.
export { isTotalNoOp, playOutDogma, clone as cloneState };
// Suppress unused-import warning on PendingChoice — re-exported for callers
// who want the type without importing engine/types directly.
export type { PendingChoice, Color };
