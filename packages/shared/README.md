# Shared

Shared schemas and TypeScript types used by the web and server apps.

## Contents

- `src/auth/auth.schema.ts` - signup and signin request validation.
- `src/ws/ws.schema.ts` - client and server WebSocket message schemas.

Export public schemas from `index.ts` so other workspace packages can import them through `@repo/shared`.
