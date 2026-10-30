# Container for the Clario API (apps/server): Bun HTTP + WebSocket server with Prisma.
# Build from the repository root so the workspace packages it imports are included:
#   docker build -t clario-api .
# Railway, Render and Fly.io pick this file up automatically. The web app deploys separately (Vercel).
FROM oven/bun:1.3.13

WORKDIR /app

# Every workspace manifest first, so this install layer is reused until a dependency changes.
# Add a line here when a new package appears under apps/ or packages/.
COPY package.json bun.lock ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
COPY packages/eslint-config/package.json packages/eslint-config/
COPY packages/typescript-config/package.json packages/typescript-config/
# Only the root and the server (with the workspace packages it imports): leaving out the web app's
# packages roughly halves the image.
RUN bun install --frozen-lockfile --filter "./" --filter server

COPY packages/db packages/db
COPY packages/shared packages/shared
COPY apps/server apps/server
RUN bun run --cwd packages/db generate

# Set after the install so devDependencies (the Prisma CLI used for migrations) are still installed.
ENV NODE_ENV=production
EXPOSE 3001

# Apply any pending database migrations, then start the server on $PORT (Railway sets it).
CMD ["sh", "-c", "bun run --cwd packages/db migrate:deploy && cd apps/server && exec bun dev.ts"]
