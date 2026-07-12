// Dogma driver — runs a card's effects against the right set of players in the
// right order, with frozen icon counts and the shared-bonus draw.
//
// Ported from Innovation.Core/DogmaEngine.cs. Two entry points: `startDogma`
// (cold start — freezes icon counts, kicks off level 0) and `resumeDogma`
// (called from the `resolveChoice` move with the player's answer). Both return
// `true` if the dogma resolved to completion, `false` if it paused awaiting
// another choice. Live state lives on `G.dogmaRun` so resumption survives the
// move boundary.
//
// Sharing/demand rules (rulebook + VB6 main.frm 3719+, 4251+):
//   - Demand: each OTHER player with strictly fewer featured icons than the
//     activator, in turn order starting from the activator's left.
//   - Share (non-demand): each OTHER player with ≥ featured icons, clockwise
//     from the activator's left; THEN the activator last.
//   - Featured-icon counts are FROZEN at activation; if a handler mutates a
//     board mid-dogma, eligibility for the next level still uses activation
//     counts.
//   - Shared-bonus draw: if any non-active player progressed a non-demand
//     effect, the activator draws one extra card at the end (value = highest
//     top age, the standard draw rule).
//
// NOT YET PORTED (deferred to Phase 2 alongside the cards that need them):
//   - Nested "execute card X for self only" frames (Robotics / Self Service /
//     Computers / Software / Satellites). None of the currently-ported handlers
//     queue these; the type is reserved for when they're added.
//   - The `DemandSuccessful` flag (Oars). Add when Oars is ported.

import { cardById } from '../card-data';
import { countIcons } from './icons';
import { getDogma } from './registry';
import { draw, highestTopAge } from './mechanics';
import { logEvent } from './log';
import type {
  ChoiceResponse, DogmaRun, EffectContext, InnovationState,
} from './types';

/** Begin a dogma. Returns `true` if it ran to completion in this call,
 *  `false` if it paused awaiting a player choice. */
export function startDogma(
  g: InnovationState,
  cardId: number,
  activatingPlayerId: string,
): boolean {
  const def = cardById(cardId);
  const frozen: Record<string, number> = {};
  for (const pid of Object.keys(g.players)) {
    frozen[pid] = countIcons(g.players[pid], def.dogmaIcon);
  }
  const run: DogmaRun = {
    cardId,
    activatingPlayerId,
    featuredIcon: def.dogmaIcon,
    frozenIconCounts: frozen,
    currentLevel: 0,
    currentTargets: [],
    currentTargetIndex: 0,
    sharedBonus: false,
    handlerState: {},
    demandSuccessful: false,
    nestedFrames: [],
    fissionWiped: false,
    pausedInNested: false,
  };
  g.dogmaRun = run;
  return drive(g, undefined);
}

/** Resume a paused dogma with the player's answer to the pending choice. */
export function resumeDogma(g: InnovationState, response: ChoiceResponse): boolean {
  if (!g.dogmaRun) throw new Error('resumeDogma: no active dogma run');
  g.pendingChoice = null;
  return drive(g, response);
}

/** The level/target loop. Called once on start and once per resume; `response`
 *  is undefined on cold entry and on every iteration AFTER the first when a
 *  resume cascades through multiple targets. */
function drive(g: InnovationState, response: ChoiceResponse | undefined): boolean {
  const run = g.dogmaRun!;
  const def = cardById(run.cardId);
  const handler = getDogma(def.title); // undefined → placeholder no-op

  // If the most recent pause was inside a nested frame, route the response
  // back into the nested drainer first. The main handler for the current
  // target already completed (and its sharedBonus was accounted for) before
  // the nested pause, so on successful drain we advance past this target
  // before re-entering the main loop.
  if (run.pausedInNested) {
    run.pausedInNested = false;
    if (!drainNestedFrames(g, response)) return false;
    response = undefined;
    if (g.winnerOverride || g.endByDraw) {
      g.dogmaRun = null;
      return true;
    }
    // Past-target bookkeeping (sharedBonus already credited pre-drain).
    run.currentTargetIndex++;
    run.handlerState = {};
  }

  while (run.currentLevel < def.effects.length) {
    const effect = def.effects[run.currentLevel];

    // Targets are computed once per level boundary, using frozen icon counts.
    if (run.currentTargets.length === 0 && run.currentTargetIndex === 0) {
      run.currentTargets = computeTargets(
        Object.keys(g.players).sort(),
        run.activatingPlayerId,
        effect.isDemand,
        run.frozenIconCounts,
      );
    }

    while (run.currentTargetIndex < run.currentTargets.length) {
      const targetId = run.currentTargets[run.currentTargetIndex];
      let progressed = false;

      if (handler) {
        const ctx: EffectContext = {
          levelIndex: run.currentLevel,
          response,
          handlerState: run.handlerState,
          pendingChoice: null,
        };
        const result = handler(g, targetId, ctx);
        // void/undefined/true = progressed; explicit false = no-op.
        progressed = result !== false;
        run.handlerState = ctx.handlerState;
        response = undefined; // consumed by this call

        if (ctx.pendingChoice) {
          g.pendingChoice = ctx.pendingChoice;
          return false; // pause — same target/level on resume
        }
      }
      // (handler === undefined → placeholder card: progressed stays false)

      // Credit sharedBonus BEFORE draining nested frames so that if the
      // drain pauses, the resume path doesn't need to redo this step.
      if (progressed && effect.isDemand) {
        logEvent(g, {
          kind: 'dogma.demand', side: run.activatingPlayerId,
          msg: `P${targetId} is affected by ${def.title}'s demand.`,
          payload: { card: run.cardId, level: run.currentLevel, target: targetId },
        });
      }
      if (
        progressed
        && !effect.isDemand
        && targetId !== run.activatingPlayerId
      ) {
        logEvent(g, {
          kind: 'dogma.share', side: run.activatingPlayerId,
          msg: `P${targetId} shares ${def.title}'s effect.`,
          payload: { card: run.cardId, level: run.currentLevel, target: targetId },
        });
        run.sharedBonus = true;
      }

      // Drain any "execute card X for self only" frames queued by the
      // handler before advancing past this target.
      if (!drainNestedFrames(g, undefined)) return false;

      if (g.winnerOverride) {
        g.dogmaRun = null;
        return true;
      }

      // Advance to next target with a fresh handler scratch slot.
      run.currentTargetIndex++;
      run.handlerState = {};

      if (g.endByDraw) {
        g.dogmaRun = null;
        return true;
      }
    }

    run.currentLevel++;
    run.currentTargetIndex = 0;
    run.currentTargets = [];
  }

  // All levels finished. Shared-bonus draw fires once per dogma.
  if (run.sharedBonus && !g.endByDraw && !g.winnerOverride) {
    const activator = g.players[run.activatingPlayerId];
    logEvent(g, {
      kind: 'dogma.shareDraw', side: run.activatingPlayerId,
      msg: `P${run.activatingPlayerId} draws a bonus card for the shared dogma.`,
      payload: { player: run.activatingPlayerId, card: run.cardId },
    });
    draw(g, run.activatingPlayerId, Math.max(1, highestTopAge(activator)));
  }
  g.dogmaRun = null;
  return true;
}

/** Drain the queued "execute card X for player Y, non-demand only" frames
 *  (Robotics, Self Service, Computers eff2, Software eff2, Satellites eff3).
 *  Mirrors C# `DogmaEngine.RunNestedFrames`. Each frame runs that card's
 *  non-demand effects against ONE player only (no sharing/demand), with its
 *  own handler scratch state. Returns false (and sets `pausedInNested`) if
 *  the current frame's handler paused; true if every frame ran to completion.
 *  `resumeResponse` (if non-undefined) goes to the top frame's handler — the
 *  driver passes it through on the first iteration after a paused resume. */
function drainNestedFrames(
  g: InnovationState,
  resumeResponse: ChoiceResponse | undefined,
): boolean {
  const run = g.dogmaRun!;
  let response = resumeResponse;
  while (run.nestedFrames.length > 0) {
    const frame = run.nestedFrames[run.nestedFrames.length - 1];
    const def = cardById(frame.cardId);
    const handler = getDogma(def.title);
    while (frame.effectIndex < def.effects.length) {
      const effect = def.effects[frame.effectIndex];
      // Self-only execution: skip demand effects entirely.
      if (effect.isDemand) { frame.effectIndex++; continue; }

      if (handler) {
        const ctx: EffectContext = {
          levelIndex: frame.effectIndex,
          response,
          handlerState: frame.handlerState,
          pendingChoice: null,
        };
        handler(g, frame.targetPlayerId, ctx);
        frame.handlerState = ctx.handlerState;
        response = undefined;
        if (ctx.pendingChoice) {
          g.pendingChoice = ctx.pendingChoice;
          run.pausedInNested = true;
          return false;
        }
      }

      if (g.winnerOverride || g.endByDraw) {
        run.nestedFrames.length = 0;
        return true;
      }

      frame.effectIndex++;
      frame.handlerState = {};
    }
    run.nestedFrames.pop();
  }
  return true;
}

/** Queue a nested "execute card X's non-demand effects for player Y only"
 *  frame (Robotics, Self Service, Computers eff2, Software eff2, Satellites
 *  eff3). The driver drains the stack after the calling handler returns. */
export function executeSelfOnly(
  g: InnovationState,
  cardId: number,
  targetPlayerId: string,
): void {
  if (!g.dogmaRun) throw new Error('executeSelfOnly: no active dogma');
  g.dogmaRun.nestedFrames.push({
    cardId,
    targetPlayerId,
    effectIndex: 0,
    handlerState: {},
  });
}

/** Player ids the current effect runs against, in turn order. Exported for
 *  tests; production code goes through `drive`. */
export function computeTargets(
  playerIdsSorted: string[],
  activatingPlayerId: string,
  isDemand: boolean,
  frozenIconCounts: Record<string, number>,
): string[] {
  const n = playerIdsSorted.length;
  const activatorIdx = playerIdsSorted.indexOf(activatingPlayerId);
  const activatorIcons = frozenIconCounts[activatingPlayerId];
  const out: string[] = [];

  if (isDemand) {
    for (let i = 1; i < n; i++) {
      const pid = playerIdsSorted[(activatorIdx + i) % n];
      if (frozenIconCounts[pid] < activatorIcons) out.push(pid);
    }
  } else {
    // Sharers (clockwise from activator's left), then activator last.
    for (let i = 1; i < n; i++) {
      const pid = playerIdsSorted[(activatorIdx + i) % n];
      if (frozenIconCounts[pid] >= activatorIcons) out.push(pid);
    }
    out.push(activatingPlayerId);
  }
  return out;
}
