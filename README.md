# 2D Metaverse

A TypeScript monorepo for a simple 2D metaverse app. The backend handles auth, spaces, maps, elements, avatars, and WebSocket movement. The frontend is a Next.js app that will become the client experience.

## Repository Layout

- `apps/web` - Next.js frontend.
- `apps/server` - Bun API and WebSocket server.
- `packages/db` - Prisma schema and shared database client.
- `packages/shared` - Shared Zod schemas and TypeScript types.
- `packages/ui` - Shared React UI components.

## Main Commands

```bash
bun install
bun run dev
bun run build
bun run lint
bun run check-types
```

## Backend

The server exposes REST endpoints under `/api/v1` and upgrades WebSocket connections at `/ws`.

Important areas:

- `apps/server/src/auth` - signup and signin.
- `apps/server/src/middleware/auth.ts` - JWT auth helper.
- `apps/server/src/space` - space and element APIs.
- `apps/server/src/ws` - realtime room and movement logic.

Environment variables:

```bash
DATABASE_URL=postgresql://...
JWT_SECRET=...
REDIS_URL=redis://localhost:6379
```

## Database

Prisma models live in `packages/db/prisma/schema.prisma`.

Run Prisma commands from `packages/db`:

```bash
bun run generate
bun run migrate
```

## Notes

The current realtime implementation keeps active room sockets in process memory. That is fine for local development, but production scaling will need Redis-backed presence and cross-server fanout before multiple WebSocket servers can share live room state.
