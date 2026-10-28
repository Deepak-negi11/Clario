# Database Package

Prisma schema and database client for the 2D Metaverse backend.

## Files

- `prisma/schema.prisma` - application models.
- `prisma/migrations` - database migrations.
- `index.ts` - shared Prisma client.

## Commands

```bash
bun run generate
bun run migrate
```

Set `DATABASE_URL` before running the server or Prisma commands.
