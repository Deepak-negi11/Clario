# Deploying Clario

Clario is two apps on two hosts:

| Part | Host | Why |
|---|---|---|
| `apps/web` (Next.js) | Vercel | Built for Next.js. Deploys on every push to `main`. |
| `apps/server` (Bun API + WebSocket), Postgres, Redis | One AWS EC2 server, with Docker Compose | Needs an always-on process for WebSockets, which serverless functions can't hold open. |

Domains (DNS at name.com):

| Record | Points to |
|---|---|
| `clario.games` (A) and `www.clario.games` (CNAME) | Vercel. `www.clario.games` is the main address; `clario.games` redirects to it. |
| `api.clario.games` (A) | The EC2 server's Elastic IP |

## 1. The API on AWS

The server runs four containers from `deploy/aws/docker-compose.yml`: the API (built from the
repository's `Dockerfile`), Postgres, Redis, and Caddy, which gets the HTTPS certificate for
`api.clario.games` itself (`deploy/aws/Caddyfile`) and passes requests, WebSockets included, to the API.

1. EC2: launch an Ubuntu 24.04 instance (`t3.small` is enough), with a key pair, and allow SSH from
   your IP plus HTTP and HTTPS from anywhere. Give it 20 GB of gp3 storage.
2. Allocate an Elastic IP, associate it with the instance, and point an A record for `api` at it.
3. Log in (`ssh -i ~/.ssh/<key>.pem ubuntu@<elastic-ip>`), then install Docker and add swap:

   ```bash
   curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker ubuntu
   sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile && echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
   ```

   Log out and in again so `docker` works without `sudo`.
4. Get the code and write the secrets (never committed; `.gitignore` and `.dockerignore` skip it):

   ```bash
   git clone https://github.com/Deepak-negi11/Clario.git && cd Clario
   cat > deploy/aws/.env <<EOF
   POSTGRES_PASSWORD=$(openssl rand -hex 24)
   JWT_SECRET=$(openssl rand -hex 32)
   CORS_ORIGIN=https://clario.games,https://www.clario.games
   TRUST_PROXY=true
   EMAIL_FROM=Clario <hello@clario.games>
   RESEND_API_KEY=
   GITHUB_TOKEN=
   EOF
   chmod 600 deploy/aws/.env
   ```

   - `TRUST_PROXY=true` is safe behind Caddy, which replaces any forwarded address the visitor sends.
   - `GITHUB_TOKEN` is optional; it lets the server rack panel read a team's GitHub repo more often.
5. Start everything (the first build takes a few minutes; migrations run each time the API starts):

   ```bash
   docker compose -f deploy/aws/docker-compose.yml up -d --build
   docker compose -f deploy/aws/docker-compose.yml logs api --tail 30
   ```

   Check `https://api.clario.games/health` returns `{"status":"ok"}`.

To deploy new API code after a push to `main`:

```bash
cd ~/Clario && git pull && docker compose -f deploy/aws/docker-compose.yml up -d --build api
```

After changing `deploy/aws/.env`, restart the API with `docker compose -f deploy/aws/docker-compose.yml up -d api`.

Back up the database now and then:

```bash
docker compose -f deploy/aws/docker-compose.yml exec db pg_dump -U clario clario > ~/backup-$(date +%F).sql
```

### Email: Resend

1. resend.com → **Domains → Add Domain** → `clario.games`, and add the records it shows at name.com
   (a DKIM TXT record, the sending records, and optionally DMARC). Wait until it says **Verified**.
2. Create an API key, put it in `deploy/aws/.env` as `RESEND_API_KEY`, and restart the API.
   Leave the `SMTP_*` variables unset: when `SMTP_HOST` is set, SMTP is used instead of Resend.

## 2. The website on Vercel

1. Vercel: **Add New → Project**, import this repository, and set **Root Directory** to `apps/web`.
2. **Environment Variables**:

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_API_BASE_URL` | `https://api.clario.games`. It is built into the site, so redeploy after changing it. The WebSocket address (`wss://…/ws`) comes from it. |
   | `NVIDIA_API_KEY` | The site's AI for the AI coworkers and email suggestions. |
   | `GEMINI_API_KEY` | For Maya and the missions. Without it Maya answers from saved tips. |
   | `YOUTUBE_API_KEY` | Optional. Lounge TV search. |
   | `GITHUB_TOKEN` | Optional. Lets the coworkers read more GitHub links per hour. |
   | `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` | Optional. Analytics. |

   `apps/web/.env.example` describes the rest (models, timeouts). Visitors' own AI keys stay in their
   browser and are never set here.
3. **Settings → Domains**: add `clario.games` and `www.clario.games`, and add the records Vercel shows
   at name.com.

## 3. Check it end to end

1. `https://api.clario.games/health` returns `{"status":"ok"}`.
2. Open `https://www.clario.games`, sign up and create a space.
3. Join the same space from a second browser: both people should see each other move.
4. Talk to a coworker, and send an email from the Email panel.

## Good to know

- Keep the API at one copy. Space-wide events (movement, chat, reactions, joins) go through Redis
  pub/sub, but video-call signalling, private chat, task alerts, Game Room tables and the lounge TV are
  delivered and stored inside a single server process.
- Video calls connect people directly, using a public STUN server. Some office and mobile networks
  block that; they would need a TURN relay, which isn't set up.
- Vercel preview deployments (`*.vercel.app`) aren't in `CORS_ORIGIN`, so they can't call the API
  unless you add their address.
- When a new package appears under `apps/` or `packages/`, add its `package.json` to the
  `Dockerfile`, or `bun install --frozen-lockfile` fails in the build.
- The AWS Free plan lasts up to six months (or until its credits run out). Before then, upgrade the
  account or move the API elsewhere; the same `Dockerfile` runs on Render or Railway.
- A brand-new domain can take a while to reach every network: a router that looked it up before it
  existed may keep answering "no such domain" for up to an hour.
