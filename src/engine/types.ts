// Core domain types for the Innovation TS port.
//
// Ported from Innovation.Core (C#): GameState, PlayerState, ColorStack, Card,
// ChoiceRequest/DogmaContext. The shapes are kept deliberately close to the C#
// originals so the handler translations read 1:1 against the reference.
//
// One deliberate divergence: everything here is a plain JSON-serializable
// object (no classes/methods). boardgame.io persists `G` as JSON every turn and
// the framework snapshots it, so state must round-trip through JSON. Behaviour
// that lived on C# methods (ColorStack.Meld, PlayerState.Score, …) moves to
// free functions in mechanics.ts that operate on these structs.

export type Color = 'yellow' | 'red' | 'purple' | 'blue' | 'green';
export const COLORS: readonly Color[] = ['yellow', 'red', 'purple', 'blue', 'green'];

/** The six real icons plus `none` (the hexagon/blank slot, the C# `Icon.None`). */
export type IconName =
  | 'none' | 'leaf' | 'castle' | 'lightbulb' | 'crown' | 'factory' | 'clock';

export type Splay = 'none' | 'left' | 'right' | 'up';

/** Immutable card definition (the C# `Card` record). Loaded once from the TSV
 *  catalog; never stored in `G` (only card IDs are). */
export interface CardDef {
  id: number;
  age: number;
  color: Color;
  title: string;
  /** Corner icons in slot order [Top, Left, Middle, Right]; one is `none`
   *  (the hexagon). Splay rules decide which are visible on covered cards. */
  icons: [IconName, IconName, IconName, IconName];
  /** Featured icon of the dogma (drives sharing/demand once implemented). */
  dogmaIcon: IconName;
  /** One entry per dogma effect, top to bottom. */
  effects: DogmaEffectDef[];
}

export interface DogmaEffectDef {
  text: string;
  /** "I demand …" effects target opponents with FEWER featured icons. */
  isDemand: boolean;
}

/** One color pile on a player's board. cards[0] is the TOP card (C# convention). */
export interface Pile {
  cards: number[]; // card IDs, top (index 0) → bottom
  splay: Splay;
}

export interface PlayerData {
  hand: number[];
  scorePile: number[];
  /** Five piles keyed by color. */
  piles: Record<Color, Pile>;
  ageAchievements: number[];      // ages 1–9 claimed
  specialAchievements: string[];  // "Monument", …
  scoredThisTurn: number;
  tuckedThisTurn: number;
}

/** A question a dogma handler needs answered before it can continue
 *  (the C# `ChoiceRequest`). Lives on `G.pendingChoice`; the player answers
 *  via the `resolveChoice` move. `playerId` owns it (drives currentActor +
 *  per-player redaction). */
export interface PendingChoice {
  kind: ChoiceKind;
  prompt: string;
  playerId: string;
  /** Legal answers the caller may pick from (card IDs, ages, etc.).
   *  For `select-player`, this carries player ids re-cast as numbers via
   *  `parseInt` — see `playerOptions` below for the canonical accessor. */
  options: number[];
  /** Whether the player may decline (answer `null`). */
  optional: boolean;
  /** For subset picks: inclusive bounds on how many options to choose. */
  minCount?: number;
  maxCount?: number;
  /** For `select-player`: the legal answer ids as the original string keys
   *  ('0', '1', ...). Mirrors `options` but preserves the string form so
   *  handlers and UI don't need to round-trip through Number. */
  playerOptions?: string[];
}

export type ChoiceKind =
  | 'select-hand-card'
  | 'select-hand-card-subset'
  | 'select-score-card'
  | 'select-score-card-subset'
  | 'select-board-color'
  | 'select-value'
  | 'select-card-order'
  | 'select-player'
  | 'yes-no';

/** A response to a PendingChoice: a single option, a subset / permutation, a
 *  yes/no, or `null` (declined). For `select-card-order`, the array is the
 *  chosen permutation of the options (top-first). */
export type ChoiceResponse = number | number[] | boolean | null;

/** Cross-player choice ownership: `PendingChoice.playerId` is the player who
 *  ANSWERS the prompt (drives currentActor + redaction). For most cards
 *  this equals the handler `targetId` — the share/demand target is the one
 *  picking. A few cards invert this — e.g. Collaboration draws two cards
 *  for the target, then the ACTIVATOR picks one of them. In those handlers,
 *  set `playerId` to `g.dogmaRun.activatingPlayerId` rather than `targetId`. */

/** One "execute card X's non-demand effects for player Y only" frame queued
 *  by a handler (Robotics, Self Service, Computers eff2, Software eff2,
 *  Satellites eff3). The driver drains these between handler calls before
 *  advancing to the next target. Each frame carries its own handler scratch
 *  state so nested handlers don't clobber their caller's. */
export interface NestedFrame {
  cardId: number;
  targetPlayerId: string;
  /** 0-based effect index currently being serviced. */
  effectIndex: number;
  /** Per-effect handler scratch (reset between effects, like top-level). */
  handlerState: Record<string, unknown>;
}

/** Live state of an in-flight dogma resolution — the C# `DogmaContext`, made
 *  JSON-serializable so it can sit in `G` across move boundaries.
 *
 *  Set when a dogma starts; persists across pauses until every effect has run
 *  against every target; nulled once the shared-bonus draw fires and the
 *  resolution completes. */
export interface DogmaRun {
  cardId: number;
  activatingPlayerId: string;
  featuredIcon: IconName;
  /** Featured-icon count per player at activation time — frozen, NOT recomputed
   *  mid-dogma even if a handler mutates someone's board (rulebook). */
  frozenIconCounts: Record<string, number>;
  /** Effect index (0-based) currently being resolved. */
  currentLevel: number;
  /** Ordered player ids the current level affects (sharers clockwise then
   *  activator for non-demand; opponents with fewer featured icons for demand).
   *  Computed once at the level boundary; empty between levels. */
  currentTargets: string[];
  currentTargetIndex: number;
  /** True once a non-active player progressed a non-demand effect; triggers
   *  the activator's bonus draw after all levels resolve. */
  sharedBonus: boolean;
  /** Re-entrant scratch state for the currently-executing handler — reset to
   *  {} when advancing to the next target. */
  handlerState: Record<string, unknown>;
  /** Set by a demand-effect handler when its transfer/steal actually happened
   *  (the C# `DogmaContext.DemandSuccessful`, VB6 `demand_met`). Read by
   *  later effects of the same dogma that change behaviour based on whether
   *  the demand fired — currently just Oars's second effect. Persists for
   *  the lifetime of the dogma, never reset between levels. */
  demandSuccessful: boolean;
  /** Stack of pushed "execute card X for player Y, non-demand only" frames
   *  (Robotics, Self Service, Computers eff2, Software eff2, Satellites
   *  eff3). The driver drains these after each handler call. Frames may
   *  themselves push further frames. */
  nestedFrames: NestedFrame[];
  /** Fission sentinel — set when effect 1 wiped everyone's boards/hands/scores
   *  so effect 2 can short-circuit. (Lives here rather than in handlerState
   *  because it crosses the level boundary.) */
  fissionWiped: boolean;
  /** True when the most recent pause came from inside a nested frame, so the
   *  next resume routes the response to the top nested frame's handler rather
   *  than the main effect's handler. False (or absent) otherwise. */
  pausedInNested: boolean;
}

/** Root game state = boardgame.io's `G`. */
export interface InnovationState {
  /** Age decks 0..10; index 0 unused so ages are 1-indexed (C# convention). */
  decks: number[][];
  /** Players keyed by seat string '0'..'3' (boardgame.io playerID). */
  players: Record<string, PlayerData>;
  availableAgeAchievements: number[];
  availableSpecialAchievements: string[];
  /** Actions left in the current turn (set on turn begin). */
  actionsRemaining: number;
  pendingChoice: PendingChoice | null;
  /** Live dogma resolution; non-null only while a dogma is in flight (paused
   *  awaiting a choice or, transiently, mid-driver). */
  dogmaRun: DogmaRun | null;
  /** Set when a player must draw above age 10 (deck exhaustion) — ends the
   *  game on the highest-score tiebreak. */
  endByDraw: boolean;
  /** Solo-win override: when set, `endIf` returns it directly, ignoring
   *  achievement and deck-exhaustion paths. Used by Empiricism, Collaboration,
   *  AI, Bioengineering, Globalization, Self Service (the "I just win" cards).
   *  Set via `winSolo(g, playerId, reason)`. */
  winnerOverride: { winners: string[]; reason: string } | null;
  /** Cards removed from the game permanently — Fission's apocalypse path.
   *  Lives here (rather than vanishing) so card conservation invariants
   *  still hold. The 9 reserved achievement tiles ride here at setup too. */
  removedFromGame: number[];
  log: string[];
}

/** Context handed to a dogma handler. Mirrors the C# `DogmaContext`: a handler
 *  may consume a prior choice response, request a new choice (which pauses the
 *  dogma), and stash scratch state.
 *
 *  Cards with multiple effects (Pottery, Code of Laws, …) reuse one
 *  title-keyed handler for every effect; `levelIndex` lets the handler branch
 *  on which effect row it is currently servicing. */
export interface EffectContext {
  /** 0-based index of the current effect row on the card. */
  levelIndex: number;
  /** The response to the choice that caused the current resume, or undefined
   *  on the cold (first) entry. */
  response: ChoiceResponse | undefined;
  /** Re-entrant scratch state (persisted across pauses, reset between
   *  levels and between targets). */
  handlerState: Record<string, unknown>;
  /** Set by a handler to pause and ask the player something. */
  pendingChoice: PendingChoice | null;
}
