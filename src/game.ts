// boardgame.io game definition for Innovation. The framework wraps THIS via the
// Option-A adapter (adapter/innovationAdapter.ts), exactly like Tyrants.
//
// Ported from Innovation.Core: GameSetup (deal), TurnManager (actions/turn),
// the four standard actions (Draw/Meld/Dogma/Achieve), and the DogmaEngine
// pause/resume protocol (here: a pending choice stored in G + a `resolveChoice`
// move that re-enters the handler).

import type { Game, Ctx } from 'boardgame.io';
import { INVALID_MOVE } from 'boardgame.io/core';
import './engine/handlers'; // register dogma handlers (side-effect import)
import { ALL_CARDS, cardById } from './card-data';
import { startDogma, resumeDogma } from './engine/dogma';
import {
  achievementCount, highestTopAge, score, topCard,
} from './engine/mechanics';
import type {
  InnovationState, PlayerData, Color, ChoiceResponse,
} from './engine/types';
import { COLORS } from './engine/types';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function newPlayer(): PlayerData {
  const piles = {} as Record<Color, { cards: number[]; splay: 'none' }>;
  for (const c of COLORS) piles[c] = { cards: [], splay: 'none' };
  return {
    hand: [], scorePile: [], piles,
    ageAchievements: [], specialAchievements: [],
    scoredThisTurn: 0, tuckedThisTurn: 0,
  };
}

interface SetupApi { Shuffle<T>(deck: T[]): T[]; }

function setup({ ctx, random }: { ctx: Ctx; random: SetupApi }): InnovationState {
  const g: InnovationState = {
    decks: Array.from({ length: 11 }, () => [] as number[]),
    players: {},
    availableAgeAchievements: [],
    availableSpecialAchievements: ['Monument', 'Empire', 'World', 'Wonder', 'Universe'],
    actionsRemaining: 1,
    pendingChoice: null,
    dogmaRun: null,
    endByDraw: false,
    log: [],
  };

  for (const c of ALL_CARDS) g.decks[c.age].push(c.id);
  for (let a = 1; a <= 10; a++) g.decks[a] = random.Shuffle(g.decks[a]);

  // Reserve one achievement tile per age 1–9 (drop the top card; the age
  // becomes claimable). C# GameSetup does the same.
  for (let a = 1; a <= 9; a++) {
    if (g.decks[a].length > 0) g.decks[a].shift();
    g.availableAgeAchievements.push(a);
  }

  for (let i = 0; i < ctx.numPlayers; i++) g.players[String(i)] = newPlayer();
  // Deal 2 age-1 cards to each player.
  for (let i = 0; i < ctx.numPlayers; i++) {
    for (let k = 0; k < 2; k++) {
      const id = g.decks[1].shift();
      if (id !== undefined) g.players[String(i)].hand.push(id);
    }
  }
  // NOTE (spike simplification): the simultaneous opening meld that decides the
  // start player is not modelled yet; player '0' starts. See PORT-PLAN.md.
  return g;
}

// ---------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------

/** Events surface we use. `setActivePlayers({ value: {...} })` puts the choice
 *  owner into the `awaitingChoice` stage so non-current-player sharers can
 *  resolve their own pause; `value: {}` clears (back to normal currentPlayer
 *  control). See node_modules/boardgame.io ... SetActivePlayers (turn-order). */
interface MoveEvents {
  endTurn: () => void;
  setActivePlayers: (arg: {
    value?: Record<string, string>;
    currentPlayer?: string;
  }) => void;
}

interface MoveApi { G: InnovationState; ctx: Ctx; events: MoveEvents; }

/** Sync the bgio stage to the current pending choice. Called after every
 *  dogma start/resume. If a choice is pending, put its owner in the
 *  `awaitingChoice` stage; otherwise clear active players so the activator's
 *  normal turn resumes. */
function syncChoiceStage(G: InnovationState, events: MoveEvents): void {
  if (G.pendingChoice) {
    events.setActivePlayers({ value: { [G.pendingChoice.playerId]: 'awaitingChoice' } });
  } else {
    events.setActivePlayers({ value: {} });
  }
}

function spendAction(G: InnovationState, events: MoveEvents): void {
  G.actionsRemaining -= 1;
  if (G.actionsRemaining <= 0 && !G.pendingChoice) events.endTurn();
}

/** Guard: no normal action may run while a choice is pending. */
function choicePending(G: InnovationState): boolean {
  return G.pendingChoice !== null;
}

const moves = {
  // Draw a card of value = max(1, highest top-card age).
  drawAction({ G, ctx, events }: MoveApi) {
    if (choicePending(G)) return INVALID_MOVE;
    const me = ctx.currentPlayer;
    const age = Math.max(1, highestTopAge(G.players[me]));
    // draw() handles deck exhaustion → endByDraw.
    drawInline(G, me, age);
    spendAction(G, events);
  },

  // Meld a card from hand (by hand index).
  meldAction({ G, ctx, events }: MoveApi, handIndex: number) {
    if (choicePending(G)) return INVALID_MOVE;
    const me = ctx.currentPlayer;
    const hand = G.players[me].hand;
    if (handIndex < 0 || handIndex >= hand.length) return INVALID_MOVE;
    const cardId = hand[handIndex];
    hand.splice(handIndex, 1);
    G.players[me].piles[cardById(cardId).color].cards.unshift(cardId);
    spendAction(G, events);
  },

  // Activate the dogma of one of your top cards (by color).
  dogmaAction({ G, ctx, events }: MoveApi, color: Color) {
    if (choicePending(G)) return INVALID_MOVE;
    const me = ctx.currentPlayer;
    const top = topCard(G.players[me], color);
    if (top === null) return INVALID_MOVE;
    const done = startDogma(G, top, me);
    if (done) {
      spendAction(G, events);
    } else {
      syncChoiceStage(G, events); // route the pause to the choice owner
    }
  },

  // Claim an age achievement (its own action).
  achieveAction({ G, ctx, events }: MoveApi, age: number) {
    if (choicePending(G)) return INVALID_MOVE;
    const me = ctx.currentPlayer;
    const p = G.players[me];
    if (!G.availableAgeAchievements.includes(age)) return INVALID_MOVE;
    if (score(p) < 5 * age) return INVALID_MOVE;
    if (highestTopAge(p) < age) return INVALID_MOVE;
    G.availableAgeAchievements = G.availableAgeAchievements.filter((a) => a !== age);
    p.ageAchievements.push(age);
    spendAction(G, events);
  },

};

/** Stage move: any player put into `awaitingChoice` (the current dogma choice
 *  owner) answers the pending choice here. Lives in a stage so non-current
 *  players (sharers, demand targets) can respond mid-turn. */
function resolveChoiceMove({ G, events }: MoveApi, response: ChoiceResponse) {
  if (!G.pendingChoice) return INVALID_MOVE;
  if (!isValidResponse(G, response)) return INVALID_MOVE;
  const done = resumeDogma(G, response);
  syncChoiceStage(G, events); // re-pause with new owner, or clear if done
  if (done) spendAction(G, events); // the dogma action now completes
}

/** Inline draw so the move can also flip endByDraw; mirrors mechanics.draw. */
function drawInline(g: InnovationState, playerId: string, age: number): void {
  let a = Math.max(1, age);
  while (a <= 10) {
    if (g.decks[a].length > 0) {
      g.players[playerId].hand.push(g.decks[a].shift()!);
      return;
    }
    a++;
  }
  g.endByDraw = true;
}

/** Validate a choice response against the live pending choice. */
function isValidResponse(G: InnovationState, response: ChoiceResponse): boolean {
  const pc = G.pendingChoice!;
  if (response === null) return pc.optional;
  switch (pc.kind) {
    case 'select-hand-card':
    case 'select-board-color':
      return typeof response === 'number' && pc.options.includes(response);
    case 'yes-no':
      return typeof response === 'boolean';
    case 'select-hand-card-subset': {
      if (!Array.isArray(response)) return false;
      const min = pc.minCount ?? 0;
      const max = pc.maxCount ?? pc.options.length;
      if (response.length < min || response.length > max) return false;
      const seen = new Set<number>();
      for (const id of response) {
        if (!pc.options.includes(id) || seen.has(id)) return false;
        seen.add(id);
      }
      return true;
    }
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// End conditions
// ---------------------------------------------------------------------------

export interface InnovationGameOver {
  winners: string[];
  reason: 'achievements' | 'draw-exhaustion';
}

function requiredAchievements(numPlayers: number): number {
  return 8 - numPlayers; // 2p:6, 3p:5, 4p:4
}

function endIf({ G, ctx }: { G: InnovationState; ctx: Ctx }): InnovationGameOver | undefined {
  const ids = Object.keys(G.players);
  const need = requiredAchievements(ctx.numPlayers);

  // Achievement victory: most achievements once anyone hits the threshold.
  const top = Math.max(...ids.map((id) => achievementCount(G.players[id])));
  if (top >= need) {
    const contenders = ids.filter((id) => achievementCount(G.players[id]) === top);
    return { winners: tiebreakByScore(G, contenders), reason: 'achievements' };
  }

  // Deck-exhaustion end: highest score wins.
  if (G.endByDraw) {
    return { winners: tiebreakByScore(G, ids), reason: 'draw-exhaustion' };
  }
  return undefined;
}

function tiebreakByScore(G: InnovationState, ids: string[]): string[] {
  const best = Math.max(...ids.map((id) => score(G.players[id])));
  return ids.filter((id) => score(G.players[id]) === best);
}

// ---------------------------------------------------------------------------
// Game
// ---------------------------------------------------------------------------

export const InnovationGame: Game<InnovationState> = {
  name: 'innovation',
  setup: setup as unknown as Game<InnovationState>['setup'],
  moves: moves as unknown as Game<InnovationState>['moves'],
  turn: {
    onBegin: ({ G, ctx }: { G: InnovationState; ctx: Ctx }) => {
      // First turn of the game = 1 action; every other turn = 2 (the common
      // case; refine the 3–4p opening nuance later).
      G.actionsRemaining = ctx.turn === 1 ? 1 : 2;
    },
    stages: {
      awaitingChoice: {
        moves: { resolveChoice: resolveChoiceMove },
      },
    },
  },
  endIf: endIf as unknown as Game<InnovationState>['endIf'],
};
