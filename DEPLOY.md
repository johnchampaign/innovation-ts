# Deploying Innovation

One-time setup, then a single command per release. ~10 minutes the first
time, ~30 seconds every subsequent time.

> The framework's `docs/decisions.md` has the broader rationale for this
> stack; this doc is the worked Innovation-specific recipe.

## Architecture

- **Client** (`src/`) — React UI, built by Vite to `dist/`.
- **API** (`functions/api/[[path]].ts`) — Cloudflare Pages Functions, runs the
  framework's `GameServer` on Workers (V8 isolates).
- **Store** — Supabase (Postgres). `FsStore` is not used because Workers
  can't `require('fs')`.
- **Notifier** — `NoopNotifier` for now (no per-turn emails). Swap for
  `ResendNotifier` later if you want email pings.

```
        ┌──────────────┐  HTTP   ┌──────────────────┐  pg-rest  ┌──────────┐
 player ─┤ React client ├─/api/*─┤ Pages Functions  ├──────────►│ Supabase │
        └──────────────┘         │ + GameServer     │            └──────────┘
                                  └──────────────────┘
```

## One-time setup

### 1. Create a Supabase project

1. Sign in at <https://supabase.com> (free tier is fine for this).
2. **New project** — name it anything; pick a region; choose a database
   password (you won't need it again).
3. Wait ~2 min for the project to come up.
4. In the project, **SQL editor → New query**. Paste the contents of
   `node_modules/digital-boardgame-framework/supabase/schema.sql` (the
   framework ships it; same file as
   <https://github.com/johnchampaign/digital-boardgame-framework/blob/main/supabase/schema.sql>).
   Run it. You should see four `CREATE TABLE` statements succeed.
5. **Project settings → API** — copy two values for later:
   - **Project URL** (e.g. `https://abcd.supabase.co`) → `SUPABASE_URL`
   - **`service_role` key** (NOT the anon key) → `SUPABASE_SERVICE_ROLE_KEY`

   Why service_role: the GameServer needs write access from the
   server-side; tokens stay server-side only.

### 2. Create the Cloudflare Pages project

The first deploy creates it. Make sure you're logged in:

```bash
npx wrangler login
```

Then from the repo root:

```bash
npm run build
npx wrangler pages deploy dist --project-name=innovation-ts
```

The first run will prompt to create the project. Accept the defaults.

### 3. Set Cloudflare env vars

Visit <https://dash.cloudflare.com> → Workers & Pages → **innovation-ts** →
Settings → **Environment variables** → **Production**:

| Name                  | Value                                          |
| --------------------- | ---------------------------------------------- |
| `SUPABASE_URL`        | from step 1.5                                  |
| `SUPABASE_SERVICE_ROLE_KEY`| from step 1.5                                  |
| `PUBLIC_ORIGIN`       | (optional) `https://innovation-ts.pages.dev`   |

Encrypted? Yes for `SUPABASE_SERVICE_ROLE_KEY`. The other two are non-secret.

### 4. Check the Production branch

The framework's `decisions.md` warns about this and it bit Tyrants —
Cloudflare's "Production branch" setting is independent of git branches.
If the Production branch isn't set to your real branch (`main`), every
`wrangler pages deploy --branch main` lands as an invisible **preview**.

Verify (or fix) via the API:

```bash
curl -sX PATCH \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"production_branch":"main"}' \
  "https://api.cloudflare.com/client/v4/accounts/$CF_ACCT_ID/pages/projects/innovation-ts" \
  | jq '.result.production_branch'
```

Or in the dashboard: **Settings → Builds → Production branch → main**.

## Every subsequent deploy

```bash
npm run build
npx wrangler pages deploy dist --project-name=innovation-ts --branch=main
```

The build pipeline:
1. `tsc --noEmit` — type-checks (won't deploy if broken).
2. Vite builds the React client to `dist/`.
3. Wrangler uploads `dist/` + auto-discovered `functions/` to Cloudflare.

> **commit/push = save the code; `wrangler pages deploy` = publish it to
> players.** Two separate steps. (Lesson from `decisions.md`.)

## Running the whole stack locally

To exercise the same Pages Functions code path on `localhost`:

```bash
# In one terminal — Vite dev server for the client
npm run dev

# In another — wrangler pages dev wrapping the Functions backend
npx wrangler pages dev dist --port 8788 \
  --binding SUPABASE_URL=https://your-project.supabase.co \
  --binding SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

Or, simpler for a quick check, just point Vite's `/api` proxy at a deployed
preview URL — see `vite.config.ts`.

For pure-client smoke testing without the API, the Lobby's **Start hotseat**
button drops straight into the local hotseat path (no API calls).

## Smoke checks after a deploy

1. Visit your `*.pages.dev` URL. The Lobby renders.
2. Click **Create online game** (2 players). It should show two invite URLs.
3. Open both URLs in different tabs / private windows. Both load the board
   with `Player 0 (you)` and `Player 1 (you)` respectively.
4. Player 0's tab: meld a card. Within 2 seconds, Player 1's tab updates.
5. Cycle through a turn or two. Card conservation should hold.
6. **Refresh** Player 0's tab. State persists (it's in Supabase).

If step 2 fails with a 500: env vars are missing or the schema didn't apply.
Check the Functions logs in the Cloudflare dashboard.

## Troubleshooting

| Symptom                                          | Likely cause                                        |
| ------------------------------------------------ | --------------------------------------------------- |
| Blank black page on prod                         | `base: '/repo-name/'` baked into Vite build. See `vite.config.ts`. |
| Deploys "succeed" but live site doesn't change   | Cloudflare Production branch mismatch (step 4 above). |
| `Error: 500` from /api/games                     | Supabase env vars wrong or schema not applied.       |
| `Error: not found` on first /api call            | wrangler.toml `pages_build_output_dir` mismatch.     |
| State doesn't update across tabs                 | `pollMs` too high or the Supabase update never wrote (check Functions logs). |
