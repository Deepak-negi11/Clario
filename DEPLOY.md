# Deploying Clario

Clario is two apps, and they need two kinds of host:

| Part | Host | Why |
|---|---|---|
| `apps/web` (Next.js) | Vercel | Built for Next.js. Deploys on every push to `main`. |
| `apps/server` (Bun API + WebSocket) | Railway | Needs an always-on process for WebSockets, which serverless functions can't hold open. |
| PostgreSQL and Redis | Railway, next to the API | Private network between them. Redis takes a write on every step a player moves, which quickly runs out free plans that count commands. |

Domains: `vioraa.tech` points to Vercel and `api.vioraa.tech` points to Railway.

## 1. API, database and Redis on Railway

1. Railway: **New Project → Deploy from GitHub repo**, and pick this repository. Railway finds the
   `Dockerfile` at the repository root and builds the API with it. Leave Root Directory empty,
   because the API imports `packages/db` and `packages/shared`.
2. In the same project add **PostgreSQL** and **Redis** (**+ New → Database**).
3. In the API service's **Variables**:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
   | `REDIS_URL` | `${{Redis.REDIS_URL}}` |
   | `JWT_SECRET` | A long random string, for example the output of `openssl rand -hex 32`. The server refuses to start in production without it. |
   | `CORS_ORIGIN` | `https://vioraa.tech,https://www.vioraa.tech` |
   | `RESEND_API_KEY` | Your key from resend.com |
   | `EMAIL_FROM` | `Clario <hello@vioraa.tech>` |

   Railway sets `PORT` itself. Use the `${{...}}` references exactly as written: Railway fills in the
   private addresses of the database and Redis.
4. **Settings → Deploy → Healthcheck Path**: `/health`.
5. **Settings → Networking**: add the custom domain `api.vioraa.tech`, then add the CNAME record
   Railway shows at your domain's DNS provider.
6. Deploy. On every start the container applies pending database migrations
   (`prisma migrate deploy`), then starts the server. Check `https://api.vioraa.tech/health`
   returns `{"status":"ok"}`.

### Email in production: Resend, not Gmail SMTP

Railway turns SMTP off on its Free, Trial and Hobby plans ("SMTP is only available on the Pro plan
and above"), so Gmail SMTP will fail there. The server already supports Resend over HTTPS:

1. resend.com → **Domains → Add Domain** → `vioraa.tech`.
2. Add the DNS records Resend shows, and wait until the domain says **Verified**.
3. Create an API key and set `RESEND_API_KEY` and `EMAIL_FROM` on Railway (above). Leave the
   `SMTP_*` variables unset: when `SMTP_HOST` is set, SMTP is used instead of Resend.

## 2. Web on Vercel

1. Vercel: **Add New → Project**, and import this repository.
2. **Root Directory**: `apps/web`. Vercel detects Next.js, and Bun from `bun.lock`.
3. **Environment Variables**:

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_API_BASE_URL` | `https://api.vioraa.tech`. It is built into the site, so redeploy after changing it. The WebSocket address (`wss://…/ws`) comes from it. |
   | `GEMINI_API_KEY` | For Maya and the missions. Without it Maya answers from saved tips. |
   | `NVIDIA_API_KEY` | Optional. Email composer suggestions. |
   | `YOUTUBE_API_KEY` | Optional. Lounge TV search. |
   | `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` | Optional. Analytics. |

   `apps/web/.env.example` describes the rest (models, timeouts).
4. Deploy, then **Settings → Domains**: add `vioraa.tech` (and `www.vioraa.tech`) and the DNS
   records Vercel shows.

## 3. Check it end to end

1. `https://api.vioraa.tech/health` returns `{"status":"ok"}`.
2. Open `https://vioraa.tech`, sign up and create a space.
3. Join the same space from a second browser: both people should see each other move.
4. Send an email from the Email panel.

## Test the API image on your machine

From the repository root:

```bash
docker build -t clario-api .
```

The container needs the same variables as Railway. `host.docker.internal` reaches Postgres and Redis
running on your Mac:

```bash
docker run --rm -p 4000:3001 -e PORT=3001 -e JWT_SECRET=local-test -e DATABASE_URL=postgresql://USER:PASSWORD@host.docker.internal:5432/clario -e REDIS_URL=redis://host.docker.internal:6390 clario-api
```

## Good to know

- Both hosts redeploy on every push to `main`.
- Keep the API at one instance (Railway's default of one replica). Space-wide events (movement,
  chat, reactions, joins) already go through Redis pub/sub, but video-call signalling, private chat,
  task alerts, Game Room tables and the lounge TV are delivered and stored inside a single server
  process, so a second instance would break them for people connected to the other one.
- Migrations run when the container starts. Prisma takes a lock, so two instances starting together
  won't apply the same migration twice.
- Vercel preview deployments (`*.vercel.app`) aren't in `CORS_ORIGIN`, so they can't call the API
  unless you add their address.
- When a new package appears under `apps/` or `packages/`, add its `package.json` to the
  `Dockerfile`, or `bun install --frozen-lockfile` fails in the build.
- Free plans and prices change. Check Vercel's and Railway's pricing pages before you rely on them.
