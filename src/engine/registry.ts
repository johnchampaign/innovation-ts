// Dogma handler registry — keyed by card TITLE (the C# CardRegistrations
// pattern). Cards are registered incrementally; an unregistered card's dogma is
// a no-op (the C# PlaceholderHandler), so the game always runs even with most
// of the 105 cards unported.

import type { InnovationState, EffectContext } from './types';

/** A dogma handler. Re-entrant: called once on cold entry and again after each
 *  choice the player answers. It reads `ctx.response` (the answer to the choice
 *  that triggered this resume) and `ctx.handlerState` (its own scratch state),
 *  and pauses by setting `ctx.pendingChoice` and returning.
 *
 *  Return value is the "progressed" signal (the C# `IDogmaHandler.Execute`
 *  bool). `true` / `undefined` (void) → the effect did something; `false` → it
 *  was a no-op for this target (player declined, hand empty, etc.). The dogma
 *  driver uses this to decide the shared-bonus draw: if a non-active player
 *  progressed a non-demand effect, the activator draws one bonus card at the
 *  end of resolution. */
export type DogmaHandler = (
  g: InnovationState,
  targetId: string,
  ctx: EffectContext,
) => boolean | void;

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

/** Test-only: replace a card's dogma handler, returning a restore function.
 *  Use in tests that need to drive the dogma engine with a recording or
 *  forced-behaviour handler against a real card from the catalog. */
export function overrideDogmaForTest(
  title: string,
  handler: DogmaHandler,
): () => void {
  const prev = registry.get(title);
  registry.set(title, handler);
  return () => {
    if (prev) registry.set(title, prev);
    else registry.delete(title);
  };
}
