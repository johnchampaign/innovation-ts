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
  /** Legal answers the caller may pick from (card IDs, ages, etc.). */
  options: number[];
  /** Whether the player may decline (answer `null`). */
  optional: boolean;
  /** For subset picks: inclusive bounds on how many options to choose. */
  minCount?: number;
  maxCount?: number;
}

export type ChoiceKind =
  | 'select-hand-card'
  | 'select-hand-card-subset'
  | 'select-board-color'
  | 'yes-no';

/** A response to a PendingChoice: a single option, a subset, a yes/no, or
 *  `null` (declined). */
export type ChoiceResponse = number | number[] | boolean | null;

/** What an in-flight dogma needs to resume after a pause (the C# combination of
 *  `DogmaContext.PendingChoice` + `HandlerState`). Persisted in `G` across the
 *  move boundary so the `resolveChoice` move can re-enter the handler. */
export interface PausedEffect {
  cardId: number;
  /** Player the dogma is currently resolving for (active player for now;
   *  becomes the share/demand target once those are implemented). */
  targetId: string;
  /** Handler scratch state — re-entrant step machine bookkeeping. */
  handlerState: Record<string, unknown>;
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
  pausedEffect: PausedEffect | null;
  /** Set when a player must draw above age 10 (deck exhaustion) — ends the
   *  game on the highest-score tiebreak. */
  endByDraw: boolean;
  log: string[];
}

/** Context handed to a dogma handler. Mirrors the C# `DogmaContext`: a handler
 *  may consume a prior choice response, request a new choice (which pauses the
 *  dogma), and stash scratch state. */
export interface EffectContext {
  /** The response to the choice that caused the current resume, or undefined
   *  on the cold (first) entry. */
  response: ChoiceResponse | undefined;
  /** Re-entrant scratch state (persisted across pauses). */
  handlerState: Record<string, unknown>;
  /** Set by a handler to pause and ask the player something. */
  pendingChoice: PendingChoice | null;
}
