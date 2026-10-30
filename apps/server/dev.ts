import { startServer } from "./index";

// Without a secret the server falls back to a public dev value, and anyone could sign valid login tokens.
if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
  console.error("JWT_SECRET must be set in production.");
  process.exit(1);
}

const port = Number(process.env.PORT ?? 3001);

startServer(port);
console.log(`Backend running on http://localhost:${port}`);

await new Promise(() => {});
