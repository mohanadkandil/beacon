# yappr cron — Cloudflare Worker

Tiny worker that runs every minute and pings the yappr Wire tick endpoint.
Replaces the browser-side poll once yappr is deployed — schedules fire
24/7, even when no one has the app open.

## Why a Worker (vs. Vercel Cron)

Both work. Pick one. The Worker is here as the open-source-friendly path:
no Vercel-specific config, free CF tier handles 1000 invocations/day, you
can self-host or move clouds without changing code.

## Deploy (~2 minutes)

```bash
cd cloudflare
bun install                          # or pnpm install
wrangler login                       # one-time CF auth
wrangler secret put YAPPR_CRON_SECRET   # paste the same value used by the yappr app
wrangler deploy
```

For preview:

```bash
cd cloudflare
wrangler secret put YAPPR_CRON_SECRET --env preview
wrangler deploy --env preview
```

Make sure the yappr app has the same secret:

```bash
# Vercel example
vercel env add YAPPR_CRON_SECRET production

# Local demo example
echo 'YAPPR_CRON_SECRET=dev-shared-secret' >> .env.local
```

If you change domains, update `YAPPR_TICK_URL` in `wrangler.toml`:

```toml
[env.production.vars]
YAPPR_TICK_URL = "https://your-domain.com/api/wire/cron-tick"
```

## Quick Local Test

```bash
# no side effects; does not run patches
curl "http://localhost:3000/api/wire/cron-tick?health=1"

# fires due scheduled patches locally
curl -X POST "http://localhost:3000/api/wire/cron-tick" \
  -H "X-Yappr-Cron-Secret: dev-shared-secret"
```

## Cloudflare Test

```bash
wrangler secret put YAPPR_CRON_SECRET   # paste a shared secret
wrangler deploy
wrangler tail yappr-cron
```

After deploy:
- Cloudflare schedules `scheduled` to fire on your cron pattern.
- Each tick POSTs to `YAPPR_TICK_URL` with both `X-Yappr-Cron-Secret`
  and `Authorization: Bearer ...` headers.
- yappr's `/api/wire/cron-tick` runs `tick()` from `src/lib/wire/scheduler.ts`
  exactly the same way the browser poll does.

## Configuration

`wrangler.toml`:

- `[triggers] crons` — adjust the cron pattern (default `*/1 * * * *` = every minute).
- `[vars] YAPPR_TICK_URL` — your deployed yappr's cron-tick endpoint.

Per-env variants:
- `wrangler deploy` — production.
- `wrangler deploy --env preview` — preview env (separate worker name + URL).

## Verify

```bash
# Worker info
wrangler tail yappr-cron

# Direct sanity ping
curl https://yappr-cron.your-account.workers.dev/__health
```

You should see `{ ok: true, target: "https://yappr.ai/api/wire/cron-tick", hasSecret: true }`.

## yappr-side: lock down `/api/wire/cron-tick`

By default the endpoint is open (browser poll needs to hit it). To require
the worker's shared secret in production, set `YAPPR_CRON_SECRET` on the
yappr side too — the endpoint will reject calls missing or mismatching the
header. See `src/app/api/wire/cron-tick/route.ts`.

One important implementation note: patch schedules currently live in the
Next.js process memory. That is fine for the live demo and a single warm
Node process. For real production scheduling, move schedules/runs to durable
storage such as Postgres, Redis, Cloudflare D1, or Cloudflare KV so every
cron tick sees the same schedule state.

## Cost

Cloudflare Workers Free: 100k requests/day, 1 cron trigger/account, 10ms
CPU per invocation. yappr's cron tick fits comfortably — it just makes
one HTTP POST per minute (~43k/month), well under the cap.
