# Game-log event registry (log-format v2)

Innovation's structured game log lives in `G.log` as
`GameLogEntry<string>[]` from `digital-boardgame-framework` (>= 0.42.0).
Every entry is appended through the single choke point
`src/engine/log.ts:logEvent()`, which stamps `seq` (monotonic, framework)
and `turn` (`G.turnNumber`, mirrored from bgio `ctx.turn` at turn begin)
and caps the in-state log at **500** entries.

Envelope (see the framework's `core/game-log.d.ts`):

```ts
{ seq, turn, side?, kind, msg?, payload?, secret? }
```

`side` is a seat id (`'0'`..`'3'`). `secret: true` entries are visible only
to their `side` — the adapter's `viewFor` runs `redactGameLog(G.log, viewer)`.

Events are emitted at the **dispatch level** (`src/game.ts` moves) and the
**dogma driver level** (`src/engine/dogma.ts`) — never inside individual
card handlers.

## Kinds

| kind | secret | payload | msg example |
|---|---|---|---|
| `turn.begin` | no | `{ player, actions }` | `— Turn 3: Player 1 (2 actions) —` |
| `action.draw` | no | `{ player, age }` — `age` is the age actually drawn from (deck skipping applied) | `P0 draws an Age 2 card.` |
| `action.draw.card` | **yes** (side = drawer) | `{ player, card }` — the drawn card's id. Companion to `action.draw`; opponents see only the age, as in the physical game. | `P0 drew Currency (Age 1, green).` |
| `game.deckExhausted` | no | `{ player, requestedAge }` — a draw above age 10; ends the game on score tiebreak | `P0 must draw above Age 10 — the game ends.` |
| `action.meld` | no | `{ player, card, age, color }` | `P0 melds The Wheel (Age 1, green).` |
| `action.dogma` | no | `{ player, card, color, icon }` | `P0 activates Writing (blue, Lightbulb).` |
| `action.achieve` | no | `{ player, age }` | `P0 claims the Age 3 achievement.` |
| `action.choice` | **yes** (side = chooser) | `{ player, choiceKind, response }` — a choice response can name hidden hand cards, so the whole entry is secret. Public consequences show on the board and via `dogma.*` events. | `P1 resolves "Choose a card to return" (select-hand-card).` |
| `dogma.share` | no | `{ card, level, target }` — `target` progressed a non-demand effect of the activator's dogma (one entry per sharing target per level) | `P1 shares Sailing's effect.` |
| `dogma.demand` | no | `{ card, level, target }` — `target` was affected by a demand effect | `P1 is affected by Oars's demand.` |
| `dogma.shareDraw` | no | `{ player, card }` — the activator's free draw after any opponent shared | `P0 draws a bonus card for the shared dogma.` |

## Adding a new kind

1. Emit it via `logEvent()` at the dispatch or driver level (not in a card
   handler).
2. Decide secrecy: does the payload or msg reveal a hidden card identity to
   opponents? If yes, `secret: true` + `side`.
3. Document it in the table above.
