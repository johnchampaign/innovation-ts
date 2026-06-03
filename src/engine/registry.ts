// Dogma handler registry — keyed by card TITLE (the C# CardRegistrations
// pattern). Cards are registered incrementally; an unregistered card's dogma is
// a no-op (the C# PlaceholderHandler), so the game always runs even with most
// of the 105 cards unported.

import type { InnovationState, EffectContext } from './types';

/** A dogma handler. Re-entrant: it may be called once on cold entry and again
 *  after each choice the player answers. It reads `ctx.response` (the answer to
 *  the choice that triggered this resume) and `ctx.handlerState` (its own
 *  scratch state), and pauses by setting `ctx.pendingChoice` and returning.
 *
 *  Scope note (spike): handlers currently resolve for the ACTIVE player only.
 *  Dogma sharing + demands (running the handler for other players based on
 *  featured-icon counts) are the next milestone — see PORT-PLAN.md. */
export type DogmaHandler = (
  g: InnovationState,
  targetId: string,
  ctx: EffectContext,
) => void;

const registry = new Map<string, DogmaHandler>();

export function registerDogma(title: string, handler: DogmaHandler): void {
  if (registry.has(title)) throw new Error(`Dogma already registered for "${title}"`);
  registry.set(title, handler);
}

export function getDogma(title: string): DogmaHandler | undefined {
  return registry.get(title);
}

export function isRegistered(title: string): boolean {
  return registry.has(title);
}

export function registeredTitles(): string[] {
  return [...registry.keys()];
}
