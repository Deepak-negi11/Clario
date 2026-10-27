import { startServer } from "./index";

const port = Number(process.env.PORT ?? 3001);

startServer(port);
console.log(`Backend running on http://localhost:${port}`);

await new Promise(() => {});
