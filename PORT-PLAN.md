# Innovation TS port — plan & status

Porting the C# `Innovation.Core` engine to TypeScript on boardgame.io +
digital-boardgame-framework. Web-first (so macOS/Linux/Windows come free) with
async human multiplayer, one shared stack with Tyrants and Rebellion.

## Done — Phase 0: vertical-slice spike ✅

Proves the whole seam end-to-end before investing in 105 cards.

- Repo scaffold (Vite + React + TS), framework + boardgame.io as deps.
- `data/cards.tsv` copied verbatim from the C# repo; parsed into a catalog.
- Domain types + `InnovationState` (the bgio `G`), JSON-serializable.
- Mechanics: draw (with deck-walk-up), meld, tuck, score, return, splay,
  scoring, achievement counting.
- boardgame.io game: deal/setup (deterministic `random.Shuffle`), the four
  standard actions (Draw / Meld / Dogma / Achieve), 2-actions-per-turn machine,
  end conditions (achievement threshold `8 − numPlayers`, deck exhaustion).
- **Dogma pause/resume protocol**: pending choice stored in `G` + a
  `resolveChoice` move that re-enters the handler (the C# DogmaContext +
  HandlerState pattern, made serializable across the move boundary).
- Starter Age-1 handlers covering all three engine paths: no-pause (Writing,
  The Wheel, Sailing, Domestication), single optional pick (Agriculture),
  subset pick (Pottery).
- Framework `GameAdapter` wrapping the bgio reducer (Option A, mirrors Tyrants).
- `npm run smoke`: 25/25 random games reach game-over through the adapter;
  legalActions⇄applyAction agree; card conservation holds every step. ✅

## Known spike simplifications (to revisit)

- **Dogma sharing & demands are NOT implemented.** Handlers resolve for the
  active player only. This is the single biggest remaining piece and the
  genuinely subtle part of Innovation (featured-icon counting with splay
  visibility decides who shares/is-demanded, plus the "draw a card if anyone
  shared" bonus). Needs: `IconCounter` (port `Innovation.Core/IconCounter` +
  splay reveal rules), and a dogma driver that runs handlers for the right
  set of players in the right order, with cross-player `pendingChoice`
  ownership (the adapter's `currentActor`/redaction already support a choice
  owned by a non-current player).
- **Opening simultaneous meld** that decides the start player is skipped;
  player '0' starts.
- First-turn action count is "turn 1 → 1 action" globally; refine the 3–4p
  opening nuance.
- Most cards fall back to the no-op placeholder.

## Next phases

1. **Dogma sharing + demands + IconCounter** — make the engine *actually*
   Innovation. Re-port the relevant C# tests (Age*HandlerTests, DogmaEngineTests)
   to vitest as the safety net; keep `npm run smoke` green.
2. **Fill the card set, age by age** — port handlers + their C# tests per age;
   placeholder keeps the game runnable throughout. Special achievements
   (Monument/Empire/…) and their triggers.
3. **UI** — the React Board (hand, five color piles with splay, score/achievements,
   the choice prompts). Hotseat first.
4. **Online + deploy** — wire the framework `useGame` hook + lobby; deploy to
   Cloudflare Pages exactly like Tyrants (root base path, manual `wrangler`,
   mind the Pages Production branch; see framework `docs/decisions.md`).
5. **(Optional) AI** — port `GreedyController` / `HeuristicEvaluator` for solo
   play; the framework's `RandomAI` already fills empty seats.

## Guardrails

- `data/cards.tsv` is the source of truth for rule text — never author from
  memory (a C# port bug came from exactly that).
- Every ported card gets its C# test(s) ported alongside it.
- `npm run smoke` (and, later, vitest) gate every change.
