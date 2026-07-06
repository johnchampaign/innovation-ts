# Innovation (TypeScript port)

An in-progress TypeScript port of the card game **Innovation**, replacing the
prior C# desktop app. Built on [boardgame.io](https://boardgame.io) for the game
engine and the [digital-boardgame-framework](https://www.npmjs.com/package/digital-boardgame-framework)
for async online multiplayer — the same stack as Tyrants of the Underdark, so a
framework fix benefits every game.

Goal: **web + macOS + Linux + async multiplayer from one codebase.** Web-first,
so the desktop platforms come free (a browser is already cross-platform).

## Status

Phase 0 spike complete: engine plumbing, the four standard actions, the dogma
choice protocol, a starter set of Age-1 cards, and a framework adapter — all
exercised by a headless random rollout. Most cards, dogma sharing/demands, the
UI, and online play are still to come. See [PORT-PLAN.md](PORT-PLAN.md).

## Develop

```sh
npm install
npm run smoke      # headless random rollout: legal/apply agreement + card conservation
npm run typecheck  # tsc --noEmit
npm run dev        # Vite dev server (placeholder UI for now)
npm run build      # production build
```

The card catalog (`data/cards.tsv`) is copied verbatim from the reference C#
project and is the authoritative source for all rule text.


## Feedback & contributions

The most useful thing you can send is an **in-game problem report** — the report
button inside the game. Filed while you're playing, it captures the game state and
context that make an issue reproducible, which helps far more than a code change.

**Pull requests generally won't be merged.** This is a solo-maintained project, and
reviewing and integrating outside code costs more than it saves. If you open a PR,
it'll be read as a well-specified bug report or feature request and implemented here
rather than merged — so it's a fine way to *describe* a change you'd like, just
please don't expect it to land as-is.

**The whole codebase is MIT-licensed** — fork it and do whatever you want: change
the rules, reskin it, build and ship your own version. No permission needed; that's
the point of the license.
