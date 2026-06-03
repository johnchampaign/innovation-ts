# Innovation (TS port) — Claude notes

## Backup discipline (load-bearing)

Never leave a session with local-only state. Commit and push to the private
remote (`origin` = `github.com/johnchampaign/innovation-ts`, private) before
doing new work. If `git status -sb` doesn't show `## main...origin/main` with
no `ahead`, push before continuing.

(See the Digital Boardgame Framework and Tyrants repos for the same rule —
this project follows the identical discipline.)

## What this is

A from-scratch **TypeScript port of Innovation**, replacing the C# desktop app
(`../Innovation`, left untouched as the reference). Goal: web + macOS + Linux +
async multiplayer from **one** codebase, on the same stack as Tyrants and
Rebellion.

Architecture (the proven Tyrants "Option A"):
- **boardgame.io** owns turn structure, moves, RNG (deterministic `random`
  plugin), and immutable state updates.
- The **digital-boardgame-framework** (npm) wraps the bgio reducer via
  `src/adapter/innovationAdapter.ts` to add async multiplayer, per-player
  redaction (`viewFor`), snapshots, and agent bug-triage.
- The Innovation **rules** are ported into `src/engine/` (mechanics + dogma
  handlers keyed by card title), driven from the authoritative `data/cards.tsv`
  (copied verbatim from the C# repo — never author rule text from memory).

## Project shape

- `data/cards.tsv` — authoritative card catalog (copied from C#).
- `src/card-data.ts` — TSV parser → `CARDS` catalog.
- `src/engine/types.ts` — domain types + `InnovationState` (the bgio `G`).
- `src/engine/mechanics.ts` — primitive ops (draw/meld/tuck/score/return/splay).
- `src/engine/registry.ts` + `handlers/` — dogma handlers by card title.
- `src/game.ts` — the boardgame.io `Game` (setup, moves, turn machine, endIf).
- `src/adapter/innovationAdapter.ts` — framework `GameAdapter` wrapping bgio.
- `scripts/smoke-rollout.ts` — `npm run smoke`: random rollout through the
  adapter; asserts legalActions⇄applyAction agreement + card conservation.

## Don't

- Don't edit the C# repo (`../Innovation`) — it's reference only.
- Don't author dogma behaviour from memory — open `data/cards.tsv` first.
- Don't hand-roll turn advance / RNG — boardgame.io owns both.

## Deploy (when there's a UI)

Cloudflare Pages, root base path, manual `wrangler pages deploy` — follow the
deploy-config lessons in the framework's `docs/decisions.md` (don't gate
non-secret config behind build-time env vars; mind the Pages Production
branch). `npm run smoke` should stay green as cards are ported.
