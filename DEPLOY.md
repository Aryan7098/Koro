# Free-tier cloud deploy

Everything below stays inside always-on free tiers as of 2026-Q3:

| Piece | Where | Free-tier |
|---|---|---|
| Frontend | **Vercel** hobby | unlimited |
| Backend | **Fly.io** shared-CPU 512MB | 3 machines / 3 GB storage |
| Postgres | **Neon** | 3 GB, always-on, pgvector included |
| Redis | **Upstash** | 10k commands/day, 256 MB |
| Embeddings | **Cohere** trial | 1k calls/month (multilingual v3, 1024-d) |
| Anthropic Claude | your key | pay-as-you-go (cents per demo run) |

Total: **$0/mo** unless Claude usage grows.

## 0. Sign-ups (10 min)

Create accounts (all support Google sign-in — no credit card needed for these tiers):

1. **Neon** — https://console.neon.tech → create a project named `echostand`. Enable the `vector` extension: in the SQL editor run `CREATE EXTENSION IF NOT EXISTS vector;`. Copy the connection string from the dashboard (both pooled and direct forms).
2. **Upstash** — https://console.upstash.com → create a Redis database, any region. Copy the `UPSTASH_REDIS_URL` (use the TLS `rediss://` variant).
3. **Cohere** — https://dashboard.cohere.com/api-keys → create a Trial key.
4. **Fly.io** — https://fly.io → sign up, then install the CLI:
   ```powershell
   iwr https://fly.io/install.ps1 -useb | iex
   fly auth login
   ```
5. **Vercel** — https://vercel.com → sign in with your GitHub account and authorize access to your `Koro` repo.

## 1. Backend on Fly.io (5 min)

From the repo root (`echostand/`):

```powershell
# Import the fly config that's already checked in.
fly launch --copy-config --dockerfile apps/api/Dockerfile --no-deploy
# When prompted:
#   - App name: echostand-api  (must be globally unique — pick your own suffix)
#   - Region:   pick nearest, e.g. iad
#   - Postgres: NO
#   - Redis:    NO
#   - Deploy now: NO

# Wire secrets. Escape `$` in PowerShell with backtick if pasting a literal.
fly secrets set `
  ANTHROPIC_API_KEY="sk-ant-…" `
  COHERE_API_KEY="…" `
  DATABASE_URL="postgresql+asyncpg://…neon.tech/echostand?sslmode=require" `
  DATABASE_URL_SYNC="postgresql://…neon.tech/echostand?sslmode=require" `
  REDIS_URL="rediss://…upstash.io:6379" `
  JWT_SECRET=(python -c "import secrets; print(secrets.token_hex(32))") `
  CORS_ORIGINS="https://echostand.vercel.app" `
  COOKIE_SAMESITE="none" `
  COOKIE_SECURE="true"

# Deploy.
fly deploy
```

The build takes 3–5 minutes the first time. When it finishes, `fly status` will
show the URL — something like `https://echostand-api.fly.dev`. Test it:

```powershell
curl https://echostand-api.fly.dev/health
# {"status":"ok"}
```

The entrypoint runs `alembic upgrade head` + the seed script on every boot,
so the DB is populated automatically.

## 2. Frontend on Vercel (3 min)

From the Vercel dashboard:

1. **Add New Project** → import `Aryan7098/Koro`.
2. **Root Directory**: click *Edit* and set to `echostand/apps/web`.
3. **Framework Preset**: Next.js (auto-detected).
4. **Environment Variables** — add:
   - `NEXT_PUBLIC_API_BASE_URL` = `https://echostand-api.fly.dev` (whatever `fly status` gave you)
5. **Deploy**.

Vercel gives you a URL like `https://echostand.vercel.app`. If yours differs,
re-run `fly secrets set CORS_ORIGINS=<your-vercel-url>` and `fly deploy` so the
backend accepts requests from it.

## 3. Verify the loop

- Open the Vercel URL. Landing page loads.
- `/fan` → log in as **María** or **Jamil**.
- `/staff` → log in as **Ops Control** (in a second tab).
- `/control` → log in as **Match Organizer**, run `demo_full_narrative`.

You should see:
- `RUMOR → PROBABLE → CONFIRMED` progression as reports accumulate.
- Multi-lingual fan nudges (Spanish, Arabic, etc.) with **the same event** in each fan's language.
- Wheelchair fan gets a **step-free** planned route around the affected restroom.
- A single medical report lands **red-bordered** in the staff Authorize queue immediately.
- Loop closure notifications arrive on the fan surface in the fan's language when staff resolves.

## 4. Iterate

Any `git push` to `main` deploys both surfaces automatically:

- Vercel rebuilds the frontend on every commit that touches `apps/web/**`.
- Fly.io redeploys on `fly deploy` from your machine (or wire up a GitHub Action if you want automatic backend deploys — see below).

Optional — auto-deploy the backend from CI. Add `.github/workflows/fly.yml`:

```yaml
name: fly-deploy
on:
  push:
    branches: [main]
    paths: ["apps/api/**", "data/**", "packages/**"]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl deploy --remote-only -c apps/api/fly.toml
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

Set `FLY_API_TOKEN` in the repo's GitHub Actions secrets (`fly tokens create deploy` gives you one).

## Troubleshooting

- **CORS error in the browser console** — the backend `CORS_ORIGINS` doesn't include your Vercel URL. Update the fly secret and redeploy.
- **`GET /realtime/fan` hangs then errors** — Fly free tier is fine for SSE, but if you set `auto_stop_machines = "stop"`, the connection dies. Ensure `fly.toml` keeps `auto_stop_machines = "off"` (already set).
- **`no ANTHROPIC_API_KEY — returning None`** in Fly logs — you didn't set the secret. `fly secrets list` to check.
- **DB connection errors from Fly to Neon** — Neon requires `sslmode=require`. Make sure the URL includes it, and the async URL uses `postgresql+asyncpg://` (not just `postgresql://`).
- **`extension "vector" is not available`** in migration output — run `CREATE EXTENSION IF NOT EXISTS vector;` in the Neon SQL editor first.
- **Cohere free-tier rate limit** — 1k calls/month. If you exceed it during dev, switch briefly to `EMBEDDING_BACKEND=local` and re-install with `pip install -e ".[local-embed]"`.

## Cost sanity check

Everything above is free unless:
- Anthropic Claude calls exceed your own budget (typical hackathon demo run: ~$0.10 of Claude).
- Fly.io scale-out beyond 3 machines.
- Cohere embeds exceed 1k/month → their standard plan starts at $0 (usage-based) with `$0.10 / 1M tokens`.
