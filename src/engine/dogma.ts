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

      if (
        progressed
        && !effect.isDemand
        && targetId !== run.activatingPlayerId
      ) {
        run.sharedBonus = true;
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
  if (run.sharedBonus && !g.endByDraw) {
    const activator = g.players[run.activatingPlayerId];
    draw(g, run.activatingPlayerId, Math.max(1, highestTopAge(activator)));
  }
  g.dogmaRun = null;
  return true;
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
